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
    .action(async (textParts, opts) => {
      await handler({ query: textParts.join(' '), ...opts });
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
      results = searchFTS(expandedQuery, limit, sourceFilter, contentTypeFilter);
    } else {
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
      const codeEmbedding = await embedQuery(expandedQuery);
      const codeResults = hybridSearch(codeEmbedding, expandedQuery, 5, null, 'code');
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
