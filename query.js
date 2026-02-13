#!/usr/bin/env node

/**
 * OpenClaw Knowledge Base Query
 *
 * Semantic search over indexed upstream docs and source code.
 * Usage: node query.js "question" [--top N] [--source docs|config|...] [--json]
 */

import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { ENV_PATH } from './lib/config.js';
import { embedQuery } from './lib/embedder.js';
import { openDb, closeDb, hybridSearch, getStats, getLatestRelease, getReleaseHistory, getChunksSinceRelease } from './lib/db.js';
import { expandQuery } from './lib/synonyms.js';

// Load .env
loadEnv();

const { values: flags, positionals } = parseArgs({
  options: {
    top: { type: 'string', default: '8' },
    source: { type: 'string', default: '' },
    json: { type: 'boolean', default: false },
    stats: { type: 'boolean', default: false },
    docs: { type: 'boolean', default: false },      // docs only
    code: { type: 'boolean', default: false },      // code only
    skills: { type: 'boolean', default: false },    // skills only
    verify: { type: 'boolean', default: false },    // docs + related code
    releases: { type: 'boolean', default: false },  // release notes only
    'latest-release': { type: 'boolean', default: false },
    'release-history': { type: 'boolean', default: false },
    'since-release': { type: 'string', default: '' },  // filter by release version
  },
  allowPositionals: true,
  strict: false,
});

async function main() {
  if (!process.env.OPENAI_API_KEY) {
    console.error('Error: OPENAI_API_KEY not set. Check .env file.');
    process.exit(1);
  }

  openDb();

  // --stats mode: print DB info and exit
  if (flags.stats) {
    const s = getStats();
    console.log(JSON.stringify(s, null, 2));
    closeDb();
    return;
  }

  // --latest-release mode: show latest version info
  if (flags['latest-release']) {
    const latest = getLatestRelease();
    if (!latest) {
      console.log('No releases tracked yet');
    } else {
      console.log(`Latest Release: ${latest.tag} (${latest.date.split('T')[0]})`);
      if (latest.previous_tag) {
        console.log(`${latest.commits_count} commits since ${latest.previous_tag}`);
      }
      console.log(`KB Impact: ${latest.kb_impact} (${latest.kb_files_changed} files changed)`);
    }
    closeDb();
    return;
  }

  // --release-history mode: show recent releases
  if (flags['release-history']) {
    const history = getReleaseHistory(10);
    if (history.length === 0) {
      console.log('No releases tracked yet');
    } else {
      console.log('Recent Releases:\n');
      for (const r of history) {
        const dateStr = r.date.split('T')[0];
        const impactStr = r.kb_impact ? r.kb_impact.padEnd(8) : 'unknown ';
        console.log(`${r.tag.padEnd(15)} (${dateStr}) - ${r.commits_count.toString().padStart(3)} commits - ${impactStr} impact`);
      }
    }
    closeDb();
    return;
  }

  // --since-release mode: show chunks indexed after a specific version
  if (flags['since-release']) {
    const chunks = getChunksSinceRelease(flags['since-release'], parseInt(flags.top, 10) || 100);

    if (chunks.length === 0) {
      console.log(`No chunks found indexed since ${flags['since-release']}`);
    } else {
      console.log(`Chunks indexed since ${flags['since-release']}:\n`);

      // Group by source
      const bySource = {};
      for (const c of chunks) {
        if (!bySource[c.source]) bySource[c.source] = [];
        bySource[c.source].push(c);
      }

      for (const [source, sourceChunks] of Object.entries(bySource)) {
        console.log(`\n${source}: ${sourceChunks.length} chunks`);
        for (const c of sourceChunks.slice(0, 5)) {
          const releaseTag = c.indexedRelease || 'untagged';
          console.log(`  - ${c.path}:${c.startLine}-${c.endLine} (${releaseTag})`);
        }
        if (sourceChunks.length > 5) {
          console.log(`  ... and ${sourceChunks.length - 5} more`);
        }
      }
    }
    closeDb();
    return;
  }

  const query = positionals.join(' ').trim();
  if (!query) {
    console.error('Usage: node query.js "question" [--top N] [--source docs|config|...] [--json]');
    console.error('       node query.js "question" --docs|--code|--skills|--releases|--verify');
    console.error('       node query.js --stats');
    console.error('       node query.js --latest-release');
    console.error('       node query.js --release-history');
    process.exit(1);
  }

  const limit = parseInt(flags.top, 10) || 8;
  let sourceFilter = flags.source || null;

  // --releases flag filters to release notes only
  if (flags.releases) {
    sourceFilter = 'releases';
  }

  // Determine content type filter from flags
  let contentTypeFilter = null;
  if (flags.docs) contentTypeFilter = 'docs';
  else if (flags.code) contentTypeFilter = 'code';
  else if (flags.skills) contentTypeFilter = 'skill';

  // Expand query with synonyms
  const expandedQuery = expandQuery(query);

  // Embed the expanded query
  const queryEmbedding = await embedQuery(expandedQuery);

  // Hybrid search with expanded query for FTS
  const results = hybridSearch(queryEmbedding, expandedQuery, limit, sourceFilter, contentTypeFilter);

  if (results.length === 0) {
    if (flags.json) {
      console.log(JSON.stringify({ query, results: [] }));
    } else {
      console.log('No results found.');
    }
    closeDb();
    return;
  }

  if (flags.json) {
    // Machine-readable output for Claude Code agent
    const output = {
      query,
      results: results.map(r => ({
        score: Math.round(r.score * 1000) / 1000,
        path: r.path,
        lines: `${r.startLine}-${r.endLine}`,
        source: r.source,
        contentType: r.contentType,
        language: r.language,
        category: r.category,
        snippet: r.text.slice(0, 800),
      })),
    };
    console.log(JSON.stringify(output, null, 2));
  } else {
    // Human-readable output
    console.log(`Query: "${query}"`);
    if (sourceFilter) console.log(`Filter: source=${sourceFilter}`);
    if (contentTypeFilter) console.log(`Filter: type=${contentTypeFilter}`);
    console.log(`Results: ${results.length}\n`);

    for (const r of results) {
      const scoreStr = r.score.toFixed(3);
      const typeTag = r.contentType ? `[${r.contentType}]` : '';
      console.log(`[${scoreStr}] ${typeTag} ${r.path}:${r.startLine}-${r.endLine} (${r.source})`);

      // Show first 3 lines of snippet (skip the file header line)
      const lines = r.text.split('\n').slice(1, 4);
      for (const line of lines) {
        const trimmed = line.length > 120 ? line.slice(0, 117) + '...' : line;
        console.log(`  ${trimmed}`);
      }
      console.log('');
    }
  }

  // Verification mode: show related code after docs
  if (flags.verify && results.length > 0) {
    console.log('\n--- Related Implementation (Code) ---\n');

    const codeResults = hybridSearch(queryEmbedding, query, 5, null, 'code');

    if (codeResults.length === 0) {
      console.log('No related code found.\n');
    } else {
      for (const r of codeResults) {
        const scoreStr = r.score.toFixed(3);
        console.log(`[${scoreStr}] [code] ${r.path}:${r.startLine}-${r.endLine} (${r.source})`);

        const lines = r.text.split('\n').slice(1, 4);
        for (const line of lines) {
          const trimmed = line.length > 120 ? line.slice(0, 117) + '...' : line;
          console.log(`  ${trimmed}`);
        }
        console.log('');
      }
    }
  }

  closeDb();
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
    // .env is optional
  }
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
