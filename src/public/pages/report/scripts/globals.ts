// Define common types
export interface Profile {
    username: string;
    rating: string;
}

export interface Coordinate {
    x: number;
    y: number;
}

export interface EngineLine {
    id: number;
    evaluation: {
        type: string;
        value: number;
    };
    moveUCI: string;
    moveSAN: string;
    depth?: number; // Make depth optional to accommodate both use cases
}

export interface Position {
    fen: string;
    classification?: string;
    move?: {
        san: string;
        uci: string;
    };
    topLines?: EngineLine[];
    opening?: string;
    worker?: string;
    cutoffEvaluation?: any;
}

// Shared globals
export let currentMoveIndex = 0;
export let boardFlipped = false;
export let reportResults: any = null;
export let ongoingEvaluation = false;

// Setter functions for variables that need to be modified
export function setCurrentMoveIndex(value: number) {
    currentMoveIndex = value;
    return currentMoveIndex;
}

export function setBoardFlipped(value: boolean) {
    boardFlipped = value;
    return boardFlipped;
}

export let whitePlayer: Profile = {
    username: "White Player",
    rating: "?"
};

export let blackPlayer: Profile = {
    username: "Black Player",
    rating: "?"
};

export const classificationColours: {[key: string]: string} = {
    "brilliant": "#1baaa6",
    "great": "#5b8baf",
    "best": "#98bc49",
    "excellent": "#98bc49",
    "good": "#97af8b",
    "inaccuracy": "#f4bf44",
    "mistake": "#e28c28",
    "blunder": "#c93230",
    "forced": "#97af8b",
    "book": "#a88764"
};

// Declare function types that will be implemented in other modules
export let traverseMoves: (moveCount: number) => void;
export function setTraverseMoves(fn: (moveCount: number) => void) {
    traverseMoves = fn;
}

export let drawEvaluationBar: (evaluation: any, flipped: boolean, player: string) => void;
export function setDrawEvaluationBar(fn: (evaluation: any, flipped: boolean, player: string) => void) {
    drawEvaluationBar = fn;
}

export let drawEvaluationGraph: () => void;
export function setDrawEvaluationGraph(fn: () => void) {
    drawEvaluationGraph = fn;
}

export let drawBoard: (fen: string) => Promise<void>;
export function setDrawBoard(fn: (fen: string) => Promise<void>) {
    drawBoard = fn;
}

// Shared functions
export function updateBoardPlayers() {
    // Get profiles depending on board orientation
    let bottomPlayerProfile = boardFlipped ? blackPlayer : whitePlayer;
    let topPlayerProfile = boardFlipped ? whitePlayer : blackPlayer;

    // Remove <> characters to prevent XSS
    topPlayerProfile.username = topPlayerProfile.username.replace(/[<>]/g, "");
    topPlayerProfile.rating = topPlayerProfile.rating.replace(/[<>]/g, "");

    bottomPlayerProfile.username = bottomPlayerProfile.username.replace(/[<>]/g, "");
    bottomPlayerProfile.rating = bottomPlayerProfile.rating.replace(/[<>]/g, "");

    // Apply profiles to board
    $("#top-player-profile").html(`${topPlayerProfile.username} (${topPlayerProfile.rating})`);
    $("#bottom-player-profile").html(`${bottomPlayerProfile.username} (${bottomPlayerProfile.rating})`);
}

export function updateClassificationMessage(lastPosition: Position, position: Position) {
    const bestClassifications = [
        "brilliant",
        "great",
        "best",
        "book",
        "forced"
    ];

    if (position.classification) {
        let classificationMessages: { [key: string]: string } = {
            "great": "a great move",
            "good":"an okay move",
            "inaccuracy": "an inaccuracy",
            "mistake": "a mistake",
            "blunder": "a blunder",
            "book": "theory"
        };

        $("#classification-icon").attr("src", `/static/media/${position.classification}.png`);

        let message = classificationMessages[position.classification] ?? position.classification;
        $("#classification-message").html(`${position.move?.san} is ${message}`);
        $("#classification-message").css("color", classificationColours[position.classification]);

        $("#classification-message-container").css("display", "flex");

        if (bestClassifications.includes(position.classification)) {
            $("#top-alternative-message").css("display", "none");
        } else {
            let topAlternative = lastPosition.topLines?.[0].moveSAN;
            if (!topAlternative) return;

            $("#top-alternative-message").html(`Best was ${topAlternative}`);
            $("#top-alternative-message").css("display", "inline");
        }
    } else {
        $("#classification-message-container").css("display", "none");
        $("#top-alternative-message").css("display", "none");
    }
}

export function getMovedPlayer() {
    return (currentMoveIndex % 2) === 0 ? "black" : "white";
} 