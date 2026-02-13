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
    name: 'config',
    globs: ['src/config/types.*.ts', 'src/config/zod-schema.*.ts'],
    exclude: ['**/*.test.ts'],
  },
  {
    name: 'gateway',
    globs: ['src/gateway/server*.ts', 'src/gateway/server-methods/**/*.ts'],
    exclude: ['**/*.test.ts'],
  },
  {
    name: 'telegram',
    globs: ['src/telegram/bot*.ts', 'src/telegram/send.ts', 'src/telegram/accounts.ts'],
    exclude: ['**/*.test.ts'],
  },
  {
    name: 'skills',
    globs: ['skills/*/SKILL.md'],
    exclude: [],
  },
  {
    name: 'agents',
    globs: ['src/agents/*.ts'],
    exclude: ['**/*.test.ts'],
  },
  {
    name: 'memory',
    globs: ['src/memory/manager.ts', 'src/memory/hybrid.ts', 'src/memory/search-manager.ts'],
    exclude: ['**/*.test.ts'],
  },
  // NEW: Infrastructure & deployment
  {
    name: 'infra',
    globs: ['src/infra/*.ts', 'src/infra/tls/*.ts', 'src/infra/net/*.ts'],
    exclude: ['**/*.test.ts'],
  },
  // NEW: Security & sandboxing
  {
    name: 'security',
    globs: ['src/security/*.ts', 'src/security/sandbox/*.ts'],
    exclude: ['**/*.test.ts'],
  },
  // NEW: Hooks system (automation)
  {
    name: 'hooks',
    globs: ['src/hooks/*.ts', 'src/automation/*.ts'],
    exclude: ['**/*.test.ts'],
  },
  // NEW: Session management
  {
    name: 'sessions',
    globs: ['src/sessions/*.ts'],
    exclude: ['**/*.test.ts'],
  },
  // NEW: Channel implementations (Telegram, Discord, WhatsApp)
  {
    name: 'channels',
    globs: [
      'src/channels/*.ts',
      'src/telegram/*.ts',
      'src/discord/*.ts',
      'src/whatsapp/*.ts',
    ],
    exclude: ['**/*.test.ts', '**/*.raw-stream.ts'],
  },
  // NEW: Provider implementations (LLM integrations)
  {
    name: 'providers',
    globs: ['src/providers/*.ts', 'src/providers/anthropic/*.ts'],
    exclude: ['**/*.test.ts'],
  },
  // NEW: Plugin system
  {
    name: 'plugins',
    globs: ['src/plugins/*.ts', 'src/plugins/runtime/*.ts'],
    exclude: ['**/*.test.ts'],
  },
  // NEW: Skill examples (real-world patterns)
  {
    name: 'skill-examples',
    globs: ['skills/*/SKILL.md', 'skills/*/handler.ts'],
    exclude: [],
  },
];
