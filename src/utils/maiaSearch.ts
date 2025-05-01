import { accuracyToRank } from './accuracyToRank';
import { MAIA_BUCKETS, phaseWeight, BLEND_SIGMOID, BLEND_MAIA, WEIGHT_PATH } from './constants';

export type MoveWithFen = { fen: string; move: string; ply: number };

/** Step 2: pick the closest bucket to a seed Elo */
export function closestBucket(seed: number): typeof MAIA_BUCKETS[number] {
  return MAIA_BUCKETS.reduce((best, b) =>
    Math.abs(b - seed) < Math.abs(best - seed) ? b : best
  );
}

/** Step 3: spawn a web-worker wrapping LC0 policy eval */
export function spawnMaiaWorker(elo: typeof MAIA_BUCKETS[number]): Worker {
  const w = new Worker('/static/scripts/lc0-worker.js');
  w.postMessage({ type: 'init', weights: WEIGHT_PATH(elo) });
  return w;
}

export type LogProbVec = Record<number, number>;

/** Step 3: ask each worker for log-prob of move */
export async function getLogProbVec(
  workers: Map<number, Worker>,
  fen: string,
  move: string
): Promise<LogProbVec> {
  const out: LogProbVec = {} as any;
  await Promise.all(MAIA_BUCKETS.map(elo =>
    new Promise<void>(res => {
      const w = workers.get(elo)!;
      const onMsg = (e: MessageEvent) => {
        if (e.data.fen !== fen) return;
        out[elo] = e.data.logP;
        w.removeEventListener('message', onMsg);
        res();
      };
      w.addEventListener('message', onMsg);
      w.postMessage({ type: 'evalMove', fen, move });
    })
  ));
  return out;
}

/** Step 4: weight each bucket's logP by board phase */
export async function perMoveWeights(
  workers: Map<number, Worker>,
  fen: string,
  move: string,
  ply: number
): Promise<LogProbVec> {
  const vec = await getLogProbVec(workers, fen, move);
  const w   = phaseWeight(ply);
  for (const elo of MAIA_BUCKETS) vec[elo] *= w;
  return vec;
}

/** Step 5: accumulate per-move weights into a total log-sum distribution */
export async function accumulateGame(
  gameMoves: MoveWithFen[],
  workers: Map<number, Worker>
): Promise<Record<number, number>> {
  const logSum = {} as Record<number, number>;
  MAIA_BUCKETS.forEach(e => logSum[e] = 0);
  for (const { fen, move, ply } of gameMoves) {
    const lv = await perMoveWeights(workers, fen, move, ply);
    MAIA_BUCKETS.forEach(e => logSum[e] += lv[e]);
  }
  return logSum;
}

/** Step 6: convert log-sums → continuous Elo via softmax */
export function logSumToElo(logSum: Record<number, number>): number {
  const probs = MAIA_BUCKETS.map(e => Math.exp(logSum[e]));
  const Z     = probs.reduce((a, b) => a + b, 0);
  return MAIA_BUCKETS.reduce((sum, e, i) => sum + e * probs[i] / Z, 0);
}

/** Step 7: overall pipeline, blend sigmoid seed + Maia evidence */
export async function estimateRating(
  gameMoves: MoveWithFen[],
  accuracyPct: number
): Promise<number> {
  // 1) seed via logistic sigmoid
  const seed   = accuracyToRank(accuracyPct);
  // 2) spin up one worker per bucket
  const workers = new Map<number, Worker>();
  MAIA_BUCKETS.forEach(e => workers.set(e, spawnMaiaWorker(e)));
  // 3) aggregate game-level log-sum
  const logSum = await accumulateGame(gameMoves, workers);
  // 4) convert to continuous Maia Elo
  const maiaElo = logSumToElo(logSum);
  // 5) blend with seed
  return BLEND_SIGMOID * seed + BLEND_MAIA * maiaElo;
} 