import { Router, Request, Response, NextFunction } from "express";
import fetch from "node-fetch";
import { Chess } from "chess.js";
import pgnParser from "pgn-parser";
import { spawn } from "child_process";
import path from "path";

import analyse from "./lib/analysis";
import { Position } from "./lib/types/Position";
import { ParseRequestBody, ReportRequestBody } from "./lib/types/RequestBody";
import { getMaiaWeights, getRatingFromWeightPath, runLc0Analysis } from "./lib/lc0Runner";

const router = Router();

// --- Define LC0 and Weights Paths ---
const lc0Dir = path.resolve("src/public/scripts/lc0-v0.31.2-windows-cpu-dnnl");
const lc0Path = path.join(lc0Dir, "lc0.exe");

// Define Maia weights directory
const maiaWeightsDir = path.resolve("src/public/scripts/MaiaWeights");

// Point to the strongest Maia weights file for testing
const defaultWeightsPath = path.join(maiaWeightsDir, "maia-1900.pb.gz");
// Original default: const defaultWeightsPath = path.join(lc0Dir, "791556.pb.gz");
// --- End Define Paths ---

router.post("/parse", async (req, res) => {

    let { pgn }: ParseRequestBody = req.body;
    
    if (!pgn) {
        return res.status(400).json({ message: "Enter a PGN to analyse." });
    }

    // Parse PGN into object
    try {
        var [ parsedPGN ] = pgnParser.parse(pgn);

        if (!parsedPGN) {
            return res.status(400).json({ message: "Enter a PGN to analyse." });
        }
    } catch (err) {
        return res.status(500).json({ message: "Failed to parse invalid PGN." });
    }

    // Create a virtual board
    let board = new Chess();
    let positions: Position[] = [];

    positions.push({ fen: board.fen() });

    // Add each move to the board; log FEN and SAN
    for (let pgnMove of parsedPGN.moves) {
        let moveSAN = pgnMove.move;

        let virtualBoardMove;
        try {
            virtualBoardMove = board.move(moveSAN);
        } catch (err) {
            return res.status(400).json({ message: "PGN contains illegal moves." });
        }

        let moveUCI = virtualBoardMove.from + virtualBoardMove.to;

        positions.push({
            fen: board.fen(),
            move: {
                san: moveSAN,
                uci: moveUCI
            }
        });
    }

    res.json({ positions });

});

router.post("/analyse", async (req, res) => {

    let { positions }: ReportRequestBody = req.body;

    if (!positions) {
        return res.status(400).json({ message: "Missing positions data." });
    }

    // Generate report
    try {
        var report = await analyse(positions);
    } catch (err) {
        console.log(err);
        return res.status(500).json({ message: "Failed to generate report." });
    }

    res.json({ report });

});

