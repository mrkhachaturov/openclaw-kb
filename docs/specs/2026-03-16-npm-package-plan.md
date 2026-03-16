# openclaw-kb npm Package — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish openclaw-kb as a standalone npm CLI tool with commander subcommands, local ONNX embedding support, iOS/macOS/shared source indexing, and version-bounded changelog chunking.

**Architecture:** Single `bin/cli.js` entry point registers commander subcommands from `commands/*.js`. Each command exports `register(program)` + `handler(options)`. Existing `lib/` gets targeted changes (config, chunker, embedder). Shell scripts replaced with Node.js.

**Tech Stack:** Node.js >=18, commander, sqlite-vec, onnxruntime-node (optional), @xenova/transformers (optional)

**Spec:** `docs/specs/2026-03-16-npm-package-design.md`

---

## Chunk 1: Foundation — Config, Package, CLI Skeleton

### Task 1: Update lib/config.js

**Files:**
- Modify: `lib/config.js`

- [ ] **Step 1: Add new env vars and sources**

Rewrite the top of config.js. Replace lines 7-17 with getter functions so CLI overrides to `process.env` take effect even after initial import:

```javascript
// Getter functions so CLI flag overrides to process.env are picked up
export function getUpstreamRoot() {
  return process.env.UPSTREAM_DIR
    ? resolve(process.env.UPSTREAM_DIR)
    : resolve(join(__dirname, '..', 'source'));
}

export function getKbDataDir() {
  return process.env.KB_DATA_DIR
    ? resolve(process.env.KB_DATA_DIR)
    : resolve(join(__dirname, '..', 'data'));
}

export function getDbPath() {
  return resolve(join(getKbDataDir(), 'upstream.db'));
}

export function getLogDir() {
  return process.env.KB_LOG_DIR
    ? resolve(process.env.KB_LOG_DIR)
    : resolve(join(getKbDataDir(), 'log'));
}

// Keep static exports for backward compat (read at import time)
export const UPSTREAM_ROOT = getUpstreamRoot();
export const DB_PATH = getDbPath();
export const LOG_DIR = getLogDir();
export const ENV_PATH = join(__dirname, '..', '.env');

// Embedding provider config
export const EMBEDDING_PROVIDER = process.env.KB_EMBEDDING_PROVIDER || 'openai';
export const LOCAL_MODEL = process.env.KB_LOCAL_MODEL || 'all-MiniLM-L6-v2';
```

**Important:** Commands that accept `--upstream-dir` / `--data-dir` (sync, install-service) must set `process.env` BEFORE importing config, OR use the getter functions (`getUpstreamRoot()`, `getDbPath()`) instead of the static exports. The sync command (Task 13) uses the getters.

Add iOS/macOS/shared to the `SOURCES` array:

```javascript
  {
    name: 'ios',
    globs: ['apps/ios/Sources/**/*.swift'],
    exclude: ['**/*Tests*', '**/*Mock*'],
  },
  {
    name: 'macos',
    globs: ['apps/macos/Sources/**/*.swift'],
    exclude: ['**/*Tests*', '**/*Mock*'],
  },
  {
    name: 'shared',
    globs: ['apps/shared/**/*.swift', 'apps/shared/**/*.md'],
    exclude: ['**/*Tests*'],
  },
```

Update `getEmbeddingDims()` to handle local model:

```javascript
function getEmbeddingDims(model) {
  const dims = {
    'text-embedding-3-small': 1536,
    'text-embedding-3-large': 3072,
    'nomic-embed-text-v2': 768,
    'all-MiniLM-L6-v2': 384,
  };
  return dims[model] || 1536;
}

// Export dims based on provider
export const EMBEDDING_DIMS = EMBEDDING_PROVIDER === 'local'
  ? getEmbeddingDims(LOCAL_MODEL)
  : getEmbeddingDims(EMBEDDING_MODEL);
```

- [ ] **Step 2: Verify config loads correctly**

Run: `node -e "import('./lib/config.js').then(c => console.log(JSON.stringify({UPSTREAM_ROOT: c.UPSTREAM_ROOT, DB_PATH: c.DB_PATH, LOG_DIR: c.LOG_DIR, EMBEDDING_PROVIDER: c.EMBEDDING_PROVIDER, SOURCES: c.SOURCES.map(s => s.name)}, null, 2)))"`

Expected: Shows all config values including `LOG_DIR`, `EMBEDDING_PROVIDER: "openai"`, and sources including `ios`, `macos`, `shared`.

- [ ] **Step 3: Commit**

```bash
git add lib/config.js
git commit -m "feat(config): add KB_LOG_DIR, embedding provider, iOS/macOS/shared sources"
```

---

### Task 2: Update package.json and install commander

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install commander**

Run: `npm install commander`

- [ ] **Step 2: Update package.json fields**

Change `version` to `"1.1.0"`. Change `main` to `"lib/db.js"`. Change `bin` to `{ "openclaw-kb": "./bin/cli.js" }`. Add `files` array: `["bin/", "commands/", "lib/", "README.md", "LICENSE"]`. Remove the `sync` script from `scripts`. Add `@xenova/transformers` to `optionalDependencies` (used by the local embedding provider in Task 9):

```json
"optionalDependencies": {
  "@xenova/transformers": "^2.17.0"
}
```

- [ ] **Step 3: Verify package.json is valid**

Run: `node -e "console.log(JSON.parse(require('fs').readFileSync('package.json','utf8')).version)"`

Expected: `1.1.0`

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "feat(package): bump to v1.1.0, add commander, update bin/files config"
```

---

### Task 3: Create bin/cli.js skeleton

**Files:**
- Create: `bin/cli.js`

- [ ] **Step 1: Write the CLI entry point**

```javascript
#!/usr/bin/env node

