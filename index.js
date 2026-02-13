#!/usr/bin/env node

/**
 * OpenClaw Knowledge Base Indexer
 *
 * Indexes upstream docs and source code into a SQLite vector database.
 * Usage: node index.js [--force]
 */

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import { createHash } from 'node:crypto';
import { parseArgs } from 'node:util';
import { spawnSync } from 'node:child_process';
import { UPSTREAM_ROOT, SOURCES, ENV_PATH } from './lib/config.js';
import { chunkFile } from './lib/chunker.js';
import { embedAll } from './lib/embedder.js';
import { formatChangelogMarkdown } from './lib/release-parser.js';
import {
  openDb, closeDb,
  getFileHash, upsertFile, getAllFilePaths, deleteFile,
  deleteChunksByPath, insertChunks, getStats,
  getReleaseHistory,
} from './lib/db.js';

// Load .env
loadEnv();

const { values: flags } = parseArgs({
  options: {
    force: { type: 'boolean', default: false },
    release: { type: 'string', default: '' },
  },
  strict: false,
});

async function main() {
  console.log('OpenClaw Knowledge Base Indexer');
  console.log(`Upstream: ${UPSTREAM_ROOT}`);
  console.log(`Force: ${flags.force}\n`);

  if (!process.env.OPENAI_API_KEY) {
    console.error('Error: OPENAI_API_KEY not set. Check .env file.');
    process.exit(1);
  }

  openDb();

  // Determine current release tag
  let currentRelease = flags.release || null;
  if (!currentRelease) {
    // Try to detect from git (try exact tag first, fallback to commit hash)
    try {
      let result = spawnSync('git', ['describe', '--tags', '--exact-match'], {
        cwd: UPSTREAM_ROOT,
        encoding: 'utf-8',
        stdio: ['ignore', 'pipe', 'ignore']
      });

      if (result.status === 0) {
        currentRelease = result.stdout.trim();
      } else {
        // Fallback to short commit hash
        result = spawnSync('git', ['rev-parse', '--short', 'HEAD'], {
          cwd: UPSTREAM_ROOT,
          encoding: 'utf-8',
          stdio: ['ignore', 'pipe', 'ignore']
        });
        if (result.status === 0) {
          currentRelease = result.stdout.trim();
        }
      }

      if (currentRelease) {
        console.log(`Detected release: ${currentRelease}\n`);
      } else {
        console.log('Warning: Could not detect release tag, chunks will not be version-tagged\n');
      }
    } catch {
      console.log('Warning: Could not detect release tag, chunks will not be version-tagged\n');
    }
  } else {
    console.log(`Using release: ${currentRelease}\n`);
  }

  const allDiscoveredPaths = new Set();
  let totalNew = 0;
  let totalUpdated = 0;
  let totalSkipped = 0;
  let totalDeleted = 0;

  for (const source of SOURCES) {
    console.log(`\n--- Source: ${source.name} ---`);
    const files = discoverFiles(source);
    console.log(`  Found ${files.length} files`);

    const chunksToEmbed = [];
    const chunkMetadata = [];

    for (const filePath of files) {
      const relPath = relative(UPSTREAM_ROOT, filePath);
      allDiscoveredPaths.add(relPath);

      const content = readFileSync(filePath, 'utf-8');
      const fileHash = createHash('sha256').update(content).digest('hex');
      const existingHash = getFileHash(relPath);

      if (!flags.force && existingHash === fileHash) {
        totalSkipped++;
        continue;
      }

      if (existingHash) {
        totalUpdated++;
        deleteChunksByPath(relPath);
      } else {
        totalNew++;
      }

      const chunks = chunkFile(content, relPath, source.name);
      for (const chunk of chunks) {
        chunksToEmbed.push(chunk);
        chunkMetadata.push(chunk);
      }

      upsertFile(relPath, source.name, fileHash, currentRelease);
    }

    if (chunksToEmbed.length === 0) {
      console.log(`  No changes to embed`);
      continue;
    }

    console.log(`  Embedding ${chunksToEmbed.length} chunks...`);
    const texts = chunksToEmbed.map(c => c.text);
    const embeddings = await embedAll(texts, (done, total) => {
      process.stdout.write(`\r  Embedding: ${done}/${total} chunks`);
    });
    console.log('');

    insertChunks(chunkMetadata, embeddings, currentRelease);
    console.log(`  Inserted ${chunkMetadata.length} chunks`);

    // Validate FTS table was populated
    const db = openDb();
    const ftsCount = db.prepare('SELECT COUNT(*) as n FROM chunks_fts').get().n;
    const chunksCount = db.prepare('SELECT COUNT(*) as n FROM chunks').get().n;
    if (ftsCount < chunksCount * 0.9) {
      console.warn(`  ⚠️  WARNING: FTS table has ${ftsCount} rows but chunks has ${chunksCount} rows`);
    } else {
      console.log(`  ✓ FTS table verified: ${ftsCount} rows`);
    }
  }

  // Clean up files that no longer exist in upstream
  const indexedPaths = getAllFilePaths();
  for (const path of indexedPaths) {
    if (!allDiscoveredPaths.has(path)) {
      deleteChunksByPath(path);
      deleteFile(path);
      totalDeleted++;
    }
  }

  // Index release changelogs
  await indexReleaseChangelogs(currentRelease);

  // Summary
  const stats = getStats();
  console.log('\n=== Summary ===');
  console.log(`Files: ${stats.files} indexed`);
  console.log(`Chunks: ${stats.chunks} total`);
  console.log(`Changes: ${totalNew} new, ${totalUpdated} updated, ${totalSkipped} skipped, ${totalDeleted} deleted`);
  console.log(`Vector search: ${stats.vecLoaded ? 'enabled' : 'DISABLED'}`);
  console.log('Sources:');
  for (const s of stats.sources) {
    console.log(`  ${s.source}: ${s.n} chunks`);
  }

  closeDb();
}

