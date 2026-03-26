import test from 'node:test';
import assert from 'node:assert/strict';
import { formatJsonOutput } from '../commands/query.js';

test('formatJsonOutput keeps verify output parseable as JSON', () => {
  const primary = [{
    score: 0.9,
    path: 'docs/config.md',
    startLine: 10,
    endLine: 20,
    source: 'docs',
    contentType: 'docs',
    language: 'markdown',
    category: 'documentation',
    text: 'Primary result',
  }];
  const relatedCode = [{
    score: 0.8,
    path: 'src/config.ts',
    startLine: 30,
    endLine: 40,
    source: 'src',
    contentType: 'code',
    language: 'typescript',
    category: 'core',
    text: 'Related implementation',
  }];

  const parsed = JSON.parse(formatJsonOutput('config', primary, relatedCode));

  assert.equal(parsed.query, 'config');
  assert.equal(parsed.results.length, 1);
  assert.equal(parsed.relatedCode.length, 1);
  assert.equal(parsed.relatedCode[0].path, 'src/config.ts');
});
