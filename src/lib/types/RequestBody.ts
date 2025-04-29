import { EvaluatedPosition } from "./Position";

export interface ParseRequestBody {
    pgn?: string;
}

export interface ReportRequestBody {
    positions?: EvaluatedPosition[]
    // Removed maiaRatings
    /*
    maiaRatings?: { 
        white: number,
        black: number
    }
    */
}