/**
 * Index release changelogs as searchable chunks
 * @param {string|null} currentRelease - Current release tag
 */
async function indexReleaseChangelogs(currentRelease = null) {
  const db = openDb();

  // Find releases without indexed changelogs
  const releases = db.prepare(`
    SELECT r.* FROM releases r
    LEFT JOIN chunks c ON c.path = 'releases/' || r.tag
    WHERE c.id IS NULL
    ORDER BY r.date DESC
  `).all();

  if (releases.length === 0) {
    return;
  }

  console.log(`\n--- Indexing Release Changelogs ---`);
  console.log(`  Found ${releases.length} releases without indexed changelogs`);

  const chunksToEmbed = [];
  const chunkMetadata = [];

  for (const release of releases) {
    // Parse changelog_json back into object
    const metadata = {
      ...release,
      changelog: release.changelog_json ? JSON.parse(release.changelog_json) : {}
    };

    const changelog = formatChangelogMarkdown(metadata);
    const chunkId = `releases/${release.tag}`;
    const chunkHash = createHash('sha256').update(changelog).digest('hex');

    const chunk = {
      id: chunkId,
      path: `releases/${release.tag}`,
      source: 'releases',
      startLine: 1,
      endLine: 1,
      text: changelog,
      hash: chunkHash,
      contentType: 'docs',
      language: 'markdown',
      category: 'release-notes'
    };

    chunksToEmbed.push(chunk.text);
    chunkMetadata.push(chunk);

    // Also upsert to files table
    upsertFile(`releases/${release.tag}`, 'releases', chunkHash);
  }

  if (chunksToEmbed.length > 0) {
    console.log(`  Embedding ${chunksToEmbed.length} changelog chunks...`);
    const embeddings = await embedAll(chunksToEmbed, (done, total) => {
      process.stdout.write(`\r  Embedding: ${done}/${total} chunks`);
    });
    console.log('');

    insertChunks(chunkMetadata, embeddings, currentRelease);
    console.log(`  Indexed ${chunkMetadata.length} release changelogs`);
  }
}

/**
 * Discover files matching source globs.
 * Simple glob implementation using recursive directory walk.
 */
function discoverFiles(source) {
  const results = [];

  for (const glob of source.globs) {
    const files = expandGlob(UPSTREAM_ROOT, glob);
    for (const f of files) {
      const relPath = relative(UPSTREAM_ROOT, f);
      const excluded = (source.exclude || []).some(pattern => matchGlob(relPath, pattern));
      if (!excluded) {
        results.push(f);
      }
    }
  }

  return [...new Set(results)].sort();
}

/**
 * Expand a glob pattern into matching file paths.
 * Supports: **, *, and literal path segments.
 */
function expandGlob(root, pattern) {
  const parts = pattern.split('/');
  return walkGlob(root, parts);
}

function walkGlob(dir, parts) {
  if (parts.length === 0) return [];
  if (!existsSync(dir)) return [];

  const [current, ...rest] = parts;
  const results = [];

  if (current === '**') {
    // Match zero or more directories
    // Try matching rest from current dir
    results.push(...walkGlob(dir, rest));
    // And recurse into subdirs with same pattern
    for (const entry of safeReaddir(dir)) {
      const full = join(dir, entry);
      if (isDir(full)) {
        results.push(...walkGlob(full, parts)); // keep ** pattern
      }
    }
  } else if (current.includes('*')) {
    // Wildcard in filename
    const regex = new RegExp('^' + current.replace(/\./g, '\\.').replace(/\*/g, '.*') + '$');
    for (const entry of safeReaddir(dir)) {
      const full = join(dir, entry);
      if (regex.test(entry)) {
        if (rest.length === 0) {
          if (!isDir(full)) results.push(full);
        } else {
          if (isDir(full)) results.push(...walkGlob(full, rest));
        }
      }
    }
  } else {
    // Literal segment
    const full = join(dir, current);
    if (rest.length === 0) {
      if (existsSync(full) && !isDir(full)) results.push(full);
    } else {
      if (existsSync(full) && isDir(full)) results.push(...walkGlob(full, rest));
    }
  }

  return results;
}

function matchGlob(path, pattern) {
  const regex = new RegExp(
    '^' +
    pattern
      .replace(/\./g, '\\.')
      .replace(/\*\*/g, '<<<GLOBSTAR>>>')
      .replace(/\*/g, '[^/]*')
      .replace(/<<<GLOBSTAR>>>/g, '.*')
    + '$'
  );
  return regex.test(path);
}

function safeReaddir(dir) {
  try { return readdirSync(dir); } catch { return []; }
}

function isDir(p) {
  try { return statSync(p).isDirectory(); } catch { return false; }
}

function loadEnv() {
  try {
    const content = readFileSync(ENV_PATH, 'utf-8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      const value = trimmed.slice(eqIdx + 1).trim();
      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  } catch {
    // .env is optional if env vars are set externally
  }
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
