/**
 * Global declarations for the report interface
 */

// Common interfaces
interface Profile {
    username: string;
    rating: string;
    aiLevel?: string;
}

interface Move {
    san: string;
    uci: string;
}

interface Evaluation {
    type: string;
    value: number;
}

interface EngineLine {
    id: number;
    depth: number;
    evaluation: Evaluation;
    moveUCI: string;
    moveSAN?: string;
}

interface Position {
    fen: string;
    move?: Move;
    topLines?: EngineLine[];
    cutoffEvaluation?: Evaluation;
    worker?: any;
    classification?: string;
    opening?: string;
}

type Classifications = 
    "brilliant" |
    "great" |
    "best" |
    "excellent" |
    "good" |
    "inaccuracy" |
    "mistake" |
    "blunder" |
    "book" |
    "forced";

interface ClassificationCount {
    [key: string]: number;
}

interface Report {
    accuracies: {
        white: number;
        black: number;
    };
    classifications: {
        white: ClassificationCount;
        black: ClassificationCount;
    };
    positions: Position[];
    averageMoveRankings?: {
        white: number | null;
        black: number | null;
    } | null;
    playRankings?: {
        white: number | null;
        black: number | null;
    } | null;
}

interface Coordinate {
    x: number;
    y: number;
}

interface SavedAnalysis {
    players: {
        white: Profile;
        black: Profile;
    };
    results: Report;
}

interface ParseResponse {
    message?: string;
    positions?: Position[];
}

// Declare global variables and functions

declare const reportResults: Report | undefined;
declare const evaluatedPositions: Position[];
declare const ongoingEvaluation: boolean;
declare const isNewGame: boolean;
declare const currentMoveIndex: number;
declare const boardFlipped: boolean;
declare const pieceImages: { [key: string]: HTMLImageElement };
declare const classificationIcons: { [key: string]: HTMLImageElement };
declare const classificationColours: { [key: string]: string };
declare const whitePlayer: Profile;
declare const blackPlayer: Profile;
declare const lastEvaluation: Evaluation;

// Declare global functions
declare function updateBoardPlayers(): void;
declare function traverseMoves(moveCount: number): void;
declare function drawEvaluationBar(evaluation: Evaluation, flipped: boolean, player: string): void;
declare function drawEvaluationGraph(): void;
declare function updateClassificationMessage(prevPosition: Position, currentPosition: Position): void;
declare function loadSprite(spriteName: string): Promise<HTMLImageElement>;