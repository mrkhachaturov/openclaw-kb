import test from 'node:test';
import assert from 'node:assert/strict';
import { chunkFile, chunkChangelog } from '../lib/chunker.js';
import { MAX_EMBEDDING_SAFE_CHARS } from '../lib/config.js';

test('chunkChangelog keeps only the three most recent sections and includes Unreleased', () => {
  const content = [
    '# Changelog',
    '',
    '## [Unreleased]',
    'Current work',
    '',
    '## [v1.3.0]',
    'Latest stable',
    '',
    '## [v1.2.0]',
    'Older stable',
    '',
    '## [v1.1.0]',
    'Too old',
  ].join('\n');

  const chunks = chunkChangelog(content, 'CHANGELOG.md', 'docs');

  assert.equal(chunks.length, 3);
  assert.match(chunks[0].text, /Unreleased/);
  assert.match(chunks[1].text, /v1\.3\.0/);
  assert.match(chunks[2].text, /v1\.2\.0/);
  assert.ok(!chunks.some(chunk => chunk.text.includes('v1.1.0')));
});

test('chunkFile hard-splits oversized single-line files into safe chunks', () => {
  const hugeLine = `const payload = "${'x'.repeat(MAX_EMBEDDING_SAFE_CHARS * 3)}";`;
  const chunks = chunkFile(hugeLine, 'src/generated/runtime.js', 'src');

  assert.ok(chunks.length > 1);
  for (const chunk of chunks) {
    assert.ok(
      chunk.text.length <= MAX_EMBEDDING_SAFE_CHARS,
      `chunk exceeded safe limit: ${chunk.text.length}`
    );
  }
});
