# CLAUDE.md — openclaw-kb

## Project

Self-updating vector knowledge base for OpenClaw. Indexes docs, source code, skills, and configs into a SQLite vector DB with hybrid search (vector + keyword + RRF fusion). Exposes an MCP server for native AI tool integration.

## Stack

- Node.js 22+ (ESM, `"type": "module"`)
- SQLite with sqlite-vec extension for vector similarity
- FTS5 for keyword matching
- commander v14 for CLI
- @modelcontextprotocol/sdk for MCP server (stdio transport)
- @huggingface/transformers (optional, for local ONNX embeddings)
- mise for tool management

## Setup

```bash
just setup   # npm install
```

## Structure

```
bin/cli.js              # CLI entry point (commander)
commands/*.js           # Subcommands (each exports register + handler)
commands/mcp-serve.js   # MCP server — imports from lib/ directly (not handlers)
lib/config.js           # Config with getter functions for CLI overrides
lib/embedder.js         # Provider abstraction (OpenAI + local ONNX)
lib/chunker.js          # Text chunking (semantic boundaries, Swift, changelog)
lib/db.js               # SQLite operations, hybrid search
lib/synonyms.js         # Query expansion
lib/release-parser.js   # Release metadata extraction
lib/exit-codes.js       # Exit code constants (0/1/2/3)
scripts/                # Thin wrappers for backward compat (npm run index/query)
scripts/tools/          # Dev tools (not published)
```

## Key patterns

- **Config getters**: `getUpstreamRoot()`, `getDbPath()`, `getLogDir()` — read env vars on demand so CLI `--upstream-dir` / `--data-dir` overrides work after module load
- **Static exports**: `UPSTREAM_ROOT`, `DB_PATH` etc. exist for backward compat but commands that accept CLI overrides must use the getters
- **Command pattern**: each `commands/*.js` exports `register(program)` for commander and `handler(options)` for standalone/programmatic use
- **MCP server**: `commands/mcp-serve.js` does NOT call handler() functions (they call process.exit). Instead it imports directly from `lib/` and returns structured MCP responses
- **Exit codes**: 0=success, 1=runtime error, 2=config error, 3=no results (in `lib/exit-codes.js`)
- **Embedding provider**: `KB_EMBEDDING_PROVIDER=openai|local` — embedder.js dispatches transparently
- **Version**: never hardcode — always read from package.json at runtime

## CLI Commands

```bash
openclaw-kb query <text> [--docs|--code|--skills|--ios|--macos|--shared|--releases|--verify] [--json] [--top N] [--offline]
openclaw-kb docs|code|skills|verify <text>   # short aliases
openclaw-kb index [--force] [--release <tag>]
openclaw-kb sync [--upstream-dir <path>] [--data-dir <path>]
openclaw-kb stats|latest|history
openclaw-kb since <version>
openclaw-kb install-service [--interval 2h] [--env-file <path>] [--upstream-dir <path>] [--data-dir <path>]
openclaw-kb mcp-serve                        # start MCP server (stdio)
```

## MCP Server

9 read-only tools over stdio transport:

| Tool | Description |
|------|-------------|
| `search` | Full hybrid search with mode, top, offline params |
| `search_docs` | Docs-only shortcut |
| `search_code` | Code-only shortcut |
| `search_skills` | Skills-only shortcut |
| `search_ios` | iOS Swift sources shortcut |
| `get_stats` | DB statistics |
| `get_latest` | Current indexed version |
| `get_history` | Last 10 releases |
| `get_since` | Changes since a version |

Consumer config (`.mcp.json`):
```json
{
  "mcpServers": {
    "openclaw-kb": {
      "command": "openclaw-kb",
      "args": ["mcp-serve"],
      "env": {
        "KB_DATA_DIR": "/path/to/data",
        "UPSTREAM_DIR": "/path/to/upstream"
      }
    }
  }
}
```

## Environment variables

| Variable | Default | Notes |
|----------|---------|-------|
| `UPSTREAM_DIR` | `./source` | OpenClaw git checkout |
| `KB_DATA_DIR` | `./data` | SQLite DB + logs |
| `OPENAI_API_KEY` | required | Only for openai provider |
| `KB_EMBEDDING_PROVIDER` | `openai` | `local` for ONNX |
| `KB_EMBEDDING_MODEL` | `text-embedding-3-small` | OpenAI model |
| `KB_LOCAL_MODEL` | `all-MiniLM-L6-v2` | ONNX model |
| `KB_LOG_DIR` | `$KB_DATA_DIR/log` | Override log path |

## Testing

```bash
node bin/cli.js --version           # 1.2.1
node bin/cli.js stats               # DB stats (no API key needed)
node bin/cli.js query "test" --offline  # FTS-only, no API key
```

## Publishing

Trusted publisher via OIDC — no npm token needed. Push a `v*` tag after updating `package.json` and `CHANGELOG.md`:

```bash
git tag v1.2.1
git push origin main --tags
```

## MCP

When configuring `openclaw-kb` as an MCP server, explicitly pass `KB_DATA_DIR` and `UPSTREAM_DIR` in the MCP server `env`. Some MCP hosts do not inherit the shell or `mise` environment, and the server can otherwise attach to the wrong database or upstream checkout.

GitHub Actions (Node 24) runs `npm publish` with automatic OIDC auth and provenance.
