import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// --- Getter functions (read env at call time, so CLI overrides work after import) ---

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
  return join(getKbDataDir(), 'openclaw.db');
}

export function getLogDir() {
  return process.env.KB_LOG_DIR
    ? resolve(process.env.KB_LOG_DIR)
    : join(getKbDataDir(), 'log');
}

export function getGitRemote() {
  return process.env.KB_GIT_REMOTE || 'upstream';
}

// --- Static exports for backward compatibility (read at import time) ---

// Use environment variable or default to source directory inside this repo
export const UPSTREAM_ROOT = process.env.UPSTREAM_DIR
  ? resolve(process.env.UPSTREAM_DIR)
  : resolve(join(__dirname, '..', 'source'));

export const DB_PATH = process.env.KB_DATA_DIR
  ? resolve(join(process.env.KB_DATA_DIR, 'openclaw.db'))
  : join(__dirname, '..', 'data', 'openclaw.db');

export const LOG_DIR = process.env.KB_LOG_DIR
  ? resolve(process.env.KB_LOG_DIR)
  : process.env.KB_DATA_DIR
    ? resolve(join(process.env.KB_DATA_DIR, 'log'))
    : join(__dirname, '..', 'data', 'log');

export const ENV_PATH = join(__dirname, '..', '.env');

// --- Embedding configuration ---

// Support environment-based model selection for A/B testing
export const EMBEDDING_MODEL = process.env.KB_EMBEDDING_MODEL || 'text-embedding-3-small';
export const EMBEDDING_PROVIDER = process.env.KB_EMBEDDING_PROVIDER || 'openai';
export const LOCAL_MODEL = process.env.KB_LOCAL_MODEL || 'all-MiniLM-L6-v2';

/**
 * Get embedding dimensions based on model name.
 * @param {string} model - Embedding model name
 * @returns {number} - Embedding dimensions
 */
function getEmbeddingDims(model) {
  const dims = {
    'text-embedding-3-small': 1536,
    'text-embedding-3-large': 3072,
    'nomic-embed-text-v2': 768,
    'all-MiniLM-L6-v2': 384,
  };
  return dims[model] || 1536;
}

export const EMBEDDING_DIMS = EMBEDDING_PROVIDER === 'local'
  ? getEmbeddingDims(LOCAL_MODEL)
  : getEmbeddingDims(EMBEDDING_MODEL);

export const CHUNK_MAX_CHARS = 1600;       // ~400 tokens
export const CHUNK_OVERLAP_CHARS = 200;    // ~50 tokens overlap
export const EMBEDDING_BATCH_SIZE = 50;    // texts per API call
export const EMBEDDING_API_URL = 'https://api.openai.com/v1/embeddings';
export const MAX_EMBEDDING_SAFE_CHARS = 6000;

// Hybrid search weights
export const VECTOR_WEIGHT = 0.7;
export const TEXT_WEIGHT = 0.3;

// Sources to index with glob patterns (relative to UPSTREAM_ROOT)
export const SOURCES = [
  {
    name: 'docs',
    globs: ['docs/**/*.md'],
    exclude: ['docs/ja-JP/**', 'docs/zh-CN/**', 'docs/.i18n/**'],
  },
  {
    name: 'src',
    globs: ['src/**/*.ts', 'src/**/*.js', 'src/**/*.md'],
    exclude: [
      '**/*.test.ts',
      '**/*.test.js',
      '**/*.raw-stream.ts',
      '**/*.min.js',
      '**/*.bundle.js',
      '**/*.generated.ts',
      '**/*.generated.js',
      '**/vendor/**',
      '**/assets/*.js',
      '**/node_modules/**',
      '**/CLAUDE.md',
    ],
  },
  {
    name: 'extensions',
    globs: ['extensions/**/*.ts', 'extensions/**/*.js', 'extensions/**/*.md'],
    exclude: [
      '**/*.test.ts',
      '**/*.test.js',
      '**/*.min.js',
      '**/*.bundle.js',
      '**/*.generated.ts',
      '**/*.generated.js',
      '**/vendor/**',
      '**/assets/*.js',
      '**/node_modules/**',
    ],
  },
  {
    name: 'skills',
    globs: ['skills/*/SKILL.md', 'skills/*/handler.ts'],
    exclude: [],
  },
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
];