import { Command } from 'commander';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf-8'));
const program = new Command();

program
  .name('openclaw-kb')
  .description('Self-updating vector knowledge base for OpenClaw')
  .version(pkg.version);

// Subcommands will be registered here as they are implemented
// import { register as registerQuery } from '../commands/query.js';
// registerQuery(program);

program.parse();
```

- [ ] **Step 2: Make it executable**

Run: `chmod +x bin/cli.js`

- [ ] **Step 3: Test the skeleton**

Run: `node bin/cli.js --version`

Expected: `1.1.0`

Run: `node bin/cli.js --help`

Expected: Shows program name, description, version flag.

- [ ] **Step 4: Commit**

```bash
git add bin/cli.js
git commit -m "feat(cli): add bin/cli.js entry point with commander"
```

---

### Task 4: Create exit code constants

**Files:**
- Create: `lib/exit-codes.js`

- [ ] **Step 1: Write exit code module**

```javascript
export const EXIT_SUCCESS = 0;
export const EXIT_RUNTIME_ERROR = 1;
export const EXIT_CONFIG_ERROR = 2;
export const EXIT_NO_RESULTS = 3;
```

- [ ] **Step 2: Commit**

```bash
git add lib/exit-codes.js
git commit -m "feat(lib): add exit code constants"
```

---

## Chunk 2: Read-Only Commands — stats, latest, history, since

### Task 5: Create commands/stats.js

**Files:**
- Create: `commands/stats.js`

- [ ] **Step 1: Write the stats command**

```javascript
import { openDb, closeDb, getStats } from '../lib/db.js';
import { EXIT_SUCCESS, EXIT_RUNTIME_ERROR } from '../lib/exit-codes.js';

export function register(program) {
  program
    .command('stats')
    .description('Show database statistics')
    .action(() => handler());
}

export function handler() {
  try {
    openDb();
    const s = getStats();
    console.log(JSON.stringify(s, null, 2));
    closeDb();
    process.exit(EXIT_SUCCESS);
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(EXIT_RUNTIME_ERROR);
  }
}
```

- [ ] **Step 2: Register in bin/cli.js**

Add to `bin/cli.js`:

```javascript
import { register as registerStats } from '../commands/stats.js';
registerStats(program);
```

- [ ] **Step 3: Test**

Run: `node bin/cli.js stats`

Expected: JSON output with file/chunk counts (if DB exists) or schema creation + empty stats.

- [ ] **Step 4: Commit**

```bash
git add commands/stats.js bin/cli.js
git commit -m "feat(cli): add stats command"
```

---

### Task 6: Create commands/latest.js

**Files:**
- Create: `commands/latest.js`

- [ ] **Step 1: Write the latest command**

```javascript
import { openDb, closeDb, getLatestRelease } from '../lib/db.js';
import { EXIT_SUCCESS, EXIT_RUNTIME_ERROR } from '../lib/exit-codes.js';

export function register(program) {
  program
    .command('latest')
    .description('Show current indexed release version')
    .action(() => handler());
}

export function handler() {
  try {
    openDb();
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
    process.exit(EXIT_SUCCESS);
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(EXIT_RUNTIME_ERROR);
  }
}
```

- [ ] **Step 2: Register in bin/cli.js, test, commit**

Same pattern as Task 5. Run `node bin/cli.js latest`.

```bash
git add commands/latest.js bin/cli.js
git commit -m "feat(cli): add latest command"
```

---

### Task 7: Create commands/history.js

**Files:**
- Create: `commands/history.js`

- [ ] **Step 1: Write the history command**

```javascript
import { openDb, closeDb, getReleaseHistory } from '../lib/db.js';
import { EXIT_SUCCESS, EXIT_RUNTIME_ERROR } from '../lib/exit-codes.js';

export function register(program) {
  program
    .command('history')
    .description('Show last 10 indexed releases')
    .action(() => handler());
}

export function handler() {
  try {
    openDb();
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
    process.exit(EXIT_SUCCESS);
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(EXIT_RUNTIME_ERROR);
  }
}
```

- [ ] **Step 2: Register in bin/cli.js, test, commit**

```bash
git add commands/history.js bin/cli.js
git commit -m "feat(cli): add history command"
```

---

### Task 8: Create commands/since.js

**Files:**
- Create: `commands/since.js`

- [ ] **Step 1: Write the since command**

```javascript
import { openDb, closeDb, getChunksSinceRelease } from '../lib/db.js';
import { EXIT_SUCCESS, EXIT_RUNTIME_ERROR, EXIT_NO_RESULTS } from '../lib/exit-codes.js';

export function register(program) {
  program
    .command('since <version>')
    .description('Show what changed since a version')
    .action((version) => handler({ version }));
}

export function handler({ version }) {
  try {
    openDb();
    const chunks = getChunksSinceRelease(version, 100);

    if (chunks.length === 0) {
      console.log(`No chunks found indexed since ${version}`);
      closeDb();
      process.exit(EXIT_NO_RESULTS);
    }

    console.log(`Chunks indexed since ${version}:\n`);

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

    closeDb();
    process.exit(EXIT_SUCCESS);
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(EXIT_RUNTIME_ERROR);
  }
}
```

- [ ] **Step 2: Register in bin/cli.js, test, commit**

```bash
git add commands/since.js bin/cli.js
git commit -m "feat(cli): add since command"
```

---

## Chunk 3: Embedder Provider Abstraction

### Task 9: Refactor lib/embedder.js to provider pattern

**Files:**
- Modify: `lib/embedder.js`

- [ ] **Step 1: Refactor embedder.js**

Keep the existing `embedQuery` and `embedAll` exports unchanged. Internally, dispatch to OpenAI or local provider based on `EMBEDDING_PROVIDER` from config.

```javascript
import { EMBEDDING_MODEL, EMBEDDING_API_URL, EMBEDDING_BATCH_SIZE, EMBEDDING_PROVIDER, LOCAL_MODEL } from './config.js';

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;

