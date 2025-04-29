let ongoingEvaluation = false;

// Remove redundant interface definition
/*
interface Report {
    accuracies: {
        white: number;
        black: number;
    };
    classifications: any; 
    positions: any[];     
    averageMoveRankings: { 
        white: number | null;
        black: number | null;
    } | null;
}
*/

let evaluatedPositions: Position[] = [];
// Assuming 'Report' type is available from types.ts or similar
let reportResults: Report | undefined;

function logAnalysisInfo(message: string) {
    $("#status-message").css("display", "block");
    
    $("#status-message").css("background", "rgba(49, 51, 56, 255)");
    $("#status-message").css("color", "white");
    $("#status-message").html(message);
}

function logAnalysisError(message: string) {
    $("#evaluation-progress-bar").css("display", "none");
    $("#secondary-message").html('');
    $("#status-message").css("padding", "10px 3px 10px 3px");
    $("#status-message").css("display", "block");
    $("#status-message").css("background", "rgba(239, 65, 70, 0.4");
    $("#status-message").css("color", "white");

    $("#status-message").html(`<i class="fa-solid fa-circle-info" style="color: #ffffff;"></i>` + message);

    ongoingEvaluation = false;
}

async function evaluate() {
    // Remove and reset CAPTCHA, remove report cards, display progress bar
    $("#report-cards").css("display", "none");
    $("#evaluation-progress-bar").css("display", "none");

    // Disallow evaluation if another evaluation is ongoing
    if (ongoingEvaluation) return;
    ongoingEvaluation = true;

    // Extract input PGN and target depth
    let pgn = $("#pgn").val()!.toString();
    let depth = parseInt($("#depth-slider").val()!.toString());

    // Content validate PGN input
    if (pgn.length == 0) {
        return logAnalysisError("Provide a game to analyse.");
    }

    // Post PGN to server to have it parsed
    $("#status-message").css("padding", "10px 3px 10px 3px");
    logAnalysisInfo("Parsing PGN...");

    try {
        let parseResponse = await fetch("/api/parse", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ pgn }),
        });

        let parsedPGN: ParseResponse = await parseResponse.json();

        if (!parseResponse.ok) {
            return logAnalysisError(
                parsedPGN.message ?? "Failed to parse PGN.",
            );
        }

        var positions = parsedPGN.positions!;
    } catch {
        return logAnalysisError("Failed to parse PGN.");
    }

    // Update board player usernames
    whitePlayer.username =
        pgn.match(/(?:\[White ")(.+)(?="\])/)?.[1] ?? "White Player";
    whitePlayer.rating = pgn.match(/(?:\[WhiteElo ")(.+)(?="\])/)?.[1] ?? "?";

    blackPlayer.username =
        pgn.match(/(?:\[Black ")(.+)(?="\])/)?.[1] ?? "Black Player";
    blackPlayer.rating = pgn.match(/(?:\[BlackElo ")(.+)(?="\])/)?.[1] ?? "?";

    updateBoardPlayers();

    $("#secondary-message").html("It can take around a minute to process a full game.");

    // Fetch cloud evaluations where possible
    for (let position of positions) {
        function placeCutoff(pos: Position) {
            let lastPosition = positions[positions.indexOf(pos) - 1];
            if (!lastPosition) return;

            let cutoffWorker = new Stockfish();
            cutoffWorker
                .evaluate(lastPosition.fen, depth)
                .then((engineLines) => {
                    lastPosition.cutoffEvaluation = engineLines.find(
                        (line) => line.id == 1,
                    )?.evaluation ?? { type: "cp", value: 0 };
                });
        }

        let queryFen = position.fen.replace(/\s/g, "%20");
        let cloudEvaluationResponse;
        let url = `https://lichess.org/api/cloud-eval?fen=${queryFen}&multiPv=2`;
        console.log(url)
        try {
            cloudEvaluationResponse = await fetch(
                url,
                {
                    method: "GET",
                },
            );

            if (!cloudEvaluationResponse) break;
        } catch {
            break;
        }

        if (!cloudEvaluationResponse.ok) {
            placeCutoff(position);
            break;
        }

        let cloudEvaluation = await cloudEvaluationResponse.json();

        position.topLines = cloudEvaluation.pvs.map((pv: any, id: number) => {
            const evaluationType = pv.cp == undefined ? "mate" : "cp";
            const evaluationScore = pv.cp ?? pv.mate ?? "cp";

            let line: EngineLine = {
                id: id + 1,
                depth: depth,
                moveUCI: pv.moves.split(" ")[0] ?? "",
                evaluation: {
                    type: evaluationType,
                    value: evaluationScore,
                },
            };

            let cloudUCIFixes: { [key: string]: string } = {
                e8h8: "e8g8",
                e1h1: "e1g1",
                e8a8: "e8c8",
                e1a1: "e1c1",
            };
            line.moveUCI = cloudUCIFixes[line.moveUCI] ?? line.moveUCI;

            return line;
        });

        if (position.topLines?.length != 2) {
            placeCutoff(position);
            break;
        }

        position.worker = "cloud";

        let progress =
            ((positions.indexOf(position) + 1) / positions.length) * 100;
        $("#evaluation-progress-bar").attr("value", progress);
        logAnalysisInfo(`Evaluating positions... (${progress.toFixed(1)}%)`);
    }

    // Evaluate remaining positions
    let workerCount = 0;

    const stockfishManager = setInterval(() => {
        // If all evaluations have been generated, move on
        
        if (!positions.some((pos) => !pos.topLines)) {
            clearInterval(stockfishManager);

            logAnalysisInfo("Evaluation complete.");
            $("#evaluation-progress-bar").val(100);
            $("#secondary-message").html("");

            evaluatedPositions = positions;
            ongoingEvaluation = false;

            generateReportFromEvaluations();
            
            return;
        }

        // Find next position with no worker and add new one
        for (let position of positions) {
            if (position.worker || workerCount >= 8) continue;

            let worker = new Stockfish();
            worker.evaluate(position.fen, depth).then((engineLines) => {
                position.topLines = engineLines;
                workerCount--;
            });

            position.worker = worker;
            workerCount++;
        }

        // Update progress monitor
        let workerDepths = 0;
        for (let position of positions) {
            if (typeof position.worker == "object") {
                workerDepths += position.worker.depth;
            } else if (typeof position.worker == "string") {
                workerDepths += depth;
            }
        }

        let progress = (workerDepths / (positions.length * depth)) * 100;

        $("#evaluation-progress-bar").attr("value", progress);
        logAnalysisInfo(`Evaluating positions... (${progress.toFixed(1)}%)`);
    }, 10);
}

