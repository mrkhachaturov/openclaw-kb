import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { openDb, closeDb, insertChunks, pruneOrphanedVectors, insertRelease, getChunksSinceRelease } from '../lib/db.js';

test('openDb follows KB_DATA_DIR at call time across reopen cycles', () => {
  const original = process.env.KB_DATA_DIR;
  const dirA = mkdtempSync(join(tmpdir(), 'kb-db-a-'));
  const dirB = mkdtempSync(join(tmpdir(), 'kb-db-b-'));

  try {
    process.env.KB_DATA_DIR = dirA;
    openDb();
    closeDb();
    assert.ok(existsSync(join(dirA, 'openclaw.db')));

    process.env.KB_DATA_DIR = dirB;
    openDb();
    closeDb();
    assert.ok(existsSync(join(dirB, 'openclaw.db')));
  } finally {
    closeDb();
    if (original === undefined) delete process.env.KB_DATA_DIR;
    else process.env.KB_DATA_DIR = original;
    rmSync(dirA, { recursive: true, force: true });
    rmSync(dirB, { recursive: true, force: true });
  }
});

test('pruneOrphanedVectors removes stale rows from chunks_vec', () => {
  const original = process.env.KB_DATA_DIR;
  const dir = mkdtempSync(join(tmpdir(), 'kb-db-prune-'));

  try {
    process.env.KB_DATA_DIR = dir;
    const db = openDb();
    const chunk = {
      id: 'test-orphan-1',
      path: 'docs/example.md',
      source: 'docs',
      startLine: 1,
      endLine: 1,
      text: 'example',
      hash: 'hash',
      contentType: 'docs',
      language: 'markdown',
      category: 'documentation',
    };

    insertChunks([chunk], [Array(1536).fill(0)], 'v-test');
    db.prepare('DELETE FROM chunks WHERE id = ?').run(chunk.id);

    let before = db.prepare('select count(*) as n from chunks_vec where id not in (select id from chunks)').get().n;
    assert.equal(before, 1);

    pruneOrphanedVectors();

    const after = db.prepare('select count(*) as n from chunks_vec where id not in (select id from chunks)').get().n;
    assert.equal(after, 0);
  } finally {
    closeDb();
    if (original === undefined) delete process.env.KB_DATA_DIR;
    else process.env.KB_DATA_DIR = original;
    rmSync(dir, { recursive: true, force: true });
  }
});

test('getChunksSinceRelease uses release metadata instead of lexical tag comparison', () => {
  const original = process.env.KB_DATA_DIR;
  const dir = mkdtempSync(join(tmpdir(), 'kb-db-release-'));

  try {
    process.env.KB_DATA_DIR = dir;
    openDb();

    insertRelease({
      tag: 'v2026.2.9',
      date: '2026-02-09T00:00:00.000Z',
      commit_hash: 'a',
      previous_tag: 'v2026.2.8',
      commits_count: 1,
      files_changed: 1,
      kb_files_changed: 1,
      kb_impact: 'low',
      changelog: { features: [], fixes: [], security: [], breaking: [], other: [] },
    });
    insertRelease({
      tag: 'v2026.2.21',
      date: '2026-02-21T00:00:00.000Z',
      commit_hash: 'b',
      previous_tag: 'v2026.2.9',
      commits_count: 1,
      files_changed: 1,
      kb_files_changed: 1,
      kb_impact: 'low',
      changelog: { features: [], fixes: [], security: [], breaking: [], other: [] },
    });

    insertChunks([{
      id: 'old-release',
      path: 'docs/old.md',
      source: 'docs',
      startLine: 1,
      endLine: 1,
      text: 'old',
      hash: 'old',
      contentType: 'docs',
      language: 'markdown',
      category: 'documentation',
    }], [Array(1536).fill(0)], 'v2026.2.9');

    insertChunks([{
      id: 'new-release',
      path: 'docs/new.md',
      source: 'docs',
      startLine: 1,
      endLine: 1,
      text: 'new',
      hash: 'new',
      contentType: 'docs',
      language: 'markdown',
      category: 'documentation',
    }], [Array(1536).fill(0)], 'v2026.2.21');

    const chunks = getChunksSinceRelease('v2026.2.21', 10);
    assert.deepEqual(chunks.map(chunk => chunk.id), ['new-release']);
  } finally {
    closeDb();
    if (original === undefined) delete process.env.KB_DATA_DIR;
    else process.env.KB_DATA_DIR = original;
    rmSync(dir, { recursive: true, force: true });
  }
});
