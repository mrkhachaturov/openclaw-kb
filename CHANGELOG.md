# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.1.0] - 2026-03-16

### Added
- CLI binary `openclaw-kb` with commander v14 and 12 subcommands
- Short alias commands: `docs`, `code`, `skills`, `verify`
- `--offline` flag for FTS-only keyword search (no API key needed)
- `--ios`, `--macos`, `--shared` source filters for Swift codebase
- Local embedding provider via `@huggingface/transformers` (KB_EMBEDDING_PROVIDER=local)
- Version-bounded changelog chunking (one chunk per version section)
- Swift language support in chunker (contentType: code, language: swift)
- `sync` command replacing bash script (pure Node.js, cross-platform)
- `install-service` command generating systemd/launchd auto-sync
- `stats`, `latest`, `history`, `since` metadata commands
- Exit codes: 0=success, 1=runtime, 2=config, 3=no-results
- Config getter functions for CLI flag overrides (--upstream-dir, --data-dir)
- `mise.toml` and `justfile` for development setup
- GitHub Actions workflow for npm publishing on tag push

### Changed
- `lib/config.js` — getter pattern for dynamic env var resolution
- `lib/embedder.js` — provider abstraction (OpenAI + local ONNX)
- `lib/chunker.js` — Swift support, changelog-aware chunking
- `scripts/index.js` and `scripts/query.js` — thin wrappers delegating to commands/
- `package.json` — commander dependency, bin/files config, optionalDependencies

### Removed
- `scripts/sync-latest-tag.sh` (replaced by `commands/sync.js`)
- `scripts/install.sh` (replaced by `commands/install-service.js`)
- `README.ru.md`

## [1.0.0] - 2026-03-15

### Added
- Initial release: vector knowledge base with hybrid search
- SQLite + sqlite-vec for vector similarity
- FTS5 for keyword matching
- RRF fusion combining vector + keyword signals
- Query expansion with synonyms
- Auto-update via systemd timer / LaunchAgent
- Release tracking and changelog indexing
