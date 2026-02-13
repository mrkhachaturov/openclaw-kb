import { EMBEDDING_MODEL, EMBEDDING_API_URL, EMBEDDING_BATCH_SIZE } from './config.js';

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;

/**
 * Embed a single text string.
 * @param {string} text
 * @returns {Promise<number[]>}
 */
export async function embedQuery(text) {
  const [embedding] = await embedBatch([text]);
  return embedding;
}

/**
 * Embed multiple texts in batches, with rate limit handling.
 * @param {string[]} texts
 * @param {(done: number, total: number) => void} [onProgress]
 * @returns {Promise<number[][]>}
 */
export async function embedAll(texts, onProgress) {
  const results = [];

  for (let i = 0; i < texts.length; i += EMBEDDING_BATCH_SIZE) {
    const batch = texts.slice(i, i + EMBEDDING_BATCH_SIZE);
    const embeddings = await embedBatch(batch);
    results.push(...embeddings);

    if (onProgress) {
      onProgress(Math.min(i + EMBEDDING_BATCH_SIZE, texts.length), texts.length);
    }
  }

  return results;
}

/**
 * Call OpenAI embeddings API for a batch of texts.
 * Retries on 429 (rate limit) with exponential backoff.
 * @param {string[]} texts
 * @returns {Promise<number[][]>}
 */
async function embedBatch(texts) {
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
      // API returns embeddings sorted by index
      return json.data
        .sort((a, b) => a.index - b.index)
        .map(d => d.embedding);
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

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
