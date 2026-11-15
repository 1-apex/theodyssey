// The typewriter timing, kept free of React so it can be tested.

export const MIN_CHARS_PER_SECOND = 38;
export const MAX_REVEAL_MS = 4000;

/** How long revealing `length` characters takes: about 38 chars a second, never over 4 seconds. */
export function revealDurationMs(length: number): number {
  if (length <= 0) return 0;
  const cps = Math.max(MIN_CHARS_PER_SECOND, length / (MAX_REVEAL_MS / 1000));
  return Math.round((length / cps) * 1000);
}

/** How many characters are visible `elapsedMs` after the reveal began. */
export function visibleChars(length: number, elapsedMs: number): number {
  const total = revealDurationMs(length);
  if (total === 0 || elapsedMs >= total) return length;
  return Math.max(0, Math.min(length, Math.floor((elapsedMs / total) * length)));
}