// Provider selection
let localPipeline = null;

async function getLocalPipeline() {
  if (localPipeline) return localPipeline;
  try {
    const { pipeline } = await import('@xenova/transformers');
    localPipeline = await pipeline('feature-extraction', `Xenova/${LOCAL_MODEL}`);
    return localPipeline;
  } catch (err) {
    console.error('Error: Local embedding requires @xenova/transformers');
    console.error('Install it: npm install @xenova/transformers');
    process.exit(2);
  }
}

/**
 * Embed a single text string.
 */
export async function embedQuery(text) {
  if (EMBEDDING_PROVIDER === 'local') {
    return embedLocalSingle(text);
  }
  const [embedding] = await embedBatchOpenAI([text]);
  return embedding;
}

/**
 * Embed multiple texts in batches.
 */
export async function embedAll(texts, onProgress) {
  if (EMBEDDING_PROVIDER === 'local') {
    return embedLocalBatch(texts, onProgress);
  }
  return embedAllOpenAI(texts, onProgress);
}

// --- OpenAI provider (existing logic, renamed) ---

async function embedAllOpenAI(texts, onProgress) {
  const results = [];
  for (let i = 0; i < texts.length; i += EMBEDDING_BATCH_SIZE) {
    const batch = texts.slice(i, i + EMBEDDING_BATCH_SIZE);
    const embeddings = await embedBatchOpenAI(batch);
    results.push(...embeddings);
    if (onProgress) {
      onProgress(Math.min(i + EMBEDDING_BATCH_SIZE, texts.length), texts.length);
    }
  }
  return results;
}

async function embedBatchOpenAI(texts) {
  if (!process.env.OPENAI_API_KEY) {
    console.error('OPENAI_API_KEY is required. Set it in your environment or pass --env-file.');
    process.exit(2);
  }
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const res = await fetch(EMBEDDING_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ model: EMBEDDING_MODEL, input: texts }),
    });

    if (res.ok) {
      const json = await res.json();
      return json.data.sort((a, b) => a.index - b.index).map(d => d.embedding);
    }

    if (res.status === 429 && attempt < MAX_RETRIES) {
      const delay = BASE_DELAY_MS * Math.pow(2, attempt);
      const retryAfter = res.headers.get('retry-after');
      const waitMs = retryAfter ? parseInt(retryAfter, 10) * 1000 : delay;
      console.error(`  Rate limited, retrying in ${waitMs}ms...`);
      await sleep(waitMs);
      continue;
    }

    const body = await res.text();
    throw new Error(`OpenAI API error ${res.status}: ${body}`);
  }
}

// --- Local provider ---

async function embedLocalSingle(text) {
  const pipe = await getLocalPipeline();
  const result = await pipe(text, { pooling: 'mean', normalize: true });
  return Array.from(result.data);
}

