/**
 * Rating utility functions for converting accuracy to Elo rating
 */

// Anchor pairs for exponential fit
const anchors: [number, number][] = [
  [57.7, 600], [60.8, 650], [62.4, 700],
  [70.8, 1100], [73.2, 1100], [75.6, 1400],
  [75.7, 1350], [77.0, 1500], [79.1, 1600],
  [79.2, 1600], [87.3, 1900], [94.1, 1950]
];

// Coefficients from exponential fit: y = a * e^(b * x)
const DEFAULT_COEFFICIENTS = {
  a: 74.7719,
  b: 0.0372985
};

interface Coefficients {
  a: number;
  b: number;
}

/**
 * Performs exponential fit in log-space
 * @param points - Array of [x, y] pairs
 * @returns Coefficients { a, b } for y = a * e^(b * x)
 */
export function fitExp(points: [number, number][]): Coefficients {
  const n = points.length;
  let sumX = 0, sumLnY = 0;
  
  for (const [x, y] of points) { 
    sumX += x; 
    sumLnY += Math.log(y); 
  }
  
  const meanX = sumX / n;
  const meanLnY = sumLnY / n;

  let num = 0, den = 0;
  for (const [x, y] of points) {
    num += (x - meanX) * (Math.log(y) - meanLnY);
    den += (x - meanX) ** 2;
  }
  
  const b = num / den;
  const a = Math.exp(meanLnY - b * meanX);
  
  return { a, b }; // y = a * e^(b * x)
}

/**
 * Convert accuracy percentage to Elo rating using exponential model
 * @param accuracy - Accuracy percentage (0-100)
 * @param coefficients - Optional coefficients { a, b }
 * @returns Estimated Elo rating
 */
export function accuracyToRating(accuracy: number, coefficients: Coefficients = DEFAULT_COEFFICIENTS): number {
  const { a, b } = coefficients;
  return Math.round(a * Math.exp(b * accuracy));
}

/**
 * Calculate estimated play strength based on accuracy and player rating
 * @param accuracy - Accuracy percentage (0-100)
 * @param playerRating - Player's actual Elo rating (if available)
 * @param maxBias - Maximum allowed bias from player rating (default: 200)
 * @returns Estimated play strength
 */
export function calculatePlayStrength(accuracy: number, playerRating: number | null = null, maxBias: number = 200): number {
  // Convert accuracy to estimated rating
  const estimatedRating = accuracyToRating(accuracy);
  
  // If player rating is not available, use the raw estimated rating
  if (!playerRating) {
    return estimatedRating;
  }
  
  // Calculate the difference between estimated and player rating
  const diff = estimatedRating - playerRating;
  
  // Apply limits to the bias
  const bias = Math.max(-maxBias, Math.min(maxBias, diff));
  
  // Return player's rating plus the limited bias
  return Math.round(playerRating + bias);
} 