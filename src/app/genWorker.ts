/// <reference lib="webworker" />
import { generateEndlessLevel } from '../core/generator';

/**
 * Builds endless levels past the pre-built pool off the main thread: the guided generator with a
 * 1.5 s budget (the next level is prefetched while the current one is played).
 */
self.onmessage = (e: MessageEvent<{ id: string; n: number; seed?: number }>) => {
  const { id, n, seed } = e.data;
  try {
    const level = generateEndlessLevel(n, seed ?? 0x5eed, 1500);
    (self as unknown as Worker).postMessage({ id, level });
  } catch (err) {
    (self as unknown as Worker).postMessage({ id, level: null, error: String(err) });
  }
};
