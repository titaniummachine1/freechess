// Ensure no previous declarations remain above this line

class Stockfish {

   /* private worker = new Worker(
        typeof WebAssembly == "object"
        ? "/static/scripts/stockfish-17-single.js"
        : "/static/scripts/stockfish-17-asm.js"
    ); */

    private worker: Worker;
    private enginePath: string;

    depth = 0;

    constructor(enginePath?: string) {
        // Access the function via the window object
        this.enginePath = enginePath || (window as any).getSelectedEnginePath();
        try {
            this.worker = new Worker(this.enginePath);
        } catch (e) {
            console.error(`Failed to load selected engine: ${this.enginePath}. Falling back.`, e);
            // Fallback logic - use the ASM or a known good path
            this.enginePath = '/static/scripts/stockfish-17-asm.js'; // Or stockfish.js
            this.worker = new Worker(this.enginePath);
        }
        this.worker.postMessage("uci");
        this.worker.postMessage("setoption name MultiPV value 2");
        
        // Set threads automatically based on hardware concurrency
        try {
            const hardwareConcurrency = navigator.hardwareConcurrency;
            if (hardwareConcurrency && hardwareConcurrency > 0) {
                // Use one less core than available, but at least 1
                const threads = Math.max(1, hardwareConcurrency - 1);
                this.worker.postMessage("setoption name Threads value " + threads);
                console.log(`Stockfish using ${threads} threads (based on ${hardwareConcurrency} logical cores).`);
            } else {
                // Default to 1 thread if concurrency info is unavailable
                this.worker.postMessage("setoption name Threads value 1");
                console.log("Stockfish using default 1 thread (hardwareConcurrency not available).");
            }
        } catch (e) {
            console.error("Failed to set Stockfish threads:", e);
            // Fallback to 1 thread in case of error
            this.worker.postMessage("setoption name Threads value 1");
        }
    }

    async evaluate(fen: string, targetDepth: number, verbose: boolean = false): Promise<EngineLine[]> {
        this.worker.postMessage("position fen " + fen);
        this.worker.postMessage("go depth " + targetDepth);

        const messages: string[] = [];
        const lines: EngineLine[] = [];

        return new Promise(res => {
            this.worker.addEventListener("message", event => {
                let message: string = event.data;
                messages.unshift(message);

                if (verbose) console.log(message);

                // Get latest depth for progress monitoring
                let latestDepth = parseInt(message.match(/(?:depth )(\d+)/)?.[1] || "0");
                this.depth = Math.max(latestDepth, this.depth);

                // Best move or checkmate log indicates end of search
                if (message.startsWith("bestmove") || message.includes("depth 0")) {            
                    let searchMessages = messages.filter(msg => msg.startsWith("info depth"));

                    for (let searchMessage of searchMessages) {
                        // Extract depth, MultiPV line ID and evaluation from search message
                        let idString = searchMessage.match(/(?:multipv )(\d+)/)?.[1];
                        let depthString = searchMessage.match(/(?:depth )(\d+)/)?.[1];

                        let moveUCI = searchMessage.match(/(?: pv )(.+?)(?= |$)/)?.[1];

                        let evaluation: Evaluation = {
                            type: searchMessage.includes(" cp ") ? "cp" : "mate",
                            value: parseInt(searchMessage.match(/(?:(?:cp )|(?:mate ))([\d-]+)/)?.[1] || "0")
                        };

                        // Invert evaluation if black to play since scores are from black perspective
                        // and we want them always from the perspective of white
                        if (fen.includes(" b ")) {
                            evaluation.value *= -1;
                        }

                        // If any piece of data from message is missing, discard message
                        if (!idString || !depthString || !moveUCI) continue;

                        let id = parseInt(idString);
                        let depth = parseInt(depthString);

                        // Discard if target depth not reached or lineID already present
                        if (depth != targetDepth || lines.some(line => line.id == id)) continue;
                        
                        lines.push({
                            id,
                            depth,
                            evaluation,
                            moveUCI
                        });
                    }

                    this.worker.terminate();
                    res(lines);
                }
            });

            this.worker.addEventListener("error", () => {
                // Terminate the current Stockfish, switch to Stockfish 11 as fallback engine
                console.error(`Worker error for engine: ${this.enginePath}. Falling back to ASM.`);
                this.worker.terminate();
                // Use a known fallback path directly
                const fallbackPath = "/static/scripts/stockfish-17-asm.js"; // Or stockfish.js
                this.worker = new Worker(fallbackPath);
                this.enginePath = fallbackPath; // Update the current path

                this.worker.postMessage("uci");
                this.worker.postMessage("setoption name MultiPV value 2");
                
                this.evaluate(fen, targetDepth, verbose).then(res);
            });
        });
    }

}
