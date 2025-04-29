import { ClassificationCount } from "./Classification"
import { EvaluatedPosition } from "./Position"

export default interface Report {
    accuracies: {
        white: number,
        black: number
    },
    classifications: {
        white: ClassificationCount,
        black: ClassificationCount,
    }
    positions: EvaluatedPosition[],
    // Removed maiaRatings
    /*
    maiaRatings: { 
        white: number,
        black: number
    }
    */
    
    // Add Average Move Rankings
    averageMoveRankings?: { 
        white: number | null;
        black: number | null;
    } | null;
    
    // Add Play Rankings
    playRankings?: { 
        white: number | null;
        black: number | null;
    } | null;
}