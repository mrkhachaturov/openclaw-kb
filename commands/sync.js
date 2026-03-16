/**
 * sync command — fetches the latest upstream tag and reindexes if needed.
 * Replaces scripts/sync-latest-tag.sh with a pure Node.js implementation.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, appendFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { getUpstreamRoot, getLogDir, EMBEDDING_PROVIDER } from '../lib/config.js';
import { EXIT_SUCCESS, EXIT_RUNTIME_ERROR, EXIT_CONFIG_ERROR } from '../lib/exit-codes.js';
import { handler as indexHandler } from './index.js';

// Includes apps/ for iOS/macOS/shared sources
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

  // Use getter functions so CLI overrides take effect
  const upstreamDir = getUpstreamRoot();
  const logDir = getLogDir();
  const syncLog = join(logDir, 'sync.log');
  mkdirSync(logDir, { recursive: true });

  function log(msg) {
    const ts = new Date().toISOString();
    appendFileSync(syncLog, `${ts} | ${msg}\n`);
  }

  // Validate upstream exists and is a git repo
  if (!existsSync(upstreamDir)) {
    console.error(`Error: Upstream directory not found: ${upstreamDir}`);
    process.exit(EXIT_CONFIG_ERROR);
  }
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
    const tags = git(['tag', '--list', 'v2026.*', '--sort=-v:refname']);
    const latestTag = tags.split('\n')[0];
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
    const relevant = changed.split('\n').filter(f => f && KB_PREFIXES.test(f));

    // Stash local changes if any
    try {
      execFileSync('git', ['diff', '--quiet'], { cwd: upstreamDir });
      execFileSync('git', ['diff', '--cached', '--quiet'], { cwd: upstreamDir });
    } catch {
      console.log('[sync] Stashing local changes...');
      git(['stash', 'push', '-m', `kb-sync: before ${latestTag}`, '--quiet']);
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
    console.log(`[sync] KB upgraded to ${latestTag}`);
    process.exit(EXIT_SUCCESS);
  } catch (err) {
    console.error('[sync] Error:', err.message);
    log(`ERROR: ${err.message}`);
    process.exit(EXIT_RUNTIME_ERROR);
  }
}