function loadReportCards() {
    // Reset chess board, draw evaluation for starting position

    $("#status-message").css("display", "none");
    $("#status-message").css("padding", "0px");
    traverseMoves(-Infinity);

    // Reveal report cards and update accuracies
    $("#report-cards").css("display", "flex");

    if (!!reportResults) {
        $("#white-accuracy").html(`${reportResults.accuracies.white.toFixed(1)}%`);
        $("#black-accuracy").html(`${reportResults.accuracies.black.toFixed(1)}%`);
        
        // Update Average Move Ranking display
        if (reportResults.averageMoveRankings) {
            $("#white-average-ranking").html(`${reportResults.averageMoveRankings.white ?? '?'}`);
            $("#black-average-ranking").html(`${reportResults.averageMoveRankings.black ?? '?'}`);
        } else {
            // Display placeholders if data is missing
            $("#white-average-ranking").html('1900'); // Placeholder
            $("#black-average-ranking").html('1900'); // Placeholder
        }
        
        // Update Play Ranking display
        if (reportResults.playRankings) {
            $("#white-play-ranking").html(`${reportResults.playRankings.white ?? '?'}`);
            $("#black-play-ranking").html(`${reportResults.playRankings.black ?? '?'}`);
        } else {
            // Display placeholders if data is missing
            $("#white-play-ranking").html('1750'); // Placeholder
            $("#black-play-ranking").html('1750'); // Placeholder
        }

        // Remove Maia Ratings update
        /* 
        if (reportResults.maiaRatings) { 
            $("#white-maia-rating").html(`(Maia: ${reportResults.maiaRatings.white})`);
            $("#black-maia-rating").html(`(Maia: ${reportResults.maiaRatings.black})`);
        } else {
            // Hide or show default if no Maia data
            $("#white-maia-rating").html(`(Maia: ?)`); 
            $("#black-maia-rating").html(`(Maia: ?)`);
        }
        */

        // Initialize classification container for next analysis
        $("#classification-count-container").empty();

        // Make classification count section
        for (const classification of Object.keys(reportResults.classifications.white)) {
            if (classification === "book" || classification === "forced") continue;

            const classificationRow = $("<div>").prop({
                class: "classification-count-row"
            });
        
            // Create white's classification count
            const whiteClassificationCount = $("<div>").prop({
                class: "classification-count-white"
            }).css({
                color: classificationColours[classification]
            }).html(`${reportResults.classifications.white[classification as Classifications]}`);

            // Create black's classification count
            const blackClassificationCount = $("<div>").prop({
                class: "classification-count-black"
            }).css({
                color: classificationColours[classification]
            }).html(`${reportResults.classifications.black[classification as Classifications]}`);


            // Create classification icon and message
            const classificationContent = $("<div>").prop({
                class: "classification-count-content"
            });
            $(classificationIcons[classification]!).appendTo(classificationContent);
            $("<div>").html(`${classification}`)
            .css({
                color: classificationColours[classification]
            }).appendTo(classificationContent);


            // Add white's classification count
            whiteClassificationCount.appendTo(classificationRow);

            // Add classification icon and message
            classificationContent.appendTo(classificationRow);

            // Add black's classification count
            blackClassificationCount.appendTo(classificationRow);

            // Insert classification row
            classificationRow.appendTo("#classification-count-container");
        }
    } else {
        $("#black-accuracy").html("100%");
        $("#white-accuracy").html("100%");
    }

    // Remove progress bar and any status message
    $("#evaluation-progress-bar").css("display", "none");
    $("#status-message").css("display", "none");
    logAnalysisInfo("");
}

