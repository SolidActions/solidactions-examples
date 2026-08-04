/**
 * assert.strictEqual's default failure message on ~2KB of prose is useless
 * (a wall of diff-less text). Build a message naming the first differing
 * byte offset and a small window of context around it, but still assert
 * with strictEqual so this is genuinely a `===` check on the full strings.
 */
export function diffMessage(actual, expected, label) {
  if (actual === expected) {
    return undefined;
  }
  const len = Math.min(actual.length, expected.length);
  let i = 0;
  while (i < len && actual[i] === expected[i]) {
    i++;
  }
  const start = Math.max(0, i - 20);
  return [
    `${label}: strings differ at byte offset ${i}`,
    `  (expected length ${expected.length}, actual length ${actual.length})`,
    `  expected: ...${JSON.stringify(expected.slice(start, i + 20))}...`,
    `  actual:   ...${JSON.stringify(actual.slice(start, i + 20))}...`,
  ].join('\n');
}
