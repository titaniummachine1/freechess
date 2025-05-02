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

// Sigmoid mapping constants and helper
const FLOOR_RATING = 100;
const TOP_RATING   = 3642;
const K            = 0.0553;   // slope of logistic curve
const X0           = 87.46;    // mid-point in accuracy %
/**
 * Convert accuracy % → Elo via logistic curve
 */
function accuracyToRank(acc: number): number {
  const v = FLOOR_RATING
          + (TOP_RATING - FLOOR_RATING)
            / (1 + Math.exp(-K * (acc - X0)));
  return Math.round(v);
}

// Available Maia weight ratings for expanding search
const MAIA_WEIGHTS: number[] = [1100, 1300, 1400, 1500, 1600, 1700, 1800, 1900];

// Build spiral search order around a predicted rating
function buildSearchOrder(predicted: number, weights: number[]): number[] {
  const sorted = [...weights].sort((a, b) => a - b);
  let closestIndex = 0;
  let minDiff = Infinity;
  sorted.forEach((val, i) => {
    const diff = Math.abs(val - predicted);
    if (diff < minDiff) {
      minDiff = diff;
      closestIndex = i;
    }
  });
  const order: number[] = [closestIndex];
  for (let step = 1; step < sorted.length; step++) {
    const down = closestIndex - step;
    const up = closestIndex + step;
    if (down >= 0) order.push(down);
    if (up < sorted.length) order.push(up);
  }
  return order.map(i => sorted[i]);
}

// Expand Maia search per move using predicted base ratings
async function runMaiaExpanding(
  positions: Position[],
  predictedRatings: { white: number; black: number }
): Promise<{ white: number | null; black: number | null }> {
  const playerRankings = {
    white: { total: 0, count: 0 },
    black: { total: 0, count: 0 },
  };

  for (let i = 1; i < positions.length; i++) {
    const position = positions[i];
    if (!position.move?.uci) continue;
    const playerColor: 'white' | 'black' = position.fen.includes(' b ') ? 'white' : 'black';
    const actualMoveUci = position.move.uci;
    const predicted = predictedRatings[playerColor];
    const searchOrder = buildSearchOrder(predicted, MAIA_WEIGHTS);

    let moveRanking: number | null = null;
    for (const weight of searchOrder) {
      const multipv = Math.min(Math.floor(weight / 100), 19);
      try {
        const res = await fetch('/api/lc0_get_best_move', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fen: positions[i - 1].fen,
            multipv,
            weightRating: weight,
          }),
        });
        if (!res.ok) continue;
        const result = await res.json();
        let foundRank: number | null = null;
        for (const line of result.pvLines || []) {
          const m = (line as string).match(/multipv (\d+).*? pv ([a-h][1-8][a-h][1-8][qrbn]?)/i);
          if (m && m[2] === actualMoveUci) {
            foundRank = parseInt(m[1], 10);
            break;
          }
        }
        if (foundRank !== null) {
          const penalty = (foundRank - 1) * 100;
          moveRanking = Math.max(100, weight - penalty);
          break;
        }
      } catch (e) {
        console.error('Error checking weight', weight, e);
      }
    }
    if (moveRanking === null) {
      moveRanking = 100;
    }
    playerRankings[playerColor].total += moveRanking;
    playerRankings[playerColor].count++;
  }

  return {
    white: playerRankings.white.count > 0
      ? Math.round(playerRankings.white.total / playerRankings.white.count)
      : null,
    black: playerRankings.black.count > 0
      ? Math.round(playerRankings.black.total / playerRankings.black.count)
      : null,
  };
}

// NOTE: Removed JS interpolation helpers; progress fill handled directly via CSS transitions

// Display a status message; if `progress` provided, animate the green fill using background-size
function logAnalysisInfo(message: string, progress?: number) {
    const $status = $("#status-message");
    // Show status container
    $status.css({ display: "block", padding: "10px 3px", color: "white" });
    // Update status text
    $status.text(message);
    if (typeof progress === 'number') {
        // Animate fill: update background-size to `${progress}% 100%`
        const sizeVal = `${progress.toFixed(1)}% 100%`;
        $status.css({ 'background-size': sizeVal });
    } else {
        // Reset fill when no progress
        $status.css({ 'background-size': '0% 100%', 'background-color': 'var(--primary-color)' });
    }
}

function logAnalysisError(message: string) {
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
    // Initial progress will update on first Evaluating positions call

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

    // Create a single persistent Stockfish engine (multi-threaded internally)
    const engine = new Stockfish();

    // Kick off progress bar at 0% immediately
    logAnalysisInfo("Evaluating positions...", 0);

    // Fetch cloud evaluations where possible
    for (let position of positions) {
        function placeCutoff(pos: Position) {
            let lastPosition = positions[positions.indexOf(pos) - 1];
            if (!lastPosition) return;

            // Use the persistent engine for cutoff evaluation
            engine
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

        const progress = ((positions.indexOf(position) + 1) / positions.length) * 100;
        // Animate progress background on status-message with static text
        logAnalysisInfo("Evaluating positions...", progress);
    }

    // Evaluate remaining positions sequentially using the same engine
    for (let i = 0; i < positions.length; i++) {
        const position = positions[i];
        if (!position.topLines) {
            const progress = ((i + 1) / positions.length) * 100;
            logAnalysisInfo("Evaluating positions...", progress);
            const engineLines = await engine.evaluate(position.fen, depth);
            position.topLines = engineLines;
        }
    }
    // All done: first fill to 100%
    logAnalysisInfo("Evaluating positions...", 100);
    $("#secondary-message").html("");
    evaluatedPositions = positions;
    ongoingEvaluation = false;
    // Wait briefly so user sees full bar before completion message
    setTimeout(() => {
        logAnalysisInfo("Evaluation complete.");
        generateReportFromEvaluations();
    }, 500);
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
        $("#black-accuracy").html("0%");
        $("#white-accuracy").html("0%");
    }

    // Remove progress bar and any status messages
    $("#evaluation-progress-bar").css("display", "none");
    $("#status-message").css("display", "none");
    $("#secondary-message").css("display", "none");  // Hide lingering secondary message
    // No additional status update to avoid blank block
}

async function generateReportFromEvaluations() {
    // Set initial messages
    $("#status-message").css("display", "block");
    
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

        const report = analysisResult.report;
        reportResults = report;
        
        // Use predicted ratings as base and expand via Maia search
        const predictedRatings = {
          white: accuracyToRank(report.accuracies.white),
          black: accuracyToRank(report.accuracies.black)
        };
        try {
          const expanded = await runMaiaExpanding(evaluatedPositions, predictedRatings);
          report.playRankings = expanded;
          console.log("Expanded play rankings:", expanded);
        } catch (e) {
          console.error("Error in expanded search:", e);
          report.playRankings = predictedRatings;
        }
        
        loadReportCards();
        isNewGame = true;
    } catch {
        logAnalysisError("Failed to generate report.");
    }
}

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