async function generateReportFromEvaluations() {
    // Set initial messages
    $("#status-message").css("display", "block");
    
    // --- Run Basic Maia Check for Play Rankings ---
    try {
        await runBasicMaiaCheck(evaluatedPositions);
    } catch (error) {
        console.error("Basic Maia check failed:", error);
        logAnalysisError("Maia analysis step failed. Report generation continuing without it.");
    }
    // --- End Basic Maia Check ---
    
    try {
        // Set messages just before fetch
        logAnalysisInfo("Submitting analysis results...");
        $("#secondary-message").html("Finalizing report...");

        // Post evaluations (only) to backend for full analysis
        let analysisResponse = await fetch("/api/analyse", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ 
                positions: evaluatedPositions
            }),
        });

        let analysisResult = await analysisResponse.json();

        if (!analysisResponse.ok) {
            return logAnalysisError(
                analysisResult.message ?? "Failed to generate report."
            );
        }

        reportResults = analysisResult.report;
        
        // Retrieve play rankings from localStorage that were calculated during Maia analysis
        try {
            logAnalysisInfo("Processing play rankings...");
            
            const storedRankings = localStorage.getItem('playRankings');
            if (storedRankings && reportResults) {
                reportResults.playRankings = JSON.parse(storedRankings);
                console.log("Play rankings received:", reportResults.playRankings);
            } else {
                // Use API if localStorage data isn't available
                const playRankingsResponse = await fetch("/api/get_play_rankings", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({ 
                        positions: evaluatedPositions
                    }),
                });
                
                if (playRankingsResponse.ok && reportResults) {
                    const playRankingsResult = await playRankingsResponse.json();
                    // Integrate play rankings into the report
                    if (playRankingsResult.playRankings) {
                        reportResults.playRankings = playRankingsResult.playRankings;
                        console.log("Play rankings received:", reportResults.playRankings);
                    }
                } else {
                    console.warn("Failed to get play rankings, using default values");
                }
            }
        } catch (error) {
            console.error("Error processing play rankings:", error);
            // Continue with report even if play rankings fail
        }
        
        loadReportCards();
        isNewGame = true;
    } catch {
        logAnalysisError("Failed to generate report.");
    }
}

