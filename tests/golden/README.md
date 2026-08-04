# App goldens (`tests/golden/app/`)

These 12 files are the live `workflows_guide` MCP tool output, captured verbatim from a
running `solidactions-app` instance, before its five topics were extracted into
`content/guide/*.md`. `tests/content/app-parity.test.mjs` renders the extracted markdown
and asserts byte-for-byte equality (`assert.strictEqual`) against these files — that
equality is the proof that the extraction changed nothing.

Do not hand-edit these files. If `WorkflowsGuideTool.php` prose changes, regenerate them
with the same procedure and re-run the parity test.

## Provenance

- **App commit:** `b158922f3d1a630c156fd06c145f26c5e341c03a`
  (`solidactions-app`, worktree `__worktrees/issues/github-1027`)
- **Host branch URLs:**
  - `cloud` — `https://app.solidactions.com` (the CLI's built-in default host; the tool
    renders its non-`--host` arm)
  - `self-hosted` — `https://sa.example.test` (differs from the CLI default; the tool
    renders its `--host` arm)
- **Topics captured, in the order the tool declares them:** `setup`, `hosted`, `deploy`,
  `troubleshooting`, `hands_off`, plus `full` (the complete guide, no `topic` argument).

## Regeneration procedure

1. In the app worktree, create a temporary Pest test with the exact contents below.
2. Run it: `./scripts/local-dev artisan test --compact --filter=CaptureGuideGoldens`
   (`base_path()` inside the container resolves to the bind-mounted worktree, so files
   written under `storage/app/` appear on the host).
3. Copy the 12 written files into this repo as
   `tests/golden/app/{cloud,self-hosted}/{setup,hosted,deploy,troubleshooting,hands_off,full}.txt`.
   Copy them exactly — do not let an editor add/strip trailing whitespace or a final
   newline; the heredoc/nowdoc bodies these capture do not end with a newline.
4. Delete the temporary test file from the app worktree.

### Temporary Pest test (full source)

```php
<?php

declare(strict_types=1);

use App\Mcp\Tools\WorkflowsGuideTool;
use Illuminate\Support\Facades\URL;
use Laravel\Mcp\Request;

/**
 * TEMPORARY — captures the live workflows_guide output as golden files for the
 * content-repo extraction (#1027). Not committed; delete after running.
 */
function captureForceAppUrl(string $url): void
{
    config(['app.url' => $url]);
    URL::forceRootUrl($url);
    URL::forceScheme(parse_url($url, PHP_URL_SCHEME));

    expect(rtrim(url('/'), '/'))->toBe(rtrim($url, '/'));
}

function captureGuideText(?string $topic = null): string
{
    $tool = app(WorkflowsGuideTool::class);
    $response = $tool->handle(new Request($topic !== null ? ['topic' => $topic] : []));

    return (string) $response->content();
}

it('captures the golden files for both host branches', function () {
    $topics = ['setup', 'hosted', 'deploy', 'troubleshooting', 'hands_off'];

    $branches = [
        'cloud' => 'https://app.solidactions.com',
        'self-hosted' => 'https://sa.example.test',
    ];

    $dir = base_path('storage/app/golden-capture');
    if (! is_dir($dir)) {
        mkdir($dir, 0755, true);
    }

    foreach ($branches as $branchName => $url) {
        captureForceAppUrl($url);

        $branchDir = "{$dir}/{$branchName}";
        if (! is_dir($branchDir)) {
            mkdir($branchDir, 0755, true);
        }

        foreach ($topics as $topic) {
            file_put_contents("{$branchDir}/{$topic}.txt", captureGuideText($topic));
        }

        file_put_contents("{$branchDir}/full.txt", captureGuideText());
    }

    expect(true)->toBeTrue();
});
```

# Marketing goldens (`tests/golden/marketing/`)

`troubleshooting.html` is the inner HTML of the `<article class="docs-content">` slot from
the built marketing page `site/dist/docs/troubleshooting/index.html`, captured verbatim
before the page's prose was extracted into `content/pages/troubleshooting.html`.
`tests/content/marketing-parity.test.mjs` renders the extracted content (public/cloud
context) and asserts byte-for-byte equality against this file.

Do not hand-edit this file. If `troubleshooting.astro` prose changes, regenerate it with
the same procedure and re-run the parity test.

## Provenance

- **Marketing commit:** `3c70e2dd28e629790d9d5ea38a984298a81714a0`
  (`solidactions-marketing`, worktree `.worktrees/issues/github-1027`)
- **Source page:** `site/src/pages/docs/troubleshooting.astro`

## Astro build behavior (checked before extracting)

`troubleshooting.astro` has no `<style>` block, so its rendered content carries no
`data-astro-cid-*` scoped-style attributes — the build injects no Astro-specific markup
into the article body. The built HTML's whitespace is not a byte-for-byte copy of the
hand-indented `.astro` source, though: Astro's compiler applies a JSX-style whitespace
rule (a whitespace run touching a tag boundary collapses to nothing if it contains a
newline, otherwise to a single space; a run in the interior of a text node always
collapses to a single space) — this was verified by reproducing it independently and
confirming an exact match against the built output. That collapsing is a property of the
final rendered content, not a foreign build fingerprint, so this golden is taken directly
from the built `dist/` output rather than hand-transcribed from the source, and no
normalization step was implemented.

## Regeneration procedure

1. In the marketing worktree, `cd site && npm ci && npm run build`.
2. Extract the inner HTML of `<article class="docs-content">` from
   `site/dist/docs/troubleshooting/index.html` (the substring between that opening tag and
   the next `</article>`).
3. Copy it into this repo as `tests/golden/marketing/troubleshooting.html`, byte-exact — do
   not let an editor add a trailing newline or otherwise touch the bytes.
