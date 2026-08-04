import { parseYamlSubset } from './yaml-subset.mjs';

const OPEN_DELIMITER = '---\n';

/**
 * @param {string} text
 * @param {{ source: string }} options
 * @returns {{ data: Record<string, unknown>, body: string }}
 */
export function parseFrontMatter(text, { source }) {
  if (!text.startsWith(OPEN_DELIMITER)) {
    throw new Error(`${source}: missing opening "---" front-matter delimiter`);
  }

  let pos = OPEN_DELIMITER.length;
  while (true) {
    const newlineIdx = text.indexOf('\n', pos);
    if (newlineIdx === -1) {
      if (text.slice(pos) === '---') {
        const yamlText = text.slice(OPEN_DELIMITER.length, pos);
        return { data: parseYamlSubset(yamlText, { source }), body: '' };
      }
      throw new Error(`${source}: missing closing "---" front-matter delimiter`);
    }
    const lineContent = text.slice(pos, newlineIdx);
    if (lineContent === '---') {
      const yamlText = text.slice(OPEN_DELIMITER.length, pos);
      const body = text.slice(newlineIdx + 1);
      return { data: parseYamlSubset(yamlText, { source }), body };
    }
    pos = newlineIdx + 1;
  }
}