// --- Basic Maia Check Implementation (using Backend API) ---
async function runBasicMaiaCheck(positions: Position[]) {
    logAnalysisInfo("Running Maia analysis...");
    const totalMoves = positions.length - 1;
    let progress = 0;

    // Track rankings for each player
    const playerRankings = {
        white: { totalRanking: 0, moveCount: 0 },
        black: { totalRanking: 0, moveCount: 0 }
    };

    // Available Maia weight ratings - from strongest to weakest
    const weightRatings = [1900, 1800, 1700, 1600, 1500, 1400, 1300, 1200, 1100];

    for (let i = 1; i < positions.length; i++) {
        const previousFen = positions[i - 1].fen;
        const position = positions[i];
        progress++;
        const progressPercent = ((progress / totalMoves) * 100).toFixed(1);
        logAnalysisInfo(`Running Maia analysis... (${progressPercent}%) Move ${progress}/${totalMoves}`);

        // Skip positions without moves
        if (!position.move || !position.move.uci) {
            continue;
        }

        const playerColor = position.fen.includes(" b ") ? "white" : "black";
        const actualMoveUci = position.move.uci;
        const moveSan = position.move.san;
        let moveRanking = null;

        // Try each weight rating from strongest to weakest
        for (const rating of weightRatings) {
            try {
                const multipvValue = Math.min(Math.floor(rating / 100), 19); // cap at 19
                console.log(`Checking move ${moveSan} with Maia-${rating} (multipv: ${multipvValue})...`);
                
                const response = await fetch("/api/lc0_get_best_move", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({ 
                        fen: previousFen,
                        multipv: multipvValue,
                        weightRating: rating
                    }),
                });

                if (!response.ok) {
                    const errorData = await response.json();
                    throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
                }

                const result = await response.json();
                if (result.pvLines && result.pvLines.length > 0) {
                    // Find the move's rank in the PV lines
                    let foundRank = null;
                    
                    for (const pvLine of result.pvLines) {
                        const moveMatch = pvLine.match(/multipv (\d+).*? pv ([a-h][1-8][a-h][1-8][qrbn]?)/i);
                        if (moveMatch && moveMatch.length >= 3) {
                            const rank = parseInt(moveMatch[1], 10);
                            const moveUci = moveMatch[2];
                            
                            if (moveUci === actualMoveUci) {
                                foundRank = rank;
                                break;
                            }
                        }
                    }
                    
                    if (foundRank !== null) {
                        // Apply penalty based on rank (100 points per rank position after 1st)
                        const penalty = (foundRank - 1) * 100;
                        moveRanking = Math.max(100, rating - penalty);
                        console.log(`Move ${moveSan} ranked by Maia-${rating} at position ${foundRank}, final rating: ${moveRanking}`);
                        break; // Found the highest weight that suggests this move
                    } else {
                        console.log(`Move ${moveSan} not suggested by Maia-${rating}`);
                    }
                }
            } catch (error) {
                console.error(`Error analyzing move ${i} with Maia-${rating}:`, error);
                // Continue to next weight file on error
            }
        }

        // If no model suggested this move, assign minimum rating
        if (moveRanking === null) {
            moveRanking = 100; // Minimum rating
            console.log(`Move ${moveSan} not suggested by any Maia model, assigning minimum: 100`);
        }

        // Add to player's total
        playerRankings[playerColor].totalRanking += moveRanking;
        playerRankings[playerColor].moveCount++;
        console.log(`Current ${playerColor} ranking: ${playerRankings[playerColor].totalRanking}/${playerRankings[playerColor].moveCount}`);
    }
    
    // Calculate average rankings
    const whiteAvgRanking = playerRankings.white.moveCount > 0 
        ? Math.round(playerRankings.white.totalRanking / playerRankings.white.moveCount)
        : null;
        
    const blackAvgRanking = playerRankings.black.moveCount > 0 
        ? Math.round(playerRankings.black.totalRanking / playerRankings.black.moveCount)
        : null;
    
    // Store rankings for later retrieval
    const finalRankings = {
        white: whiteAvgRanking,
        black: blackAvgRanking
    };
    
    localStorage.setItem('playRankings', JSON.stringify(finalRankings));
    console.log(`Final play rankings - White: ${whiteAvgRanking}, Black: ${blackAvgRanking}`);
    
    logAnalysisInfo("Maia analysis complete."); // Log completion only if loop finishes
}
// --- End Basic Maia Check ---

$("#review-settings-button").on("click", () => {
    $("#depth-container").toggle();
});

$("#review-button").on("click", () => {
    isNewGame = true;

    if ($("#load-type-dropdown").val() == "json") {
        try {
            let savedAnalysis: SavedAnalysis = JSON.parse($("#pgn").val()?.toString()!);

            whitePlayer = savedAnalysis.players.white;
            blackPlayer = savedAnalysis.players.black;
            updateBoardPlayers();

            reportResults = savedAnalysis.results;
            loadReportCards();
        } catch {
            logAnalysisError("Invalid savefile.");
        }
    } else {
        evaluate();
    }
});

$("#depth-slider").on("input", () => {
    let depth = parseInt($("#depth-slider").val()?.toString()!);

    if (depth <= 14) {
        $("#depth-counter").html(depth + `|<i class="fa-solid fa-bolt" style="color: #ffffff;"></i>`);
    } else if (depth <= 17) {
        $("#depth-counter").html(depth + `|<i class="fa-solid fa-wind" style="color: #ffffff;"></i>`);
    } else {
        $("#depth-counter").html(depth + `|<i class="fa-solid fa-hourglass-half" style="color: #ffffff;"></i>`);
    }
});
