/**
 * Guards against the rot that produced solidactions-app#1103: prose telling
 * readers "schedule commands have no environment flag" is only true against
 * a specific CLI release. If the vendored manifest is ever re-pinned to a
 * release whose `schedule` subcommands gained an environment option (see
 * solidactions-cli#100), this must fail loudly instead of silently going
 * stale again.
 *
 * Pure and I/O-free so both the real-manifest test and a synthetic-manifest
 * regression test can call the same logic.
 */

const ENV_LONG_FLAGS = new Set(['--env', '--environment']);

/**
 * True if a manifest option object exposes an environment flag, matching
 * `-e`, `--env`, or `--environment` in either its `short` or `long` field.
 */
function optionExposesEnvFlag(option) {
  if (option.short === '-e') {
    return true;
  }
  return typeof option.long === 'string' && ENV_LONG_FLAGS.has(option.long);
}

/**
 * Walk every manifest command whose path starts with "schedule" (the root
 * command itself and every subcommand) and collect the ones exposing an
 * environment flag.
 *
 * @returns {Array<{ subcommand: string, flags: string[] }>}
 */
export function findScheduleEnvFlagExposures(manifest) {
  const exposures = [];
  for (const command of manifest.commands ?? []) {
    if (!Array.isArray(command.path) || command.path[0] !== 'schedule') {
      continue;
    }
    const matches = (command.options ?? []).filter(optionExposesEnvFlag);
    if (matches.length > 0) {
      exposures.push({
        subcommand: command.path.join(' '),
        flags: matches.map((option) => option.flags),
      });
    }
  }
  return exposures;
}

// Case-insensitive, deliberately loose so a reworded sentence ("have no
// environment flag" / "take no environment flag" / "takes no environment
// flag") still matches — the point is to survive innocuous rewording, not to
// pin exact prose.
const NO_ENV_FLAG_CLAIM_RE = /\b(?:have|has|take|takes)\s+no\s+environment\s+flag\b/i;

/**
 * True if some sentence of `markdown` both mentions "schedule" and asserts
 * the "no environment flag" claim. Splitting into sentences (rather than
 * scanning the whole document) keeps an unrelated "schedule" elsewhere in
 * the file from falsely anchoring the claim.
 */
export function claimsScheduleHasNoEnvFlag(markdown) {
  const sentences = markdown.split(/(?<=[.!?])\s+/);
  return sentences.some((sentence) => /schedule/i.test(sentence) && NO_ENV_FLAG_CLAIM_RE.test(sentence));
}

/**
 * The core invariant: if the manifest's `schedule` subcommands expose an
 * environment flag, the skill prose must not still claim they don't.
 *
 * @returns {{ ok: true } | { ok: false, message: string }}
 */
export function checkScheduleEnvFlagClaim(manifest, markdown) {
  const exposures = findScheduleEnvFlagExposures(manifest);
  if (exposures.length === 0) {
    return { ok: true };
  }
  if (!claimsScheduleHasNoEnvFlag(markdown)) {
    return { ok: true };
  }

  const version = manifest.cli_version ?? 'unknown';
  const flagList = exposures
    .map((exposure) => `${exposure.flags.join(', ')} on \`${exposure.subcommand}\``)
    .join('; ');
  const message =
    `content/command-manifest.json (CLI v${version}) now exposes ${flagList}, but ` +
    'content/skills/solidactions-deploy-and-config.md still tells readers schedule commands have no ' +
    "environment flag — update the skill's schedule guidance to document the flag " +
    '(see solidactions-app#1103).';
  return { ok: false, message };
}
