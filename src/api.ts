import { Router } from "express";
import fetch from "node-fetch";
import { Chess } from "chess.js";
import pgnParser from "pgn-parser";
import { spawn } from "child_process";
import path from "path";

import analyse from "./lib/analysis";
import { Position } from "./lib/types/Position";
import { ParseRequestBody, ReportRequestBody } from "./lib/types/RequestBody";

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
    const { fen } = req.body;

    if (!fen) {
        return res.status(400).json({ message: "Missing FEN string." });
    }

    console.log(`[API /lc0] Received request for FEN: ${fen}`);

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

        lc0Process.stdout.on("data", (data) => {
            outputBuffer += data.toString();
            console.log(`[API /lc0 stdout] ${data.toString().trim()}`);

            if (!uciOkReceived && outputBuffer.includes("uciok")) {
                uciOkReceived = true;
                console.log("[API /lc0] UCI OK received. Setting weights and MultiPV...");
                lc0Process.stdin.write(`setoption name WeightsFile value ${defaultWeightsPath}\n`);
                lc0Process.stdin.write(`setoption name MultiPV value 300\n`);
                console.log("[API /lc0] Setting position...");
                lc0Process.stdin.write(`position fen ${fen}\n`);
                console.log("[API /lc0] Sending go nodes 1 multipv 300...");
                lc0Process.stdin.write("go nodes 1 multipv 300\n");
                sentGoCommand = true;
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
                if (bestMove) {
                    res.json({ bestMove: bestMove });
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

export default router;