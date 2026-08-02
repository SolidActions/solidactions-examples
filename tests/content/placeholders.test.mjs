import assert from 'node:assert/strict';
import { test } from 'node:test';
import { render, collectPlaceholders } from '../../scripts/lib/placeholders.mjs';

const SOURCE = 'test.md';

const contract = {
  schema_version: 1,
  placeholders: {
    app_url: { description: 'app url', public_value: 'https://app.solidactions.com' },
    api_keys_url: { description: 'api keys url', public_value: 'https://app.solidactions.com/settings/api-keys' },
  },
  conditions: {
    self_hosted: { description: 'self hosted', public_value: false },
  },
};

test('substitutes a scalar placeholder', () => {
  const out = render('Visit {{app_url}} now.', { app_url: 'https://example.com' }, { contract, source: SOURCE });
  assert.equal(out, 'Visit https://example.com now.');
});

test('text outside placeholders is copied byte-for-byte', () => {
  const body = 'Line one.\n\nLine  two with   odd    spacing.\n';
  const out = render(body, {}, { contract, source: SOURCE });
  assert.equal(out, body);
});

test('renders the if-arm of a single-line conditional when the condition is true', () => {
  const body = 'run{{#if self_hosted}} --host {{app_url}}{{/if}}';
  const out = render(body, { self_hosted: true, app_url: 'https://example.com' }, { contract, source: SOURCE });
  assert.equal(out, 'run --host https://example.com');
});

test('omits the if-arm of a single-line conditional when the condition is false', () => {
  const body = 'run{{#if self_hosted}} --host {{app_url}}{{/if}}';
  const out = render(body, { self_hosted: false, app_url: 'https://example.com' }, { contract, source: SOURCE });
  assert.equal(out, 'run');
});

test('renders the if-arm of a two-arm conditional when true, preserving the arm text byte-for-byte (including its own surrounding newlines)', () => {
  const body = [
    'Before.',
    '{{#if self_hosted}}',
    'Point your client at {{app_url}}.',
    '{{else}}',
    'Use the hosted default.',
    '{{/if}}',
    'After.',
  ].join('\n');
  const out = render(body, { self_hosted: true, app_url: 'https://example.com' }, { contract, source: SOURCE });
  assert.equal(out, 'Before.\n\nPoint your client at https://example.com.\n\nAfter.');
});

test('renders the else-arm of a two-arm conditional when false, preserving the arm text byte-for-byte (including its own surrounding newlines)', () => {
  const body = [
    'Before.',
    '{{#if self_hosted}}',
    'Point your client at {{app_url}}.',
    '{{else}}',
    'Use the hosted default.',
    '{{/if}}',
    'After.',
  ].join('\n');
  const out = render(body, { self_hosted: false, app_url: 'https://example.com' }, { contract, source: SOURCE });
  assert.equal(out, 'Before.\n\nUse the hosted default.\n\nAfter.');
});

test('validates an unknown placeholder inside the NOT-selected arm — a typo in an unrendered arm still throws', () => {
  const body = '{{#if self_hosted}}{{not_a_placeholder}}{{else}}ok{{/if}}';
  assert.throws(
    () => render(body, { self_hosted: false }, { contract, source: SOURCE }),
    /not_a_placeholder/,
  );
});

test('does NOT require a context value for a known placeholder that appears only in the NOT-selected arm', () => {
  const body = '{{#if self_hosted}}Host {{app_url}}{{else}}Use the cloud default{{/if}}';
  // self_hosted is false, so the if-arm (which mentions app_url) is never rendered;
  // app_url is deliberately absent from context and must not be required.
  const out = render(body, { self_hosted: false }, { contract, source: SOURCE });
  assert.equal(out, 'Use the cloud default');
});

test('throws on an unknown placeholder', () => {
  assert.throws(() => render('{{not_in_contract}}', {}, { contract, source: SOURCE }), /not_in_contract/);
});

test('throws when a known placeholder is missing from context (never substitutes an empty string)', () => {
  assert.throws(() => render('{{app_url}}', {}, { contract, source: SOURCE }), /app_url/);
});

test('throws on an unknown condition', () => {
  assert.throws(
    () => render('{{#if not_a_condition}}x{{/if}}', { not_a_condition: true }, { contract, source: SOURCE }),
    /not_a_condition/,
  );
});

test('throws on a nested conditional', () => {
  const body = '{{#if self_hosted}}outer {{#if self_hosted}}inner{{/if}}{{/if}}';
  assert.throws(() => render(body, { self_hosted: true }, { contract, source: SOURCE }), /nest/i);
});

test('throws on an unclosed {{#if}}', () => {
  assert.throws(() => render('{{#if self_hosted}}unclosed', { self_hosted: true }, { contract, source: SOURCE }), /unclosed|#if/i);
});

test('throws on a stray {{else}}', () => {
  assert.throws(() => render('text {{else}} more', {}, { contract, source: SOURCE }), /else/i);
});

test('throws on a stray {{/if}}', () => {
  assert.throws(() => render('text {{/if}} more', {}, { contract, source: SOURCE }), /\/if/);
});

test('throws on any other {{...}} construct, naming the token and source', () => {
  assert.throws(() => render('{{#each items}}x{{/each}}', {}, { contract, source: SOURCE }), /test\.md/);
});

test('throws on an unmatched "{{" with no closing "}}", naming the source and the offending token', () => {
  const body = 'Hello {{app_url and more text with no closer';
  assert.throws(() => render(body, {}, { contract, source: SOURCE }), /test\.md.*\{\{app_url/s);
});

test('collectPlaceholders reports exactly the placeholder and condition names used, including inside conditionals', () => {
  const body = [
    'Start {{app_url}}.',
    '{{#if self_hosted}}',
    'Nested use of {{api_keys_url}}.',
    '{{else}}',
    'Fallback {{app_url}} again.',
    '{{/if}}',
  ].join('\n');
  const result = collectPlaceholders(body);
  assert.deepEqual(result.placeholders, new Set(['app_url', 'api_keys_url']));
  assert.deepEqual(result.conditions, new Set(['self_hosted']));
});

test('collectPlaceholders reports nothing for a body with no placeholders', () => {
  const result = collectPlaceholders('Plain text, no placeholders here.');
  assert.deepEqual(result.placeholders, new Set());
  assert.deepEqual(result.conditions, new Set());
});
