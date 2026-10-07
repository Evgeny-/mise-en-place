/// <reference lib="webworker" />
import { generateEndlessLevel } from '../core/generator';

/** Builds endless levels off the main thread (a few milliseconds to tens of ms each). */
self.onmessage = (e: MessageEvent<{ id: string; n: number; seed?: number }>) => {
  const { id, n, seed } = e.data;
  try {
    const level = generateEndlessLevel(n, seed ?? 0x5eed, 250);
    (self as unknown as Worker).postMessage({ id, level });
  } catch (err) {
    (self as unknown as Worker).postMessage({ id, level: null, error: String(err) });
  }
};
