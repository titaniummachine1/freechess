// src/utils/accuracyToRank.ts
// ---------------- configurable constants ----------------
export const FLOOR_RATING = 100;     // lowest rank boundary
export const TOP_RATING   = 3642;    // e.g. Stockfish CCRL max

// logistic function parameters
const K  = 0.0553;  // slope of the curve
const X0 = 87.46;   // mid-point in accuracy percentage

/**
 * Convert accuracy % (0–100) into a continuous Elo estimate using a logistic curve.
 * @param acc - Accuracy percentage (0–100)
 * @param top - Optional ceiling (defaults to TOP_RATING)
 * @param floor - Optional floor (defaults to FLOOR_RATING)
 */
export function accuracyToRank(
  acc: number,
  top: number = TOP_RATING,
  floor: number = FLOOR_RATING
): number {
  const v = floor + (top - floor) / (1 + Math.exp(-K * (acc - X0)));
  return Math.round(v);
} 