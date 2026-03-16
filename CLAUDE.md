# CLAUDE.md — openclaw-kb

## Project

Self-updating vector knowledge base for OpenClaw. Indexes docs, source code, skills, and configs into a SQLite vector DB with hybrid search (vector + keyword + RRF fusion).

## Stack

- Node.js 22 (ESM, `"type": "module"`)
- SQLite with sqlite-vec extension for vector similarity
- FTS5 for keyword matching
- commander v14 for CLI
- @huggingface/transformers (optional, for local ONNX embeddings)
- mise for tool management

## Setup

```bash
just setup   # npm install
```

## Structure

```
bin/cli.js           # CLI entry point (commander)
commands/*.js        # Subcommands (each exports register + handler)
lib/config.js        # Config with getter functions for CLI overrides
lib/embedder.js      # Provider abstraction (OpenAI + local ONNX)
lib/chunker.js       # Text chunking (semantic boundaries, Swift, changelog)
lib/db.js            # SQLite operations, hybrid search
lib/synonyms.js      # Query expansion
lib/release-parser.js # Release metadata extraction
scripts/             # Thin wrappers for backward compat (npm run index/query)
scripts/tools/       # Dev tools (not published)
```

## Key patterns

- **Config getters**: `getUpstreamRoot()`, `getDbPath()`, `getLogDir()` — read env vars on demand so CLI `--upstream-dir` / `--data-dir` overrides work after module load
- **Static exports**: `UPSTREAM_ROOT`, `DB_PATH` etc. exist for backward compat but commands that accept CLI overrides must use the getters
- **Command pattern**: each `commands/*.js` exports `register(program)` for commander and `handler(options)` for standalone/programmatic use
- **Exit codes**: 0=success, 1=runtime error, 2=config error, 3=no results (in `lib/exit-codes.js`)
- **Embedding provider**: `KB_EMBEDDING_PROVIDER=openai|local` — embedder.js dispatches transparently

## Commands

```bash
openclaw-kb query <text> [--docs|--code|--skills|--ios|--macos|--shared|--releases|--verify] [--json] [--top N] [--offline]
openclaw-kb docs|code|skills|verify <text>   # short aliases
openclaw-kb index [--force] [--release <tag>]
openclaw-kb sync [--upstream-dir <path>] [--data-dir <path>]
openclaw-kb stats|latest|history
openclaw-kb since <version>
openclaw-kb install-service [--interval 2h] [--env-file <path>] [--upstream-dir <path>] [--data-dir <path>]
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
node bin/cli.js --version           # 1.1.0
node bin/cli.js stats               # DB stats (no API key needed)
node bin/cli.js query "test" --offline  # FTS-only, no API key
```

## Publishing

Push a `v*` tag — GitHub Actions publishes to npm via OIDC trusted publisher (no token needed).

```bash
# bump version in package.json + CHANGELOG.md, then:
git tag v1.2.0
git push origin main --tags
```