async function embedLocalBatch(texts, onProgress) {
  const pipe = await getLocalPipeline();
  const results = [];
  for (let i = 0; i < texts.length; i++) {
    const result = await pipe(texts[i], { pooling: 'mean', normalize: true });
    results.push(Array.from(result.data));
    if (onProgress && (i + 1) % 10 === 0) {
      onProgress(i + 1, texts.length);
    }
  }
  if (onProgress) onProgress(texts.length, texts.length);
  return results;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
```

- [ ] **Step 2: Test OpenAI provider still works**

Run: `node -e "import {embedQuery} from './lib/embedder.js'; embedQuery('test').then(e => console.log('dims:', e.length))"`

Expected: `dims: 1536` (requires OPENAI_API_KEY set)

- [ ] **Step 3: Commit**

```bash
git add lib/embedder.js
git commit -m "feat(embedder): refactor to provider abstraction (OpenAI + local ONNX)"
```

---

## Chunk 4: Query Command + Aliases

### Task 10: Create commands/query.js

**Files:**
- Create: `commands/query.js`

- [ ] **Step 1: Write the query command**

Extract logic from `scripts/query.js` into `commands/query.js`. The handler receives parsed options (not raw argv). Key differences from the original:
- No `loadEnv()` — the CLI entry point or environment handles this
- No `parseArgs()` — commander handles arg parsing
- Uses exit codes from `lib/exit-codes.js`
- Adds `--offline`, `--ios`, `--macos`, `--shared` flags
- Returns exit code 3 for no results

```javascript
import { openDb, closeDb, hybridSearch, searchFTS } from '../lib/db.js';
import { embedQuery } from '../lib/embedder.js';
import { expandQuery } from '../lib/synonyms.js';
import { EMBEDDING_PROVIDER } from '../lib/config.js';
import { EXIT_SUCCESS, EXIT_RUNTIME_ERROR, EXIT_CONFIG_ERROR, EXIT_NO_RESULTS } from '../lib/exit-codes.js';

export function register(program) {
  program
    .command('query <text...>')
    .description('Search the knowledge base')
    .option('--docs', 'Filter to documentation')
    .option('--code', 'Filter to source code')
    .option('--skills', 'Filter to skills')
    .option('--ios', 'Filter to iOS source')
    .option('--macos', 'Filter to macOS source')
    .option('--shared', 'Filter to shared source')
    .option('--releases', 'Filter to release notes')
    .option('--verify', 'Two-pass: docs then related code')
    .option('--json', 'Output JSON')
    .option('--top <n>', 'Number of results', '8')
    .option('--offline', 'FTS-only keyword search (no API needed)')
    .action((textParts, opts) => {
      handler({ query: textParts.join(' '), ...opts });
    });
}

export async function handler(opts) {
  const {
    query, docs, code, skills, ios, macos, shared, releases,
    verify, json, top = '8', offline = false,
  } = opts;

  if (!query || !query.trim()) {
    console.error('Usage: openclaw-kb query <text>');
    process.exit(EXIT_CONFIG_ERROR);
  }

  try {
    openDb();
    const limit = parseInt(top, 10) || 8;

    // Determine filters
    let sourceFilter = null;
    let contentTypeFilter = null;

    if (ios) sourceFilter = 'ios';
    else if (macos) sourceFilter = 'macos';
    else if (shared) sourceFilter = 'shared';
    else if (releases) sourceFilter = 'releases';

    if (docs) contentTypeFilter = 'docs';
    else if (code) contentTypeFilter = 'code';
    else if (skills) contentTypeFilter = 'skill';

    const expandedQuery = expandQuery(query);

    let results;
    if (offline) {
      // FTS-only mode — no embedding needed
      results = searchFTS(expandedQuery, limit, sourceFilter, contentTypeFilter);
    } else {
      // Check API key for openai provider
      if (EMBEDDING_PROVIDER === 'openai' && !process.env.OPENAI_API_KEY) {
        console.error('OPENAI_API_KEY is required. Set it in your environment or use --offline for keyword search.');
        process.exit(EXIT_CONFIG_ERROR);
      }
      const queryEmbedding = await embedQuery(expandedQuery);
      results = hybridSearch(queryEmbedding, expandedQuery, limit, sourceFilter, contentTypeFilter);
    }

    if (results.length === 0) {
      if (json) {
        console.log(JSON.stringify({ query, results: [] }));
      } else {
        console.log('No results found.');
      }
      closeDb();
      process.exit(EXIT_NO_RESULTS);
    }

    if (json) {
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
      console.log(`Query: "${query}"`);
      if (sourceFilter) console.log(`Filter: source=${sourceFilter}`);
      if (contentTypeFilter) console.log(`Filter: type=${contentTypeFilter}`);
      if (offline) console.log('Mode: offline (FTS-only)');
      console.log(`Results: ${results.length}\n`);

      for (const r of results) {
        const scoreStr = r.score.toFixed(3);
        const typeTag = r.contentType ? `[${r.contentType}]` : '';
        console.log(`[${scoreStr}] ${typeTag} ${r.path}:${r.startLine}-${r.endLine} (${r.source})`);
        const lines = r.text.split('\n').slice(1, 4);
        for (const line of lines) {
          const trimmed = line.length > 120 ? line.slice(0, 117) + '...' : line;
          console.log(`  ${trimmed}`);
        }
        console.log('');
      }
    }

    // Verify mode: second pass for code
    if (verify && results.length > 0 && !offline) {
      console.log('\n--- Related Implementation (Code) ---\n');
      const queryEmbedding = await embedQuery(query);
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
    process.exit(EXIT_SUCCESS);
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(EXIT_RUNTIME_ERROR);
  }
}
```

**Note:** `searchFTS` is already exported from `lib/db.js` (used internally by `hybridSearch`). The `--offline` flag calls it directly, bypassing vector search.

- [ ] **Step 2: Verify searchFTS is exported from db.js**

Run: `grep -n 'function searchFTS\|export.*searchFTS' lib/db.js`

If not exported, add `export` to the existing function declaration. If it doesn't exist as a standalone function, extract the FTS portion of `hybridSearch` into `searchFTS(queryText, limit, sourceFilter, contentTypeFilter)`.

- [ ] **Step 3: Register query in bin/cli.js**

```javascript
import { register as registerQuery } from '../commands/query.js';
registerQuery(program);
```

- [ ] **Step 4: Test**

Run: `node bin/cli.js query "test" --offline` (doesn't need API key)

Expected: FTS results or "No results found." with exit code 3.

- [ ] **Step 5: Commit**

```bash
git add commands/query.js bin/cli.js lib/db.js
git commit -m "feat(cli): add query command with --offline, source filters, exit codes"
```

---

### Task 11: Add short alias commands (docs, code, skills, verify)

**Files:**
- Create: `commands/aliases.js`

- [ ] **Step 1: Write alias registrations**

```javascript
import { handler as queryHandler } from './query.js';

function makeAlias(name, description, filterOpts) {
  return (program) => {
    program
      .command(`${name} <text...>`)
      .description(description)
      .option('--json', 'Output JSON')
      .option('--top <n>', 'Number of results', '8')
      .option('--offline', 'FTS-only keyword search')
      .action((textParts, opts) => {
        queryHandler({ query: textParts.join(' '), ...filterOpts, ...opts });
      });
  };
}

export const registerDocs = makeAlias('docs', 'Search documentation', { docs: true });
export const registerCode = makeAlias('code', 'Search source code', { code: true });
export const registerSkills = makeAlias('skills', 'Search skills', { skills: true });
export const registerVerify = makeAlias('verify', 'Search docs + related code', { verify: true, docs: true });
```

- [ ] **Step 2: Register all aliases in bin/cli.js**

```javascript
import { registerDocs, registerCode, registerSkills, registerVerify } from '../commands/aliases.js';
registerDocs(program);
registerCode(program);
registerSkills(program);
registerVerify(program);
```

- [ ] **Step 3: Test**

Run: `node bin/cli.js docs "sandbox" --offline`

Expected: Same as `node bin/cli.js query "sandbox" --docs --offline`

Run: `node bin/cli.js --help`

Expected: Shows `docs`, `code`, `skills`, `verify` as subcommands.

- [ ] **Step 4: Commit**

```bash
git add commands/aliases.js bin/cli.js
git commit -m "feat(cli): add docs/code/skills/verify short alias commands"
```

---

## Chunk 5: Write Commands — index, sync, install-service

### Task 12: Create commands/index.js

**Files:**
- Create: `commands/index.js`

- [ ] **Step 1: Extract index logic from scripts/index.js**

Move the `main()` function body into `handler({ force, release })`. Remove `loadEnv()` and `parseArgs()`. Keep `discoverFiles`, `expandGlob`, `walkGlob`, `matchGlob`, `safeReaddir`, `isDir` as module-private functions (copy from `scripts/index.js`). Keep `indexReleaseChangelogs` as well.

The handler should:
- Validate `UPSTREAM_ROOT` exists (exit code 2 if not)
- Validate `OPENAI_API_KEY` for openai provider (exit code 2 if missing)
- Use exit codes from `lib/exit-codes.js`

```javascript
export function register(program) {
  program
    .command('index')
    .description('Reindex the knowledge base')
    .option('--force', 'Re-embed all files')
    .option('--release <tag>', 'Override auto-detected release tag')
    .action((opts) => handler(opts));
}

export async function handler(opts = {}) {
  const { force = false, release } = opts;
  // ... extracted logic from scripts/index.js main()
}
```

- [ ] **Step 2: Register in bin/cli.js, test**

Run: `node bin/cli.js index --help`

Expected: Shows `--force` and `--release` options.

- [ ] **Step 3: Commit**

```bash
git add commands/index.js bin/cli.js
git commit -m "feat(cli): add index command"
```

---

### Task 13: Create commands/sync.js (replaces sync-latest-tag.sh)

**Files:**
- Create: `commands/sync.js`

- [ ] **Step 1: Write sync command in Node.js**

Port the bash logic to Node.js using `child_process.execFileSync`. Key operations:

```javascript
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, appendFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { getUpstreamRoot, getLogDir, EMBEDDING_PROVIDER } from '../lib/config.js';
import { EXIT_SUCCESS, EXIT_RUNTIME_ERROR, EXIT_CONFIG_ERROR } from '../lib/exit-codes.js';
import { handler as indexHandler } from './index.js';

// Includes apps/ for iOS/macOS/shared sources (new vs original shell script)
const KB_PREFIXES = /^(docs\/|src\/|extensions\/|skills\/|apps\/)/;

export function register(program) {
  program
    .command('sync')
    .description('Fetch latest upstream tag and reindex if needed')
    .option('--upstream-dir <path>', 'Override UPSTREAM_DIR')
    .option('--data-dir <path>', 'Override KB_DATA_DIR')
    .action((opts) => handler(opts));
}

export async function handler(opts = {}) {
  // Apply CLI overrides to process.env BEFORE calling getter functions
  if (opts.upstreamDir) process.env.UPSTREAM_DIR = resolve(opts.upstreamDir);
  if (opts.dataDir) process.env.KB_DATA_DIR = resolve(opts.dataDir);

  // Use getter functions (not static exports) so CLI overrides take effect
  const upstreamDir = getUpstreamRoot();
  const logDir = getLogDir();
  const syncLog = join(logDir, 'sync.log');
  mkdirSync(logDir, { recursive: true });

  function log(msg) {
    const ts = new Date().toISOString();
    appendFileSync(syncLog, `${ts} | ${msg}\n`);
  }

  // Validate upstream exists
  if (!existsSync(upstreamDir)) {
    console.error(`Error: Upstream directory not found: ${upstreamDir}`);
    process.exit(EXIT_CONFIG_ERROR);
  }

  // Validate it's a git repo
  if (!existsSync(join(upstreamDir, '.git'))) {
    console.error(`Error: ${upstreamDir} is not a git repository`);
    process.exit(EXIT_CONFIG_ERROR);
  }

  // Validate API key for openai provider
  if (EMBEDDING_PROVIDER === 'openai' && !process.env.OPENAI_API_KEY) {
    console.error('OPENAI_API_KEY is required for sync. Set it in your environment or use KB_EMBEDDING_PROVIDER=local.');
    process.exit(EXIT_CONFIG_ERROR);
  }

  const git = (args) => execFileSync('git', args, { cwd: upstreamDir, encoding: 'utf-8' }).trim();

  try {
    console.log('[sync] Fetching upstream tags...');
    execFileSync('git', ['fetch', 'origin', '--tags', '--quiet'], { cwd: upstreamDir });

    // Find latest tag
    const latestTag = git(['tag', '--list', 'v2026.*', '--sort=-v:refname']).split('\n')[0];
    if (!latestTag) {
      console.error('[sync] No v2026.* tags found');
      process.exit(EXIT_RUNTIME_ERROR);
    }

    console.log(`[sync] Latest upstream release: ${latestTag}`);

    // Get current state
    let currentTag;
    try {
      currentTag = git(['describe', '--tags', '--exact-match']);
    } catch {
      currentTag = 'none';
    }

    if (currentTag === latestTag) {
      console.log(`[sync] Already on latest release (${latestTag})`);
      process.exit(EXIT_SUCCESS);
    }

    console.log(`[sync] Current: ${currentTag}`);
    console.log(`[sync] Target:  ${latestTag}`);

    // Check changed files
    const changed = git(['diff', '--name-only', `HEAD..${latestTag}`]);
    const relevant = changed.split('\n').filter(f => KB_PREFIXES.test(f));

    // Stash local changes
    let stashed = false;
    try {
      const diffStatus = execFileSync('git', ['diff', '--quiet'], { cwd: upstreamDir });
    } catch {
      console.log('[sync] Stashing local changes...');
      git(['stash', 'push', '-m', `kb-sync: before ${latestTag}`, '--quiet']);
      stashed = true;
    }

    // Checkout latest tag
    console.log(`[sync] Upgrading to ${latestTag}...`);
    execFileSync('git', ['checkout', latestTag, '--quiet'], { cwd: upstreamDir, stdio: 'ignore' });

    if (relevant.length === 0) {
      console.log('[sync] No KB-relevant files changed, skipping reindex');
      process.exit(EXIT_SUCCESS);
    }

    console.log(`[sync] ${relevant.length} KB-relevant file(s) changed`);
    console.log('[sync] Re-indexing...');

    await indexHandler({ release: latestTag });

    log(`${currentTag} → ${latestTag} | ${relevant.length} KB files | reindexed`);
    console.log(`[sync] ✓ KB upgraded to ${latestTag}`);
    process.exit(EXIT_SUCCESS);
  } catch (err) {
    console.error('[sync] Error:', err.message);
    log(`ERROR: ${err.message}`);
    process.exit(EXIT_RUNTIME_ERROR);
  }
}
```

- [ ] **Step 2: Register in bin/cli.js, test**

Run: `node bin/cli.js sync --help`

Expected: Shows `--upstream-dir` and `--data-dir` options.

- [ ] **Step 3: Commit**

```bash
git add commands/sync.js bin/cli.js
git commit -m "feat(cli): add sync command (replaces sync-latest-tag.sh)"
```

---

### Task 14: Create commands/install-service.js

**Files:**
- Create: `commands/install-service.js`

- [ ] **Step 1: Write install-service command**

Generates systemd user service + timer (Linux) or LaunchAgent plist (macOS). Bakes `--upstream-dir` and `--data-dir` into the generated service file.

```javascript
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { platform, homedir } from 'node:os';
import { UPSTREAM_ROOT } from '../lib/config.js';
import { EXIT_SUCCESS, EXIT_CONFIG_ERROR } from '../lib/exit-codes.js';

export function register(program) {
  program
    .command('install-service')
    .description('Generate systemd timer (Linux) or LaunchAgent (macOS)')
    .option('--interval <duration>', 'Sync interval (e.g. 2h, 30m)', '2h')
    .option('--env-file <path>', 'Path to env file for OPENAI_API_KEY')
    .option('--upstream-dir <path>', 'Baked into generated service')
    .option('--data-dir <path>', 'Baked into generated service')
    .action((opts) => handler(opts));
}

export function handler(opts = {}) {
  const { interval = '2h', envFile, upstreamDir, dataDir } = opts;
  const resolvedUpstream = upstreamDir ? resolve(upstreamDir) : UPSTREAM_ROOT;
  const resolvedData = dataDir ? resolve(dataDir) : (process.env.KB_DATA_DIR || './data');

  const os = platform();
  if (os === 'linux') {
    generateSystemd({ interval, envFile, upstreamDir: resolvedUpstream, dataDir: resolvedData });
  } else if (os === 'darwin') {
    generateLaunchd({ interval, envFile, upstreamDir: resolvedUpstream, dataDir: resolvedData });
  } else {
    console.error(`Unsupported platform: ${os}. Supports Linux (systemd) and macOS (launchd).`);
    process.exit(EXIT_CONFIG_ERROR);
  }

  if (!envFile) {
    console.warn('\nWarning: No --env-file specified. The generated service will not have OPENAI_API_KEY set.');
    console.warn('You must ensure it is available via the shell environment or another mechanism.');
  }
}

function parseInterval(str) {
  const match = str.match(/^(\d+)(h|m|s)?$/);
  if (!match) return 7200;
  const val = parseInt(match[1], 10);
  const unit = match[2] || 'h';
  if (unit === 'h') return val * 3600;
  if (unit === 'm') return val * 60;
  return val;
}

function generateSystemd({ interval, envFile, upstreamDir, dataDir }) {
  const dir = join(homedir(), '.config', 'systemd', 'user');
  mkdirSync(dir, { recursive: true });

  const execArgs = `openclaw-kb sync --upstream-dir ${upstreamDir} --data-dir ${dataDir}`;
  const minutes = Math.round(parseInterval(interval) / 60);

  let serviceContent = `[Unit]
Description=OpenClaw KB Sync

[Service]
Type=oneshot
ExecStart=${execArgs}
`;
  if (envFile) {
    serviceContent += `EnvironmentFile=${resolve(envFile)}\n`;
  }

  const timerContent = `[Unit]
Description=OpenClaw KB Sync Timer

[Timer]
OnCalendar=*:0/${minutes}
Persistent=true

[Install]
WantedBy=timers.target
`;

  const servicePath = join(dir, 'openclaw-kb-sync.service');
  const timerPath = join(dir, 'openclaw-kb-sync.timer');

  writeFileSync(servicePath, serviceContent);
  writeFileSync(timerPath, timerContent);

  console.log(`Created: ${servicePath}`);
  console.log(`Created: ${timerPath}`);
  console.log('\nTo enable:');
  console.log('  systemctl --user daemon-reload');
  console.log('  systemctl --user enable openclaw-kb-sync.timer');
  console.log('  systemctl --user start openclaw-kb-sync.timer');
  process.exit(EXIT_SUCCESS);
}

function generateLaunchd({ interval, envFile, upstreamDir, dataDir }) {
  const dir = join(homedir(), 'Library', 'LaunchAgents');
  mkdirSync(dir, { recursive: true });

  const seconds = parseInterval(interval);

  // Read env file for OPENAI_API_KEY if provided
  let envVarsXml = '';
  if (envFile && existsSync(resolve(envFile))) {
    const content = readFileSync(resolve(envFile), 'utf-8');
    const envVars = {};
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx === -1) continue;
      envVars[trimmed.slice(0, eqIdx).trim()] = trimmed.slice(eqIdx + 1).trim();
    }
    if (Object.keys(envVars).length > 0) {
      envVarsXml = '    <key>EnvironmentVariables</key>\n    <dict>\n';
      for (const [k, v] of Object.entries(envVars)) {
        envVarsXml += `        <key>${k}</key>\n        <string>${v}</string>\n`;
      }
      envVarsXml += '    </dict>\n';
    }
  }

  const plistContent = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.openclaw.kb-sync</string>
    <key>ProgramArguments</key>
    <array>
        <string>openclaw-kb</string>
        <string>sync</string>
        <string>--upstream-dir</string>
        <string>${upstreamDir}</string>
        <string>--data-dir</string>
        <string>${dataDir}</string>
    </array>
    <key>StartInterval</key>
    <integer>${seconds}</integer>
${envVarsXml}</dict>
</plist>
`;

  const plistPath = join(dir, 'com.openclaw.kb-sync.plist');
  writeFileSync(plistPath, plistContent);

  console.log(`Created: ${plistPath}`);
  console.log('\nTo enable:');
  console.log(`  launchctl load ${plistPath}`);
  console.log(`\nTo disable:`);
  console.log(`  launchctl unload ${plistPath}`);
  process.exit(EXIT_SUCCESS);
}
```

- [ ] **Step 2: Register in bin/cli.js, test**

Run: `node bin/cli.js install-service --help`

- [ ] **Step 3: Commit**

```bash
git add commands/install-service.js bin/cli.js
git commit -m "feat(cli): add install-service command (systemd + launchd)"
```

---

## Chunk 6: Chunker Improvements + Backward Compat

### Task 15: Add Swift support to lib/chunker.js

**Files:**
- Modify: `lib/chunker.js`

- [ ] **Step 1: Add swift to deriveMetadata()**

In `deriveMetadata()` (around line 16-59), add Swift handling:

```javascript
// In contentType classification, after the ts/js block:
else if (ext === 'swift') {
  contentType = 'code';
}

// In language detection, add:
: ext === 'swift' ? 'swift'
```

So the language detection becomes:

```javascript
const language = ext === 'md' ? 'markdown'
               : ext === 'ts' ? 'typescript'
               : ext === 'js' ? 'javascript'
               : ext === 'swift' ? 'swift'
               : null;
```

And the code file detection in `chunkFile()` should include swift:

```javascript
const isCodeFile = metadata.language === 'typescript' || metadata.language === 'javascript' || metadata.language === 'swift';
```

- [ ] **Step 2: Commit**

```bash
git add lib/chunker.js
git commit -m "feat(chunker): add Swift language support for iOS/macOS sources"
```

---

### Task 16: Add version-bounded changelog chunking

**Files:**
- Modify: `lib/chunker.js`

- [ ] **Step 1: Add changelog-aware chunking**

Add these functions to the existing `lib/chunker.js` file (which already has `import { createHash } from 'node:crypto'`). Add a new exported function `chunkChangelog` and modify `chunkFile` to detect CHANGELOG.md:

```javascript
/**
 * Chunk CHANGELOG.md by version section boundaries.
 * Each version section becomes one chunk, tagged with version metadata.
 */
export function chunkChangelog(content, relPath, source) {
  const versionPattern = /^## \[?(v[\d.]+)\]?/;
  const lines = content.split('\n');
  const chunks = [];

  let currentVersion = null;
  let currentLines = [];
  let currentStart = 1;

  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(versionPattern);

    if (match && currentLines.length > 0 && currentVersion) {
      // Emit previous version chunk
      chunks.push(buildChangelogChunk(currentLines, currentStart, i, relPath, source, currentVersion));
      currentLines = [];
      currentStart = i + 1;
    }

    if (match) {
      currentVersion = match[1];
      currentStart = currentLines.length === 0 ? i + 1 : currentStart;
    }

    currentLines.push(lines[i]);
  }

  // Emit final chunk
  if (currentLines.length > 0 && currentVersion) {
    chunks.push(buildChangelogChunk(currentLines, currentStart, lines.length, relPath, source, currentVersion));
  }

  return chunks;
}

function buildChangelogChunk(lines, startLine, endLineExclusive, relPath, source, version) {
  const text = `// File: ${relPath} (lines ${startLine}-${endLineExclusive})\n${lines.join('\n')}`;
  const hash = createHash('sha256').update(text).digest('hex');
  const id = `${hash.slice(0, 12)}-${startLine}`;

  return {
    id,
    path: relPath,
    source,
    startLine,
    endLine: endLineExclusive,
    text,
    hash,
    contentType: 'release',
    language: 'markdown',
    category: 'release-notes',
    version,
  };
}
```

Then modify `chunkFile` to detect changelog:

```javascript
export function chunkFile(content, relPath, source) {
  // Detect CHANGELOG.md for version-bounded chunking
  if (relPath.toLowerCase().endsWith('changelog.md')) {
    return chunkChangelog(content, relPath, source);
  }

  // ... existing logic
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/chunker.js
git commit -m "feat(chunker): version-bounded changelog chunking"
```

---

### Task 17: Convert scripts/ to thin wrappers

**Files:**
- Modify: `scripts/index.js`
- Modify: `scripts/query.js`

- [ ] **Step 1: Replace scripts/index.js with thin wrapper**

```javascript
#!/usr/bin/env node
import { handler } from '../commands/index.js';

const force = process.argv.includes('--force');
const releaseIdx = process.argv.indexOf('--release');
const release = releaseIdx !== -1 ? process.argv[releaseIdx + 1] : undefined;
handler({ force, release });
```

- [ ] **Step 2: Replace scripts/query.js with thin wrapper**

```javascript
#!/usr/bin/env node
import { handler } from '../commands/query.js';

// Parse minimal args for backward compat
const args = process.argv.slice(2);
const opts = {};

// Extract flags
if (args.includes('--docs')) opts.docs = true;
if (args.includes('--code')) opts.code = true;
if (args.includes('--skills')) opts.skills = true;
if (args.includes('--verify')) opts.verify = true;
if (args.includes('--releases')) opts.releases = true;
if (args.includes('--json')) opts.json = true;
if (args.includes('--offline')) opts.offline = true;
if (args.includes('--stats')) {
  // Legacy: redirect to stats command
  const { handler: statsHandler } = await import('../commands/stats.js');
  statsHandler();
} else if (args.includes('--latest-release')) {
  const { handler: latestHandler } = await import('../commands/latest.js');
  latestHandler();
} else if (args.includes('--release-history')) {
  const { handler: historyHandler } = await import('../commands/history.js');
  historyHandler();
} else if (args.includes('--since-release')) {
  const idx = args.indexOf('--since-release');
  const { handler: sinceHandler } = await import('../commands/since.js');
  sinceHandler({ version: args[idx + 1] });
} else {
  const topIdx = args.indexOf('--top');
  if (topIdx !== -1) opts.top = args[topIdx + 1];

  // Positionals = query text (everything not a flag)
  const query = args.filter(a => !a.startsWith('--') && a !== opts.top).join(' ');
  opts.query = query;
  handler(opts);
}
```

- [ ] **Step 3: Test backward compat**

Run: `npm run query -- "test" --offline`

Expected: Same results as `node bin/cli.js query "test" --offline`

- [ ] **Step 4: Commit**

```bash
git add scripts/index.js scripts/query.js
git commit -m "refactor(scripts): convert to thin wrappers delegating to commands/"
```

---

### Task 18: Delete shell scripts

**Files:**
- Delete: `scripts/sync-latest-tag.sh`
- Delete: `scripts/install.sh`

- [ ] **Step 1: Remove shell scripts**

```bash
git rm scripts/sync-latest-tag.sh scripts/install.sh
```

- [ ] **Step 2: Commit**

```bash
git commit -m "chore: remove shell scripts replaced by Node.js commands"
```

---

## Chunk 7: Final Assembly + Verification

### Task 19: Verify all commands registered in bin/cli.js

**Files:**
- Modify: `bin/cli.js` (final version)

- [ ] **Step 1: Ensure all imports and registrations are present**

Final `bin/cli.js` should have:

```javascript
#!/usr/bin/env node

import { Command } from 'commander';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf-8'));
const program = new Command();

program
  .name('openclaw-kb')
  .description('Self-updating vector knowledge base for OpenClaw')
  .version(pkg.version);

import { register as registerQuery } from '../commands/query.js';
import { register as registerIndex } from '../commands/index.js';
import { register as registerSync } from '../commands/sync.js';
import { register as registerStats } from '../commands/stats.js';
import { register as registerLatest } from '../commands/latest.js';
import { register as registerHistory } from '../commands/history.js';
import { register as registerSince } from '../commands/since.js';
import { register as registerInstallService } from '../commands/install-service.js';
import { registerDocs, registerCode, registerSkills, registerVerify } from '../commands/aliases.js';

registerQuery(program);
registerIndex(program);
registerSync(program);
registerStats(program);
registerLatest(program);
registerHistory(program);
registerSince(program);
registerInstallService(program);
registerDocs(program);
registerCode(program);
registerSkills(program);
registerVerify(program);

program.parse();
```

- [ ] **Step 2: Test full help**

Run: `node bin/cli.js --help`

Expected: All 12 subcommands listed (query, index, sync, stats, latest, history, since, install-service, docs, code, skills, verify).

- [ ] **Step 3: Commit**

```bash
git add bin/cli.js
git commit -m "feat(cli): register all subcommands in final assembly"
```

---

### Task 20: End-to-end smoke test

- [ ] **Step 1: Test CLI basics**

```bash
node bin/cli.js --version        # 1.1.0
node bin/cli.js --help           # all subcommands
node bin/cli.js query --help     # query flags including --offline, --ios, --macos, --shared
```

- [ ] **Step 2: Test read-only commands (no API key needed)**

```bash
node bin/cli.js stats
node bin/cli.js latest
node bin/cli.js history
```

- [ ] **Step 3: Test offline query**

```bash
node bin/cli.js query "sandbox" --offline
node bin/cli.js docs "sandbox" --offline
```

- [ ] **Step 4: Test exit codes**

```bash
node bin/cli.js docs "xyznonexistent12345" --offline; echo "Exit code: $?"
# Expected: Exit code: 3
```

- [ ] **Step 5: Test npm link**

```bash
npm link
openclaw-kb --version    # 1.1.0
openclaw-kb stats
openclaw-kb docs "test" --offline
npm unlink -g openclaw-kb
```

- [ ] **Step 6: Commit any fixes from smoke test**

---

### Task 21: Update .env.example

**Files:**
- Modify: `.env.example`

- [ ] **Step 1: Add new env vars**

Add to `.env.example`:

```bash
# KB_EMBEDDING_PROVIDER=openai           # or 'local' for ONNX
# KB_LOCAL_MODEL=all-MiniLM-L6-v2        # ONNX model when provider=local
# KB_LOG_DIR=/custom/log/path            # Override log directory
```

- [ ] **Step 2: Commit**

```bash
git add .env.example
git commit -m "docs: add new env vars to .env.example"
```

---

### Task 22: Final commit — mark spec as implemented

- [ ] **Step 1: Update spec status**

Change `**Status:** Approved` to `**Status:** Implemented` in `docs/specs/2026-03-16-npm-package-design.md`.

- [ ] **Step 2: Commit**

```bash
git add docs/specs/2026-03-16-npm-package-design.md
git commit -m "docs: mark npm package spec as implemented"
```
