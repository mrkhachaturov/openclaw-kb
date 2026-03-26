# OpenClaw Knowledge Base

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D18-brightgreen)](https://nodejs.org/)

Self-updating vector knowledge base for OpenClaw — semantic search over docs, code, and configs with automatic release tracking.

## Install

### Via mise (recommended)

```toml
# mise.toml
[tools]
"npm:openclaw-kb" = "latest"

[env]
UPSTREAM_DIR = "{{ config_root }}/build/openclaw/.upstream"

```

### For development

```bash
git clone https://github.com/mrkhachaturov/openclaw-kb.git
cd openclaw-kb
just setup   # npm install
```

## Usage

```bash
# Search documentation
openclaw-kb docs "sandbox configuration"

# Search source code
openclaw-kb code "TtsProviderSchema"

# Cross-reference docs + code
openclaw-kb verify "session persistence"

# Full query with filters
openclaw-kb query "webhook" --ios --json --top 5

# Offline keyword search (no API key needed)
openclaw-kb query "telegram" --offline

# Sync to latest upstream release
openclaw-kb sync --upstream-dir /path --data-dir /path

# Database info
openclaw-kb stats
openclaw-kb latest
openclaw-kb history
openclaw-kb since v2026.2.21

# Install auto-sync timer
openclaw-kb install-service --interval 2h \
  --upstream-dir /path/.upstream \
  --data-dir /path/data \
  --env-file /path/.env
```

## CLI Reference

| Command | Description |
|---------|-------------|
| `query <text>` | Hybrid search (vector + keyword + RRF fusion) |
| `docs <text>` | Search documentation only |
| `code <text>` | Search source code only |
| `skills <text>` | Search skills only |
| `verify <text>` | Two-pass: docs then related code |
| `index` | Reindex the knowledge base |
| `sync` | Fetch latest upstream tag and reindex |
| `stats` | Show database statistics |
| `latest` | Show current indexed version |
| `history` | Show last 10 releases |
| `since <version>` | What changed since a version |
| `install-service` | Generate systemd/launchd auto-sync |

### Query flags

| Flag | Effect |
|------|--------|
| `--docs` | Filter to documentation |
| `--code` | Filter to source code |
| `--skills` | Filter to skills |
| `--ios` | Filter to iOS Swift sources |
| `--macos` | Filter to macOS Swift sources |
| `--shared` | Filter to shared Swift package |
| `--releases` | Filter to release notes |
| `--verify` | Two-pass: docs then code |
| `--json` | Machine-readable JSON output |
| `--top <n>` | Number of results (default: 8) |
| `--offline` | FTS-only keyword search, no API key needed |

### Exit codes

| Code | Meaning |
|------|---------|
| `0` | Success |
| `1` | Runtime error |
| `2` | Configuration error |
| `3` | No results found |

## Environment Variables

| Variable | Purpose | Default |
|----------|---------|---------|
| `UPSTREAM_DIR` | OpenClaw source checkout | `./source` |
| `KB_DATA_DIR` | SQLite DB + logs directory | `./data` |
| `OPENAI_API_KEY` | For embedding generation | required (openai provider) |
| `KB_EMBEDDING_MODEL` | OpenAI embedding model | `text-embedding-3-small` |
| `KB_EMBEDDING_PROVIDER` | `openai` or `local` | `openai` |
| `KB_LOCAL_MODEL` | ONNX model for local provider | `all-MiniLM-L6-v2` |
| `KB_LOG_DIR` | Override log directory | `$KB_DATA_DIR/log` |

Precedence: CLI flags → env vars → defaults.

## Local Embedding (no API key)

```bash
# Install optional dependency
npm install @huggingface/transformers

# Index and query fully offline
KB_EMBEDDING_PROVIDER=local openclaw-kb index --force
KB_EMBEDDING_PROVIDER=local openclaw-kb query "sandbox" --docs
```

A DB built with `local` embeddings is not compatible with `openai` embeddings (different dimensions). Switching providers requires a full reindex.

## Multi-Machine Setup

Run `sync` on one machine, distribute the DB file via Syncthing/rsync/S3:

```
Server (cron): openclaw-kb sync → updates openclaw.db
                    │
                    │  file sync
                    ▼
Client (read-only): openclaw-kb query --offline
```

Metadata commands (`stats`, `latest`, `history`, `since`) work without API key. Use `--offline` for queries without an API key.

## How It Works

1. **Indexing**: Discovers files via glob patterns → chunks by semantic boundaries → embeds via OpenAI or local ONNX → stores in SQLite with sqlite-vec
2. **Querying**: Expands query with synonyms → embeds query → hybrid search (vector similarity + BM25 keyword) → RRF fusion ranking
3. **Syncing**: Fetches upstream git tags → diffs KB-relevant files → checks out new tag → reindexes changed files

## Performance

- **Index time**: ~10-15 min (~7700 chunks from 2500 files)
- **Query time**: <100ms
- **Storage**: ~80MB SQLite
- **Cost**: ~$0.15/reindex (OpenAI) or free (local)

## MCP Server

Expose the KB as an MCP server for native AI tool integration (Claude Desktop, Cursor, Claude Code):

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

Always pass `KB_DATA_DIR` and `UPSTREAM_DIR` explicitly in MCP config. Many MCP hosts do not inherit your shell or `mise` environment, and without these values the server may open the wrong database or upstream checkout.

**Available tools:** `search`, `search_docs`, `search_code`, `search_skills`, `search_ios`, `get_stats`, `get_latest`, `get_history`, `get_since`

## AI Agent Integration

See [AGENTS.md](AGENTS.md) for integration with Claude Code, Cursor, and custom agents.

## License

MIT
