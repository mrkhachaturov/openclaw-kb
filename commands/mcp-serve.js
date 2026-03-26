import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { readFileSync } from 'node:fs';
import { openDb, hybridSearch, searchFTS, getStats, getCurrentIndexedRelease, getReleaseHistory, getChunksSinceRelease } from '../lib/db.js';
import { embedQuery } from '../lib/embedder.js';
import { expandQuery } from '../lib/synonyms.js';
import { EMBEDDING_PROVIDER } from '../lib/config.js';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf-8'));

export function register(program) {
  program
    .command('mcp-serve')
    .description('Start MCP server (stdio transport)')
    .action(() => handler());
}

export async function handler() {
  // Open DB once at startup — kept open for server lifetime
  try {
    openDb();
  } catch (err) {
    console.error(`Failed to open database: ${err.message}`);
    process.exit(1);
  }

  const server = new McpServer({
    name: 'openclaw-kb',
    version: pkg.version,
  });

  // --- Search tools ---

  server.tool(
    'search',
    'Hybrid search across the OpenClaw knowledge base. Combines vector similarity + keyword matching.',
    {
      query: z.string().describe('Search text'),
      mode: z.enum(['docs', 'code', 'skills', 'ios', 'macos', 'shared', 'releases', 'verify']).optional().describe('Content filter'),
      top: z.number().default(8).describe('Max results'),
      offline: z.boolean().default(false).describe('FTS-only keyword search, no API key needed'),
    },
    async ({ query, mode, top, offline }) => {
      return await doSearch(query, mode, top, offline);
    }
  );

  server.tool(
    'search_docs',
    'Search OpenClaw documentation only.',
    {
      query: z.string().describe('Search text'),
      top: z.number().default(8).describe('Max results'),
    },
    async ({ query, top }) => {
      return await doSearch(query, 'docs', top, false);
    }
  );

  server.tool(
    'search_code',
    'Search OpenClaw source code only.',
    {
      query: z.string().describe('Search text'),
      top: z.number().default(8).describe('Max results'),
    },
    async ({ query, top }) => {
      return await doSearch(query, 'code', top, false);
    }
  );

  server.tool(
    'search_skills',
    'Search OpenClaw skills (SKILL.md, handler patterns).',
    {
      query: z.string().describe('Search text'),
      top: z.number().default(8).describe('Max results'),
    },
    async ({ query, top }) => {
      return await doSearch(query, 'skills', top, false);
    }
  );

  server.tool(
    'search_ios',
    'Search OpenClaw iOS Swift sources (apps/ios/).',
    {
      query: z.string().describe('Search text'),
      top: z.number().default(8).describe('Max results'),
    },
    async ({ query, top }) => {
      return await doSearch(query, 'ios', top, false);
    }
  );

  // --- Metadata tools ---

  server.tool(
    'get_stats',
    'Show database statistics (file count, chunk count, sources).',
    {},
    async () => {
      const stats = getStats();
      return { content: [{ type: 'text', text: JSON.stringify(stats, null, 2) }] };
    }
  );

  server.tool(
    'get_latest',
    'Show the current indexed OpenClaw release version.',
    {},
    async () => {
      const latest = getCurrentIndexedRelease();
      if (!latest) {
        return { content: [{ type: 'text', text: 'No releases tracked yet' }] };
      }
      const info = {
        tag: latest.tag,
        date: latest.date,
        commits_count: latest.commits_count,
        previous_tag: latest.previous_tag,
        kb_impact: latest.kb_impact,
        kb_files_changed: latest.kb_files_changed,
      };
      return { content: [{ type: 'text', text: JSON.stringify(info, null, 2) }] };
    }
  );

  server.tool(
    'get_history',
    'Show the last 10 indexed OpenClaw releases.',
    {},
    async () => {
      const history = getReleaseHistory(10);
      if (history.length === 0) {
        return { content: [{ type: 'text', text: 'No releases tracked yet' }] };
      }
      const formatted = history.map(r => ({
        tag: r.tag,
        date: r.date,
        commits_count: r.commits_count,
        kb_impact: r.kb_impact,
      }));
      return { content: [{ type: 'text', text: JSON.stringify(formatted, null, 2) }] };
    }
  );

  server.tool(
    'get_since',
    'Show what changed in the KB since a specific version.',
    {
      version: z.string().describe('Version tag (e.g. v2026.2.21)'),
    },
    async ({ version }) => {
      const chunks = getChunksSinceRelease(version, 100);
      if (chunks.length === 0) {
        return { content: [{ type: 'text', text: `No chunks found indexed since ${version}` }] };
      }
      const bySource = {};
      for (const c of chunks) {
        if (!bySource[c.source]) bySource[c.source] = [];
        bySource[c.source].push({
          path: c.path,
          lines: `${c.startLine}-${c.endLine}`,
          release: c.indexedRelease || 'untagged',
        });
      }
      return { content: [{ type: 'text', text: JSON.stringify(bySource, null, 2) }] };
    }
  );

  // --- Start server ---

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('openclaw-kb MCP server running on stdio');
}

// --- Shared search logic ---

async function doSearch(query, mode, top, offline) {
  let sourceFilter = null;
  let contentTypeFilter = null;

  if (mode === 'docs') contentTypeFilter = 'docs';
  else if (mode === 'code') contentTypeFilter = 'code';
  else if (mode === 'skills') contentTypeFilter = 'skill';
  else if (mode === 'ios') sourceFilter = 'ios';
  else if (mode === 'macos') sourceFilter = 'macos';
  else if (mode === 'shared') sourceFilter = 'shared';
  else if (mode === 'releases') sourceFilter = 'releases';

  const expandedQuery = expandQuery(query);

  let results;
  if (offline) {
    results = searchFTS(expandedQuery, top, sourceFilter, contentTypeFilter);
  } else {
    if (EMBEDDING_PROVIDER === 'openai' && !process.env.OPENAI_API_KEY) {
      return {
        content: [{ type: 'text', text: 'OPENAI_API_KEY required for vector search. Use offline: true for keyword-only search.' }],
        isError: true,
      };
    }
    const queryEmbedding = await embedQuery(expandedQuery);
    results = hybridSearch(queryEmbedding, expandedQuery, top, sourceFilter, contentTypeFilter);
  }

  // Verify mode: append code results after docs
  if (mode === 'verify' && results.length > 0 && !offline) {
    const codeEmbedding = await embedQuery(expandedQuery);
    const codeResults = hybridSearch(codeEmbedding, expandedQuery, 5, null, 'code');
    results = [...results, ...codeResults];
  }

  if (results.length === 0) {
    return { content: [{ type: 'text', text: 'No results found.' }] };
  }

  const formatted = results.map(r => ({
    score: Math.round(r.score * 1000) / 1000,
    path: r.path,
    lines: `${r.startLine}-${r.endLine}`,
    source: r.source,
    contentType: r.contentType,
    language: r.language,
    category: r.category,
    snippet: r.text.slice(0, 800),
  }));

  return { content: [{ type: 'text', text: JSON.stringify(formatted, null, 2) }] };
}