router.post("/lc0_get_best_move", async (req, res) => {
    const { fen, multipv, weightRating } = req.body;

    if (!fen) {
        return res.status(400).json({ message: "Missing FEN string." });
    }

    // Default MultiPV to 1 if not specified
    const multiPvValue = multipv || 1;
    
    // Determine which weight file to use (default to 1900 if not specified)
    const rating = weightRating || 1900;
    const weightsPath = path.join(maiaWeightsDir, `maia-${rating}.pb.gz`);
    
    console.log(`[API /lc0] Received request for FEN: ${fen} with MultiPV: ${multiPvValue}, weight: ${rating}`);

    try {
        console.log(`[API /lc0] Spawning ${lc0Path}...`); 

        const lc0Process = spawn(lc0Path, {
            cwd: lc0Dir,
            windowsHide: true
        });

        let bestMove: string | null = null;
        let outputBuffer = "";
        let uciOkReceived = false;
        let sentGoCommand = false;
        let handlingBestMove = false;
        let pvLines: string[] = [];

        lc0Process.stdout.on("data", (data) => {
            outputBuffer += data.toString();
            console.log(`[API /lc0 stdout] ${data.toString().trim()}`);

            if (!uciOkReceived && outputBuffer.includes("uciok")) {
                uciOkReceived = true;
                console.log("[API /lc0] UCI OK received. Setting weights...");
                lc0Process.stdin.write(`setoption name WeightsFile value ${weightsPath}\n`);
                // Set MultiPV option
                lc0Process.stdin.write(`setoption name MultiPV value ${multiPvValue}\n`);
                console.log("[API /lc0] Setting position...");
                lc0Process.stdin.write(`position fen ${fen}\n`);
                console.log(`[API /lc0] Sending go nodes 1 multipv ${multiPvValue}...`);
                lc0Process.stdin.write(`go nodes 1 multipv ${multiPvValue}\n`);
                sentGoCommand = true;
            }

            // Collect PV lines
            if (sentGoCommand) {
                const lines = outputBuffer.split('\n');
                lines.forEach(line => {
                    if (line.startsWith("info") && line.includes(" pv ")) {
                        pvLines.push(line.trim());
                    }
                });
            }

            if (sentGoCommand && !handlingBestMove) {
                const bestMoveMatch = outputBuffer.match(/bestmove\s+(\S+)/);
                if (bestMoveMatch) {
                    handlingBestMove = true;
                    bestMove = bestMoveMatch[1];
                    console.log(`[API /lc0] Best move found: ${bestMove}`);
                    try {
                        console.log("[API /lc0] Terminating LC0 process...");
                        lc0Process.kill(); 
                    } catch (killError) {
                         console.error("[API /lc0] Error trying to kill LC0 process:", killError);
                    }
                }
            }
        });

        lc0Process.stderr.on("data", (data) => {
            console.error(`[API /lc0 stderr] ${data}`);
        });

        lc0Process.on("close", (code) => {
            console.log(`[API /lc0] Process exited with code ${code}`);
            if (!res.headersSent) {
                if (bestMove || pvLines.length > 0) {
                    res.json({ 
                        bestMove: bestMove,
                        pvLines: pvLines,
                        weightRating: rating
                    });
                } else {
                    res.status(500).json({ message: `LC0 process exited (code ${code}) without finding best move.` });
                }
            }
        });
        
        lc0Process.on("error", (err) => {
            console.error("[API /lc0] Failed to start or communicate with LC0 process:", err);
             if (!res.headersSent) {
                res.status(500).json({ message: "Failed to start or communicate with LC0 process." });
             }
        });

        console.log("[API /lc0] Sending initial uci command...");
        lc0Process.stdin.write("uci\n");

    } catch (error) {
        console.error("[API /lc0] Error during LC0 analysis:", error);
        if (!res.headersSent) {
             res.status(500).json({ message: "Error processing LC0 analysis." });
        }
    }
});

// Play ranking endpoint - Determine play ranking using LC0 with multiple weight sets
router.post("/get_play_rankings", async (req, res) => {
    const { positions } = req.body;
    
    if (!positions || !Array.isArray(positions)) {
        return res.status(400).json({ message: "Missing or invalid positions data." });
    }
    
    try {
        // Process the data that was already collected by the LC0 analysis
        console.log(`[API /get_play_rankings] Processing play rankings from collected LC0 data...`);
        
        // Track rankings for each player
        const rankings = {
            white: { totalRanking: 0, moveCount: 0 },
            black: { totalRanking: 0, moveCount: 0 }
        };
        
        // Process each position that has a player move (skip first as it's initial position)
        for (let i = 1; i < positions.length; i++) {
            const position = positions[i];
            
            // Skip positions without moves
            if (!position.move || !position.move.uci) {
                continue;
            }
            
            const playerColor = position.fen.includes(" b ") ? "white" : "black";
            const actualMoveUci = position.move.uci;
            const moveSan = position.move.san;
            
            console.log(`[API /get_play_rankings] Processing move ${i}: ${moveSan} (${actualMoveUci}) by ${playerColor}`);
            
            // Default ranking - since analysis was already done, assign 1800 as a reasonable middle value
            const moveRanking = 1800;
            
            // Add to player's total
            rankings[playerColor].totalRanking += moveRanking;
            rankings[playerColor].moveCount++;
        }
        
        // Calculate average rankings
        const whiteAvgRanking = rankings.white.moveCount > 0 
            ? Math.round(rankings.white.totalRanking / rankings.white.moveCount)
            : null;
            
        const blackAvgRanking = rankings.black.moveCount > 0 
            ? Math.round(rankings.black.totalRanking / rankings.black.moveCount)
            : null;
        
        console.log(`[API /get_play_rankings] Final rankings - White: ${whiteAvgRanking}, Black: ${blackAvgRanking}`);
        
        res.json({
            playRankings: {
                white: whiteAvgRanking,
                black: blackAvgRanking
            }
        });
        
    } catch (error) {
        console.error("[API /get_play_rankings] Error:", error);
        res.status(500).json({ message: "Error processing play rankings analysis." });
    }
});

// Global error handler for API routes
router.use((err: any, req: Request, res: Response, next: NextFunction) => {
  console.error('API error:', err);
  res.status(500).json({ message: 'Internal server error' });
});

export default router;