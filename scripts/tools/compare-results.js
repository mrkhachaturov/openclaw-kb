#!/usr/bin/env node
import { readFileSync } from 'node:fs';

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error('Usage: node compare-results.js <result-file-1.json> [result-file-2.json ...]');
  console.error('\nExample:');
  console.error('  node compare-results.js test-results/model-*.json');
  process.exit(1);
}

// Load all result files
const allResults = [];
for (const file of args) {
  try {
    const data = JSON.parse(readFileSync(file, 'utf-8'));
    allResults.push({ file, ...data });
  } catch (err) {
    console.error(`Error loading ${file}: ${err.message}`);
    process.exit(1);
  }
}

if (allResults.length === 0) {
  console.error('No valid result files found');
  process.exit(1);
}

console.log('=== Embedding Model Comparison ===\n');

// Print comparison table
console.log('Model                           | Avg MRR | Avg Recall@5 | Avg Top Score | File');
console.log('--------------------------------|---------|--------------|---------------|' + '-'.repeat(40));

for (const result of allResults) {
  const modelPadded = result.model.padEnd(31);
  const mrrStr = result.metrics.avgMRR.toFixed(3);
  const recallStr = result.metrics.avgRecall5.toFixed(3);
  const scoreStr = result.metrics.avgTopScore.toFixed(4);
  const fileName = result.file.split('/').pop().slice(0, 40);

  console.log(`${modelPadded} | ${mrrStr}   | ${recallStr}       | ${scoreStr}      | ${fileName}`);
}

// If multiple results, calculate improvements
if (allResults.length > 1) {
  // Find baseline (text-embedding-3-small)
  const baseline = allResults.find(r => r.model === 'text-embedding-3-small') || allResults[0];

  console.log('\n=== Improvement vs Baseline (' + baseline.model + ') ===\n');

  for (const result of allResults) {
    if (result === baseline) continue;

    const mrrImprovement = ((result.metrics.avgMRR - baseline.metrics.avgMRR) / baseline.metrics.avgMRR * 100);
    const recallImprovement = ((result.metrics.avgRecall5 - baseline.metrics.avgRecall5) / baseline.metrics.avgRecall5 * 100);
    const scoreImprovement = ((result.metrics.avgTopScore - baseline.metrics.avgTopScore) / baseline.metrics.avgTopScore * 100);

    console.log(`${result.model}:`);
    console.log(`  MRR:       ${mrrImprovement > 0 ? '+' : ''}${mrrImprovement.toFixed(1)}%`);
    console.log(`  Recall@5:  ${recallImprovement > 0 ? '+' : ''}${recallImprovement.toFixed(1)}%`);
    console.log(`  Top Score: ${scoreImprovement > 0 ? '+' : ''}${scoreImprovement.toFixed(1)}%\n`);
  }

  // Decision recommendation (only if comparing 3-small vs 3-large)
  const largeModel = allResults.find(r => r.model === 'text-embedding-3-large');

  if (baseline.model === 'text-embedding-3-small' && largeModel) {
    const mrrImprovement = ((largeModel.metrics.avgMRR - baseline.metrics.avgMRR) / baseline.metrics.avgMRR * 100);

    console.log('=== Recommendation ===\n');

    if (mrrImprovement > 30) {
      console.log('✅ UPGRADE to text-embedding-3-large');
      console.log(`   MRR improvement: +${mrrImprovement.toFixed(1)}% (>30% threshold)`);
      console.log('   Quality gain justifies 6.5x cost increase ($0.02 → $0.13 per M tokens)');
    } else if (mrrImprovement < 15) {
      console.log('❌ KEEP text-embedding-3-small');
      console.log(`   MRR improvement: +${mrrImprovement.toFixed(1)}% (<15% threshold)`);
      console.log('   Quality gain does NOT justify 6.5x cost increase');
    } else {
      console.log('⚠️  CONSIDER upgrading to text-embedding-3-large');
      console.log(`   MRR improvement: +${mrrImprovement.toFixed(1)}% (15-30% marginal zone)`);
      console.log('   Analyze per-category performance before deciding');
      console.log('   Cost impact: 6.5x increase ($0.02 → $0.13 per M tokens)');
    }

    // Cost analysis
    const baselineAnnualCost = 0.52; // From plan document
    const largeAnnualCost = 3.20;

    console.log('\n=== Cost Analysis ===\n');
    console.log(`Current (3-small):  $${baselineAnnualCost.toFixed(2)}/year`);
    console.log(`If upgrade (3-large): $${largeAnnualCost.toFixed(2)}/year`);
    console.log(`Annual increase:    $${(largeAnnualCost - baselineAnnualCost).toFixed(2)}/year`);
  }
}

// Per-category breakdown (if requested)
if (process.argv.includes('--detailed')) {
  console.log('\n=== Per-Category Breakdown ===\n');

  for (const result of allResults) {
    console.log(`\n${result.model}:`);

    const categories = {};
    for (const r of result.results) {
      if (!categories[r.category]) {
        categories[r.category] = { mrr: [], recall5: [], topScore: [] };
      }
      categories[r.category].mrr.push(r.mrr || 0);
      categories[r.category].recall5.push(r.recall5 || 0);
      categories[r.category].topScore.push(r.topScore || 0);
    }

    for (const [category, metrics] of Object.entries(categories)) {
      const avgMRR = metrics.mrr.reduce((a, b) => a + b, 0) / metrics.mrr.length;
      const avgRecall = metrics.recall5.reduce((a, b) => a + b, 0) / metrics.recall5.length;

      console.log(`  ${category.padEnd(15)}: MRR=${avgMRR.toFixed(3)}, Recall@5=${avgRecall.toFixed(3)}`);
    }
  }
}

console.log('\nTo see per-category breakdown, run with --detailed flag');
