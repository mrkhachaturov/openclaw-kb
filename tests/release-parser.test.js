import test from 'node:test';
import assert from 'node:assert/strict';
import { formatChangelogMarkdown, getReleaseFamily, selectReleaseWindow } from '../lib/release-parser.js';
import { MAX_EMBEDDING_SAFE_CHARS } from '../lib/config.js';

test('getReleaseFamily normalizes beta and correction tags into one family', () => {
  assert.equal(getReleaseFamily('v2026.3.24-beta.2'), 'v2026.3.24');
  assert.equal(getReleaseFamily('v2026.3.23-2'), 'v2026.3.23');
  assert.equal(getReleaseFamily('v2026.3.24'), 'v2026.3.24');
  assert.equal(getReleaseFamily('v1.2.0-beta5'), 'v1.2.0-beta5');
});

test('selectReleaseWindow keeps all variants for the most recent families', () => {
  const releases = [
    { tag: 'v2026.3.24', date: '2026-03-25T16:35:44Z' },
    { tag: 'v2026.3.24-beta.2', date: '2026-03-25T14:11:26Z' },
    { tag: 'v2026.3.24-beta.1', date: '2026-03-25T11:54:48Z' },
    { tag: 'v2026.3.23-2', date: '2026-03-24T03:06:46Z' },
    { tag: 'v2026.3.23', date: '2026-03-23T23:14:53Z' },
    { tag: 'v2026.3.23-beta.1', date: '2026-03-23T18:55:05Z' },
    { tag: 'v2026.3.22', date: '2026-03-23T11:08:28Z' },
    { tag: 'v2026.3.22-beta.1', date: '2026-03-23T09:34:47Z' },
    { tag: 'v2026.3.13-beta.1', date: '2026-03-14T04:56:16Z' },
  ];

  const selected = selectReleaseWindow(releases, 3).map(release => release.tag);

  assert.deepEqual(selected, [
    'v2026.3.24',
    'v2026.3.24-beta.2',
    'v2026.3.24-beta.1',
    'v2026.3.23-2',
    'v2026.3.23',
    'v2026.3.23-beta.1',
    'v2026.3.22',
    'v2026.3.22-beta.1',
  ]);
});

test('formatChangelogMarkdown summarizes oversized commit categories', () => {
  const fixes = Array.from({ length: 50 }, (_, index) => `fix: item ${index + 1}`);
  const markdown = formatChangelogMarkdown({
    tag: 'v2026.3.24-beta.2',
    date: '2026-03-25T14:11:26Z',
    previous_tag: 'v2026.3.24-beta.1',
    commits_count: 50,
    kb_files_changed: 20,
    kb_impact: 'high',
    changelog: {
      security: [],
      breaking: [],
      features: [],
      fixes,
      other: [],
    },
  });

  assert.match(markdown, /and 30 more fixes/);
  assert.ok(markdown.length < MAX_EMBEDDING_SAFE_CHARS);
});
