#!/usr/bin/env node
import { DatabaseSync } from 'node:sqlite';

const db = new DatabaseSync('./data/upstream.db');

const stats = db.prepare(`
  SELECT language,
         COUNT(*) as count,
         AVG(LENGTH(text)) as avg_size,
         MAX(LENGTH(text)) as max_size
  FROM chunks
  GROUP BY language
  ORDER BY count DESC
`).all();

console.log('\nChunk Statistics by Language:');
console.log('Language     | Count | Avg Size | Max Size');
console.log('-------------|-------|----------|----------');

stats.forEach(s => {
  const lang = (s.language || 'null').padEnd(12);
  const count = String(s.count).padStart(5);
  const avg = String(Math.round(s.avg_size)).padStart(8);
  const max = String(s.max_size).padStart(8);
  console.log(`${lang} | ${count} | ${avg} | ${max}`);
});

// Check specifically for TypeScript code chunks
const tsStats = db.prepare(`
  SELECT COUNT(*) as count,
         MIN(LENGTH(text)) as min_size,
         AVG(LENGTH(text)) as avg_size,
         MAX(LENGTH(text)) as max_size
  FROM chunks
  WHERE language = 'typescript'
`).get();

console.log('\nTypeScript Code Chunks (target: avg 800-1200, max ~1440):');
console.log(`  Count: ${tsStats.count}`);
console.log(`  Min:   ${tsStats.min_size} chars`);
console.log(`  Avg:   ${Math.round(tsStats.avg_size)} chars`);
console.log(`  Max:   ${tsStats.max_size} chars`);

// Check for markdown doc chunks
const mdStats = db.prepare(`
  SELECT COUNT(*) as count,
         MIN(LENGTH(text)) as min_size,
         AVG(LENGTH(text)) as avg_size,
         MAX(LENGTH(text)) as max_size
  FROM chunks
  WHERE language = 'markdown'
`).get();

console.log('\nMarkdown Doc Chunks (target: avg ~1400-1600, max ~1920):');
console.log(`  Count: ${mdStats.count}`);
console.log(`  Min:   ${mdStats.min_size} chars`);
console.log(`  Avg:   ${Math.round(mdStats.avg_size)} chars`);
console.log(`  Max:   ${mdStats.max_size} chars`);

db.close();
