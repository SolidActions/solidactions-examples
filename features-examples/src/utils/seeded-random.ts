/**
 * Seeded Random Number Generator
 *
 * Provides deterministic randomness for testing. When a seed is supplied
 * (workflows pass `process.env.SOLIDACTIONS_TEST_SEED` — a reserved system var
 * excluded from ctx.vars by design), all random values will be reproducible.
 *
 * Uses a simple mulberry32 PRNG algorithm.
 *
 * The PRNG is lazily initialized: a workflow calls `seedRandom(seed)` once at
 * the top of its run() body to pin the sequence.
 * If `seededRandom()` is called before any explicit seed, it falls back to a
 * time-based seed — matching the original module-load behavior.
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

// Global seeded random instance (lazily initialized via seedRandom()).
let rng: (() => number) | null = null;

/**
 * Initialize the global seeded PRNG.
 *
 * Workflows call this once at the top of their run() body, passing
 * `process.env.SOLIDACTIONS_TEST_SEED` (a reserved system var, excluded from
 * ctx.vars). When a seed is provided, the subsequent `seededRandom()` sequence
 * is deterministic; otherwise a time-based seed is used (same fallback as the
 * original module-load behavior).
 *
 * @param seed - Optional string seed. Falsy values fall back to Date.now().
 */
export function seedRandom(seed?: string): void {
  rng = createSeededRandom(seed || String(Date.now()));
}

/**
 * Get a random number between 0 and 1 using the global seeded PRNG.
 * When seeded via seedRandom(), results are deterministic.
 *
 * @returns Random number between 0 (inclusive) and 1 (exclusive)
 */
export function seededRandom(): number {
  if (rng === null) {
    rng = createSeededRandom(String(Date.now()));
  }
  return rng();
}
