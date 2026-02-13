#!/usr/bin/env node
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { ENV_PATH, EMBEDDING_MODEL } from './lib/config.js';
import { embedQuery } from './lib/embedder.js';
import { openDb, closeDb, hybridSearch } from './lib/db.js';

// Load .env
loadEnv();

const MODELS = [
  { name: 'text-embedding-3-small', dims: 1536, cost: 0.02 },
  { name: 'text-embedding-3-large', dims: 3072, cost: 0.13 },
];

const { values: flags } = parseArgs({
  options: {
    model: { type: 'string', default: 'current' },
    verbose: { type: 'boolean', default: false },
  },
  strict: false,
});

async function main() {
  // Load test queries
  const testData = JSON.parse(readFileSync('test-queries.json', 'utf-8'));
  const queries = testData.queries;

  console.log('=== KB Model Evaluation ===\n');

  // Determine which model is being tested
  const currentModel = EMBEDDING_MODEL;
  const modelToTest = flags.model === 'current' ? currentModel : flags.model;

  console.log(`Testing model: ${modelToTest}`);

  if (modelToTest !== currentModel) {
    console.error(`\n⚠️  ERROR: Environment model (${currentModel}) doesn't match requested model (${modelToTest})`);
    console.error('Set KB_EMBEDDING_MODEL environment variable and reindex first:\n');
    console.error(`  KB_EMBEDDING_MODEL=${modelToTest} node index.js --force`);
    console.error(`  node test-models.js --model ${modelToTest}\n`);
    process.exit(1);
  }

  const modelInfo = MODELS.find(m => m.name === currentModel);
  if (modelInfo) {
    console.log(`Dimensions: ${modelInfo.dims}, Cost: $${modelInfo.cost}/M tokens\n`);
  }

  console.log(`Running ${queries.length} test queries...\n`);

  openDb();
  const results = [];

  for (let i = 0; i < queries.length; i++) {
    const query = queries[i];

    if (flags.verbose) {
      console.log(`[${i+1}/${queries.length}] ${query.id}: "${query.text}"`);
    } else {
      process.stdout.write(`Progress: ${i+1}/${queries.length}...\r`);
    }

    try {
      // Embed and search
      const embedding = await embedQuery(query.text);
      const searchResults = hybridSearch(embedding, query.text, 10);

      // Calculate metrics
      const metrics = calculateMetrics(searchResults, query.expectedResults);

      results.push({
        queryId: query.id,
        text: query.text,
        category: query.category,
        ...metrics,
        topResults: searchResults.slice(0, 5).map(r => ({
          path: r.path,
          score: r.score.toFixed(4),
          lines: `${r.startLine}-${r.endLine}`,
          contentType: r.contentType,
        })),
      });

      if (flags.verbose) {
        console.log(`  MRR: ${metrics.mrr.toFixed(3)}, Recall@5: ${metrics.recall5.toFixed(3)}, Top Score: ${metrics.topScore.toFixed(4)}`);
        console.log(`  Top result: ${searchResults[0]?.path || 'none'}\n`);
      }
    } catch (err) {
      console.error(`\n  ERROR on query ${query.id}: ${err.message}`);
      results.push({
        queryId: query.id,
        text: query.text,
        category: query.category,
        error: err.message,
        mrr: 0,
        recall5: 0,
        topScore: 0,
      });
    }
  }

  closeDb();

  // Calculate aggregate metrics
  const validResults = results.filter(r => !r.error);
  const avgMRR = validResults.reduce((sum, r) => sum + r.mrr, 0) / validResults.length;
  const avgRecall5 = validResults.reduce((sum, r) => sum + r.recall5, 0) / validResults.length;
  const avgTopScore = validResults.reduce((sum, r) => sum + r.topScore, 0) / validResults.length;

  console.log('\n\n=== Results Summary ===\n');
  console.log(`Model: ${currentModel}`);
  console.log(`Queries: ${validResults.length}/${queries.length} successful`);
  console.log(`Avg MRR: ${avgMRR.toFixed(3)}`);
  console.log(`Avg Recall@5: ${avgRecall5.toFixed(3)}`);
  console.log(`Avg Top Score: ${avgTopScore.toFixed(4)}`);

  // Save results
  if (!existsSync('test-results')) mkdirSync('test-results');
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const outFile = `test-results/model-${currentModel.replace(/[/:]/g, '-')}-${timestamp}.json`;

  const output = {
    model: currentModel,
    timestamp: new Date().toISOString(),
    metrics: {
      avgMRR,
      avgRecall5,
      avgTopScore,
    },
    results,
  };

  writeFileSync(outFile, JSON.stringify(output, null, 2));
  console.log(`\nResults saved to: ${outFile}`);
  console.log('\nTo compare models, run:');
  console.log(`  node compare-results.js ${outFile} <other-result-file.json>`);
}

/**
 * Calculate evaluation metrics for a single query.
 * @param {Array} results - Search results
 * @param {Array} expectedPaths - Expected result path fragments
 * @returns {{ mrr: number, recall5: number, topScore: number }}
 */
function calculateMetrics(results, expectedPaths) {
  // Mean Reciprocal Rank (MRR): 1/position of first relevant result
  let reciprocalRank = 0;
  for (let i = 0; i < results.length; i++) {
    const path = results[i].path;
    const isRelevant = expectedPaths.some(expected => path.includes(expected));
    if (isRelevant) {
      reciprocalRank = 1 / (i + 1);
      break;
    }
  }

  // Recall@5: fraction of expected results found in top 5
  const top5Paths = results.slice(0, 5).map(r => r.path);
  const foundCount = expectedPaths.filter(expected =>
    top5Paths.some(path => path.includes(expected))
  ).length;
  const recall5 = expectedPaths.length > 0 ? foundCount / expectedPaths.length : 0;

  // Top score (quality indicator)
  const topScore = results.length > 0 ? results[0].score : 0;

  return { mrr: reciprocalRank, recall5, topScore };
}

/**
 * Load environment variables from .env file.
 */
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
      if (!process.env[key]) process.env[key] = value;
    }
  } catch (err) {
    // .env optional
  }
}

main().catch(err => {
  console.error('\nFatal error:', err);
  process.exit(1);
});
