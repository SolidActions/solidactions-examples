# content/

Source-of-truth prose and data for SolidActions' documentation, guides, and
skills. See `tests/content/` for what validates it.

## Where prose may be edited during the migration window

`content/guide/` and `content/pages/` are **frozen**. Both are byte-for-byte
extractions — proof that migrating this prose out of the app and marketing
repos changed nothing — pinned by the goldens under `tests/golden/` and
compared with `assert.strictEqual`. Any added or reworded sentence there fails
that comparison by design, and the topic list in `content/guide/_order.yaml`
is mirrored in the tests, so it's equally locked. During the window, a change
to that prose belongs in the repo it was extracted from — the app's
`WorkflowsGuideTool.php` for `content/guide/`, marketing's
`troubleshooting.astro` for `content/pages/` — and the extraction is re-taken
from there. See `tests/golden/README.md` for how goldens are regenerated.

`content/skills/`, `content/fragments/`, and new files are open: normal
contributions, gated by the test suite and `scripts/check-content.mjs`.

The freeze ends once migration wave #1004's PRs 3 and 4 land and the app and
marketing render their docs from this repo — the app-side PR is what unlocks
the guide. After that, the goldens' role changes and `content/guide/` becomes
the place to edit.

## Bumping the pinned CLI command manifest

`command-manifest.json` is a byte-for-byte vendored copy of a release asset
from `solidactions-cli`, pinned by sha256 in `manifest-contract.json` so a
silently re-uploaded or hand-edited artifact fails CI instead of passing
unnoticed (the CLI's publish workflow uses `gh release upload --clobber`,
which can re-upload the same tag).

To bump the pin to a new CLI release:

1. Download the new asset:
   `curl -sL -o content/command-manifest.json https://github.com/SolidActions/solidactions-cli/releases/download/v<VERSION>/command-manifest.json`
   — do not reformat it, re-serialize it, or strip its trailing newline; the
   sha256 pin is only meaningful against the exact downloaded bytes.
2. Update `manifest-contract.json`'s `release_tag`, `cli_version`, `sha256`
   (`sha256sum content/command-manifest.json`), and `asset_url`.
3. Update `placeholder-contract.json`'s `guidance_cli_version.public_value` to
   the new major.minor.
4. Run `node --test 'tests/**/*.test.mjs'` to check the validator/render
   libraries and the byte-parity goldens still pass.
5. Run `node scripts/check-content.mjs` to validate the real corpus against
   the newly pinned manifest — this is the only command that does so, since
   the test suite's command-validator tests use a hand-written fixture
   manifest — and fix whatever prose it flags.
