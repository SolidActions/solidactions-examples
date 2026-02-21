/**
 * Seeded Random Number Generator
 *
 * Provides deterministic randomness for testing. When SOLIDACTIONS_TEST_SEED
 * is set, all random values will be reproducible.
 *
 * Uses a simple mulberry32 PRNG algorithm.
 */

/**
 * Create a seeded random number generator
 * @param seed - String seed to initialize the PRNG
 * @returns Function that returns random numbers between 0 and 1
 */
export function createSeededRandom(seed: string): () => number {
  // Convert string seed to a number using a simple hash
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    const char = seed.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }

  // Mulberry32 PRNG
  let state = hash >>> 0;

  return function(): number {
    state = (state + 0x6D2B79F5) | 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Global seeded random instance
// Uses SOLIDACTIONS_TEST_SEED env var for deterministic testing
const rng = createSeededRandom(
  process.env.SOLIDACTIONS_TEST_SEED || String(Date.now())
);

/**
 * Get a random number between 0 and 1 using the global seeded PRNG.
 * When SOLIDACTIONS_TEST_SEED is set, results are deterministic.
 *
 * @returns Random number between 0 (inclusive) and 1 (exclusive)
 */
export function seededRandom(): number {
  return rng();
}
