// src/utils/constants.ts

// Available Maia weight buckets
export const MAIA_BUCKETS = [1100, 1200, 1300, 1400, 1500, 1600, 1700, 1800, 1900] as const;
export type MaiaBucket = typeof MAIA_BUCKETS[number];

// Path resolver for weight files (adjust to your public static setup)
export const WEIGHT_PATH = (elo: MaiaBucket) => `/static/scripts/lc0-v0.31.2-windows-cpu-dnnl/MaiaWeights/maia-${elo}.pb.gz`;

// Phase weighting: penalise opening moves, full mid-game, light endgame
export function phaseWeight(ply: number): number {
  if (ply < 15) return 0.50;
  if (ply < 60) return 1.00;
  return 0.80;
}

// Blend ratios: how much to trust sigmoid seed vs. Maia evidence
export const BLEND_SIGMOID = 0.4;
export const BLEND_MAIA    = 0.6; 