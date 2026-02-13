import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Use environment variable or default to sibling directory
export const UPSTREAM_ROOT = process.env.UPSTREAM_DIR
  ? resolve(process.env.UPSTREAM_DIR)
  : resolve(join(__dirname, '..', '..', 'source'));

export const DB_PATH = join(__dirname, '..', 'data', 'upstream.db');
export const ENV_PATH = join(__dirname, '..', '.env');

// Support environment-based model selection for A/B testing
export const EMBEDDING_MODEL = process.env.KB_EMBEDDING_MODEL || 'text-embedding-3-small';
export const EMBEDDING_DIMS = getEmbeddingDims(EMBEDDING_MODEL);

/**
 * Get embedding dimensions based on model name.
 * @param {string} model - OpenAI embedding model name
 * @returns {number} - Embedding dimensions
 */
function getEmbeddingDims(model) {
  const dims = {
    'text-embedding-3-small': 1536,
    'text-embedding-3-large': 3072,
    'nomic-embed-text-v2': 768,
  };
  return dims[model] || 1536;
}
export const CHUNK_MAX_CHARS = 1600;       // ~400 tokens
export const CHUNK_OVERLAP_CHARS = 200;    // ~50 tokens overlap
export const EMBEDDING_BATCH_SIZE = 50;    // texts per API call
export const EMBEDDING_API_URL = 'https://api.openai.com/v1/embeddings';

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
    exclude: ['**/*.test.ts', '**/*.test.js', '**/*.raw-stream.ts', '**/CLAUDE.md'],
  },
  {
    name: 'extensions',
    globs: ['extensions/**/*.ts', 'extensions/**/*.js', 'extensions/**/*.md'],
    exclude: ['**/*.test.ts', '**/*.test.js'],
  },
  {
    name: 'skills',
    globs: ['skills/*/SKILL.md', 'skills/*/handler.ts'],
    exclude: [],
  },
];
