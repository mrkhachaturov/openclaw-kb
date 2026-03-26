import test from 'node:test';
import assert from 'node:assert/strict';
import { SOURCES } from '../lib/config.js';

test('src indexing keeps JS but excludes generated and bundled noise', () => {
  const src = SOURCES.find(source => source.name === 'src');

  assert.ok(src);
  assert.ok(src.globs.includes('src/**/*.js'));
  assert.ok(src.exclude.includes('**/*.min.js'));
  assert.ok(src.exclude.includes('**/*.bundle.js'));
  assert.ok(src.exclude.includes('**/*.generated.ts'));
  assert.ok(src.exclude.includes('**/vendor/**'));
  assert.ok(src.exclude.includes('**/assets/*.js'));
  assert.ok(src.exclude.includes('**/node_modules/**'));
});

test('extensions indexing keeps JS but excludes generated runtime bundles', () => {
  const extensions = SOURCES.find(source => source.name === 'extensions');

  assert.ok(extensions);
  assert.ok(extensions.globs.includes('extensions/**/*.js'));
  assert.ok(extensions.exclude.includes('**/*.min.js'));
  assert.ok(extensions.exclude.includes('**/*.bundle.js'));
  assert.ok(extensions.exclude.includes('**/assets/*.js'));
  assert.ok(extensions.exclude.includes('**/node_modules/**'));
});
