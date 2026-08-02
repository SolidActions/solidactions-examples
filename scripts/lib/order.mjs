import { parseYamlSubset } from './yaml-subset.mjs';

const EXPECTED_KEYS = ['separator', 'topics'];

/**
 * @param {string} text
 * @param {{ source: string }} options
 * @returns {{ topics: string[], separator: string }}
 */
export function parseOrder(text, { source }) {
  const data = parseYamlSubset(text, { source });

  const keys = Object.keys(data).sort();
  if (keys.length !== EXPECTED_KEYS.length || keys.some((key, i) => key !== EXPECTED_KEYS[i])) {
    throw new Error(`${source}: expected exactly keys ${JSON.stringify(EXPECTED_KEYS)}, found ${JSON.stringify(keys)}`);
  }

  if (!Array.isArray(data.topics) || data.topics.length === 0 || !data.topics.every((t) => typeof t === 'string')) {
    throw new Error(`${source}: "topics" must be a non-empty array of strings`);
  }
  if (typeof data.separator !== 'string') {
    throw new Error(`${source}: "separator" must be a string`);
  }

  return { topics: data.topics, separator: data.separator };
}
