import { spawn, ChildProcessWithoutNullStreams } from "child_process";
import path from "path";
import fs from "fs/promises";

// --- Paths ---
const lc0Dir = path.resolve("src/public/scripts/lc0-v0.31.2-windows-cpu-dnnl");
const lc0Path = path.join(lc0Dir, "lc0.exe");
const maiaWeightsDir = path.resolve("src/public/scripts/MaiaWeights");

// --- Types ---
export interface Lc0Result {
    bestMove: string | null;
    pvLines: string[]; // Raw 'info ... pv ...' lines
}

export interface Lc0Options {
    weightsPath: string;
    fen: string;
    command: string; // e.g., "go nodes 1", "go nodes 1 multipv 5"
}

// --- Functions ---

/**
 * Gets the list of available Maia weights files, sorted by rating descending.
 */
export async function getMaiaWeights(): Promise<string[]> {
    try {
        const files = await fs.readdir(maiaWeightsDir);
        return files
            .filter(file => file.startsWith('maia-') && file.endsWith('.pb.gz'))
            .map(file => path.join(maiaWeightsDir, file))
            .sort((a, b) => {
                const ratingA = parseInt(a.match(/maia-(\d+)\.pb\.gz$/)?.[1] || '0');
                const ratingB = parseInt(b.match(/maia-(\d+)\.pb\.gz$/)?.[1] || '0');
                return ratingB - ratingA; // Descending sort
            });
    } catch (error) {
        console.error("[LC0 Runner] Error reading Maia weights directory:", error);
        return [];
    }
}

/**
 * Extracts the rating number from a Maia weights file path.
 */
export function getRatingFromWeightPath(weightPath: string): number | null {
     const match = weightPath.match(/maia-(\d+)\.pb\.gz$/);
     return match ? parseInt(match[1]) : null;
}


/**
 * Runs the LC0 engine with specified options and returns the analysis results.
 */
export function runLc0Analysis(options: Lc0Options): Promise<Lc0Result> {
    return new Promise((resolve, reject) => {
        console.log(`[LC0 Runner] Spawning ${lc0Path} for FEN: ${options.fen} with weights: ${path.basename(options.weightsPath)} and command: ${options.command}`);
        let lc0Process: ChildProcessWithoutNullStreams | null = null;
        let outputBuffer = "";
        let uciOkReceived = false;
        let sentGoCommand = false;
        let analysisComplete = false;

        const result: Lc0Result = {
            bestMove: null,
            pvLines: []
        };

        try {
             lc0Process = spawn(lc0Path, {
                cwd: lc0Dir, // Run LC0 from its directory
                windowsHide: true,
            });
        } catch (spawnError) {
             console.error("[LC0 Runner] Failed to spawn LC0 process:", spawnError);
             return reject(new Error("Failed to spawn LC0 process"));
        }

        const killProcess = (reason: string) => {
            if (lc0Process && !lc0Process.killed) {
                console.log(`[LC0 Runner] Terminating LC0 process (${reason})...`);
                lc0Process.kill();
                lc0Process = null; // Prevent further operations
            }
        };

        // Timeout to prevent hangs
        const timeoutId = setTimeout(() => {
             if (!analysisComplete) {
                 console.error(`[LC0 Runner] Analysis timed out for FEN: ${options.fen}`);
                 killProcess("timeout");
                 reject(new Error(`LC0 analysis timed out`));
             }
        }, 90000); // Increased timeout to 90 seconds

        lc0Process.stdout.on("data", (data) => {
            if (analysisComplete) return; // Don't process data after completion/kill
            const output = data.toString();
            outputBuffer += output;
             // console.log(`[LC0 Runner stdout] ${output.trim()}`); // Can be noisy

            // Check for UCI OK
            if (!uciOkReceived && outputBuffer.includes("uciok")) {
                uciOkReceived = true;
                console.log("[LC0 Runner] UCI OK received. Setting options...");
                lc0Process?.stdin.write(`setoption name WeightsFile value ${options.weightsPath}\n`);
                // Ensure MultiPV is set if requested in command (LC0 might reset it)
                 if (options.command.includes("multipv")) {
                     const multiPvValue = options.command.split("multipv ")[1]?.split(" ")[0] ?? "1";
                     lc0Process?.stdin.write(`setoption name MultiPV value ${multiPvValue}\n`);
                 }
                lc0Process?.stdin.write(`position fen ${options.fen}\n`);
                console.log(`[LC0 Runner] Sending command: ${options.command}`);
                lc0Process?.stdin.write(`${options.command}\n`);
                sentGoCommand = true;
            }

            // Process info lines
            if (sentGoCommand) {
                 const lines = outputBuffer.split('\n');
                 lines.forEach(line => {
                     if (line.startsWith("info") && line.includes(" pv ")) {
                         result.pvLines.push(line.trim());
                     }
                 });
                 // Keep only the last part of the buffer in case a line was split
                 outputBuffer = lines[lines.length - 1] ?? ""; 
            }

            // Check for bestmove
            const bestMoveMatch = outputBuffer.match(/bestmove\s+(\S+)/);
            if (bestMoveMatch && !analysisComplete) {
                 analysisComplete = true; // Mark as complete
                 clearTimeout(timeoutId); // Clear the timeout
                 result.bestMove = bestMoveMatch[1];
                 console.log(`[LC0 Runner] Best move found: ${result.bestMove}`);
                 killProcess("bestmove received");
                 resolve(result); // Resolve the promise
            }
        });

        lc0Process.stderr.on("data", (data) => {
            // Ignore routine stderr messages if necessary, log errors
            const errorMsg = data.toString().trim();
            if (errorMsg && !errorMsg.startsWith("Creating backend") && !errorMsg.startsWith("Detected") && !errorMsg.startsWith("Group") && !errorMsg.startsWith("BLAS") && !errorMsg.startsWith("Loading weights file")) {
                 console.error(`[LC0 Runner stderr] ${errorMsg}`);
            }
        });

        lc0Process.on("close", (code) => {
             clearTimeout(timeoutId);
             console.log(`[LC0 Runner] Process exited with code ${code}`);
             if (!analysisComplete) { // If exited before finding bestmove
                 analysisComplete = true;
                 // Check if we got any PV lines even if bestmove wasn't printed (can happen with nodes 1?)
                 if (result.pvLines.length > 0 && options.command.includes("multipv")) {
                    console.warn(`[LC0 Runner] Process exited (code ${code}) before bestmove, but PV lines found. Resolving with partial data.`);
                    resolve(result);
                 } else {
                    console.error(`[LC0 Runner] Process exited (code ${code}) without completing analysis.`);
                    reject(new Error(`LC0 process exited (code ${code}) before completing analysis.`));
                 }
             }
             // If analysisComplete was already true, the promise is already resolved/rejected.
        });

        lc0Process.on("error", (err) => {
            clearTimeout(timeoutId);
            if (!analysisComplete) {
                 analysisComplete = true;
                 console.error("[LC0 Runner] LC0 process error:", err);
                 killProcess("process error");
                 reject(err);
            }
        });

        // Send initial UCI command
         console.log("[LC0 Runner] Sending initial uci command...");
         lc0Process.stdin.write("uci\n");
    });
} 