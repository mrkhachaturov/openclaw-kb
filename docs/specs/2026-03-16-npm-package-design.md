# openclaw-kb npm Package Design

**Date:** 2026-03-16
**Status:** Draft
**Goal:** Publish openclaw-kb as a standalone npm CLI tool installable via `npm install -g openclaw-kb` or `mise`.

## Overview

Convert the current repo-local scripts into a proper npm package with a single `openclaw-kb` binary exposing all functionality as subcommands. Shell scripts are replaced with Node.js equivalents.

The core `lib/` modules remain unchanged except for:
- `config.js` — add `KB_LOG_DIR` env var, add iOS/macOS/shared sources (see below)
- `chunker.js` — add version-bounded chunking for CHANGELOG.md

**Important:** When installed globally via npm, the `__dirname`-relative defaults in `config.js` resolve inside `node_modules/`, which is not useful. Therefore `UPSTREAM_DIR` and `KB_DATA_DIR` are effectively **required** for global installs — there are no sensible defaults. The CLI should validate these paths exist at startup and print a clear error message if missing.

## File Structure

```
openclaw-kb/
├── bin/
│   └── cli.js                   # #!/usr/bin/env node — single entry point
├── commands/
│   ├── query.js                 # search with filters
│   ├── index.js                 # reindex KB
│   ├── sync.js                  # fetch upstream tags + reindex (replaces .sh)
│   ├── stats.js                 # DB statistics
│   ├── latest.js                # current indexed version
│   ├── history.js               # last 10 releases
│   ├── since.js                 # changes since <version>
│   └── install-service.js       # generate systemd/launchd files
├── lib/                         # minor changes (config.js, chunker.js)
│   ├── config.js
│   ├── chunker.js
│   ├── embedder.js
│   ├── db.js
│   ├── synonyms.js
│   └── release-parser.js
├── scripts/                     # thin wrappers for backward compat
│   ├── index.js                 # delegates to commands/index.js
│   ├── query.js                 # delegates to commands/query.js
│   └── tools/                   # dev tools (not published)
├── package.json
├── README.md
└── LICENSE
```

## CLI Interface

```
openclaw-kb query <text> [--docs|--code|--skills|--ios|--macos|--shared|--releases|--verify] [--json] [--top N]
openclaw-kb index [--force] [--release <tag>]
openclaw-kb sync [--upstream-dir <path>] [--data-dir <path>]
openclaw-kb stats
openclaw-kb latest
openclaw-kb history
openclaw-kb since <version>
openclaw-kb install-service [--interval <duration>] [--env-file <path>] [--upstream-dir <path>] [--data-dir <path>]

# Short aliases (skill-friendly)
openclaw-kb docs <text> [--json] [--top N]
openclaw-kb code <text> [--json] [--top N]
openclaw-kb skills <text> [--json] [--top N]
openclaw-kb verify <text> [--json] [--top N]
```

### Short Aliases

Common filter combinations get top-level aliases for skill/justfile integration:

```
openclaw-kb docs <text>     → alias for: openclaw-kb query <text> --docs
openclaw-kb code <text>     → alias for: openclaw-kb query <text> --code
openclaw-kb skills <text>   → alias for: openclaw-kb query <text> --skills
openclaw-kb verify <text>   → alias for: openclaw-kb query <text> --verify
```

These are registered as separate commander subcommands that delegate to the query handler with the appropriate filter pre-set. They accept the same `--json`, `--top N` flags as `query`.

### Exit Codes

| Exit Code | Meaning |
|-----------|---------|
| `0` | Success |
| `1` | Runtime error (API failure, git error, DB error) |
| `2` | Configuration error (missing `UPSTREAM_DIR`, `OPENAI_API_KEY`, etc.) |
| `3` | No results found (for `query` and alias commands) |

Exit code `3` allows scripts and skills to detect empty results and try alternative searches without parsing output.

### Database Behavior

openclaw-kb never creates a fresh DB if one already exists at `$KB_DATA_DIR/upstream.db`. It opens the existing DB and appends/updates incrementally. First run on a fresh install with no existing DB → `index` or `sync` creates it. Subsequent runs → incremental updates only.

This means you can copy a pre-built `upstream.db` (e.g., 582MB) to a new machine and immediately query it without waiting for a full reindex.

**Multi-machine setups:** Run `sync` on one machine (e.g., Linux server with a cron/timer) and distribute the DB file via Syncthing, rsync, S3, or shared NAS. Read-only commands (`query`, `stats`, `latest`, `history`, `since`) work without `OPENAI_API_KEY` and without network access — they are pure SQLite reads against the local DB file.

### OPENAI_API_KEY Requirements

The API key is only needed for write operations — not reads:

| Command | Needs `OPENAI_API_KEY`? |
|---------|------------------------|
| `query` / aliases | No — reads existing embeddings |
| `stats` | No |
| `latest` | No |
| `history` | No |
| `since` | No |
| `index` | **Yes** — generates embeddings |
| `sync` | **Yes** — may trigger reindex |
| `install-service` | No (but the generated service needs it at runtime) |

Read-only commands must not check for or require the API key. If `OPENAI_API_KEY` is missing and a write command is invoked, fail with exit code `2` and message: `"OPENAI_API_KEY is required for indexing. Set it in your environment or pass --env-file."`.

### Configuration Precedence

CLI flags → environment variables → defaults.

All commands that touch the filesystem respect this precedence for `--upstream-dir` and `--data-dir`. The `install-service` command bakes the resolved flags into the generated service file so it is self-contained.

### Command Details

**`query <text>`**
Performs hybrid search (vector + keyword + RRF fusion). Extracts handler logic from current `scripts/query.js` into `commands/query.js`.

| Flag | Effect |
|------|--------|
| `--docs` | Filter to content type `docs` |
| `--code` | Filter to content type `code` |
| `--skills` | Filter to content type `skill` |
| `--ios` | Filter to source `ios` |
| `--macos` | Filter to source `macos` |
| `--shared` | Filter to source `shared` |
| `--releases` | Filter to source `release` |
| `--verify` | Two-pass search: first docs, then a second search for related code appended to results |
| `--json` | Output JSON instead of human-readable |
| `--top N` | Number of results (default: 8, matching current behavior) |

**`index`**
Reindexes the knowledge base. Extracts handler logic from current `scripts/index.js` into `commands/index.js`.

| Flag | Effect |
|------|--------|
| `--force` | Re-embed all files, ignoring hash cache |
| `--release <tag>` | Override auto-detected release tag |

**`sync`**
Replaces `scripts/sync-latest-tag.sh`. Uses `child_process.execFileSync('git', [...])` for all git operations. Same logic: fetch tags, detect KB-relevant changes, checkout new tag, reindex if needed. Logs to `$KB_LOG_DIR/sync.log`.

| Flag | Effect |
|------|--------|
| `--upstream-dir <path>` | Override `UPSTREAM_DIR` |
| `--data-dir <path>` | Override `KB_DATA_DIR` |

**`stats`**
Prints database statistics (file count, chunk count, source breakdown, DB size).

**`latest`**
Shows the current indexed release version.

**`history`**
Shows the last 10 indexed releases with dates.

**`since <version>`**
Shows what changed since the given version (new chunks, modified files).

**`install-service`**
Detects platform and generates service files:
- **Linux:** systemd **user-level** timer + service unit (`~/.config/systemd/user/`). This is intentionally user-level (not system-level like the old `install.sh`) because npm global installs should not require root.
- **macOS:** launchd plist (LaunchAgent)

The generated service invokes `openclaw-kb sync` with `--upstream-dir` and `--data-dir` flags baked in from the resolved values at generation time, making the service self-contained.

| Flag | Effect |
|------|--------|
| `--interval <duration>` | Sync interval, e.g. `2h`, `30m` (default: `2h`) |
| `--env-file <path>` | Path to env file for `OPENAI_API_KEY` etc. |
| `--upstream-dir <path>` | Baked into generated service file |
| `--data-dir <path>` | Baked into generated service file |

**`--env-file` behavior:** If omitted, the generated service will not include an `EnvironmentFile` directive (systemd) or env var dict (launchd). The command prints a warning: "No --env-file specified. The generated service will not have OPENAI_API_KEY set. You must ensure it is available via the shell environment or another mechanism."

## Environment Variables

| Env Var | Purpose | Default |
|---------|---------|---------|
| `UPSTREAM_DIR` | Path to OpenClaw source checkout | `./source` |
| `KB_DATA_DIR` | Where to store SQLite DB + logs | `./data` |
| `OPENAI_API_KEY` | For embedding generation | required |
| `KB_EMBEDDING_MODEL` | OpenAI embedding model | `text-embedding-3-small` |
| `KB_LOG_DIR` | Override log directory | `$KB_DATA_DIR/log` |

**Action required in config.js:** `KB_LOG_DIR` is a **new** env var. Change the existing `LOG_DIR` export to read from `process.env.KB_LOG_DIR` first, falling back to `path.join(KB_DATA_DIR, 'log')`. The current code derives `LOG_DIR` from `__dirname` when `KB_DATA_DIR` is unset, which breaks for global installs.

All commands respect the precedence: CLI flags → env vars → defaults.

## package.json Changes

The following fields are **added or changed** in package.json. All other existing fields (`type`, `description`, `repository`, `keywords`, `author`, `license`, `engines`, etc.) are **retained**.

```json
{
  "version": "1.1.0",
  "main": "lib/db.js",
  "bin": {
    "openclaw-kb": "./bin/cli.js"
  },
  "files": [
    "bin/",
    "commands/",
    "lib/",
    "README.md",
    "LICENSE"
  ],
  "scripts": {
    "index": "node scripts/index.js",
    "query": "node scripts/query.js"
  },
  "dependencies": {
    "sqlite-vec": "0.1.7-alpha.2",
    "commander": "^13.0.0"
  }
}
```

Key changes:
- **Bump version** from 1.0.0 to 1.1.0 to reflect the CLI refactor
- **Add `commander`** as a new dependency (zero transitive deps, ~50KB)
- **Add `files` whitelist** — replaces `.npmignore`. Only published: `bin/`, `commands/`, `lib/`, `README.md`, `LICENSE`
- **Update `bin`** to point to `bin/cli.js` instead of `scripts/query.js`
- **Remove `sync` npm script** (was `bash scripts/sync-latest-tag.sh` — that file is deleted)
- **Retain `"type": "module"`** — all source files use ESM imports

## Scripts Backward Compatibility

`scripts/index.js` and `scripts/query.js` become thin wrappers:

Each `commands/*.js` file exports two things:
- **`register(program)`** — called by `bin/cli.js` to register the subcommand with commander
- **`handler(options)`** — the actual logic, callable standalone

The thin wrappers parse minimal args and call `handler()` directly:

```javascript
// scripts/index.js
import { handler } from '../commands/index.js';

const force = process.argv.includes('--force');
const releaseIdx = process.argv.indexOf('--release');
const release = releaseIdx !== -1 ? process.argv[releaseIdx + 1] : undefined;
handler({ force, release });
```

This ensures `npm run index` and `openclaw-kb index` execute identical code paths. No implementation duplication, no drift.

## Files Deleted

| File | Replacement |
|------|-------------|
| `scripts/sync-latest-tag.sh` | `commands/sync.js` |
| `scripts/install.sh` | `commands/install-service.js` |

## Files Unchanged

- `lib/embedder.js`, `lib/db.js`, `lib/synonyms.js`, `lib/release-parser.js`
- `scripts/tools/*` — dev tools
- `docs/*` — documentation
- `.env.example`, `.gitignore`, `AGENTS.md`

## bin/cli.js Structure

```javascript
#!/usr/bin/env node
import { Command } from 'commander';
import { readFileSync } from 'fs';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url)));
const program = new Command();

program
  .name('openclaw-kb')
  .description('Self-updating vector knowledge base for OpenClaw')
  .version(pkg.version);

// Register subcommands
// Each import adds its command to program
```

Each `commands/*.js` file exports a function that receives the `program` instance and calls `program.command(...)` to register itself. This keeps the entry point clean and each command self-contained.

## Usage After Publishing

```bash
# Install globally
npm install -g openclaw-kb

# Or via mise
# mise.toml:
# [tools]
# "npm:openclaw-kb" = "latest"

# Configure
export UPSTREAM_DIR=/path/to/openclaw/checkout
export KB_DATA_DIR=/path/to/data
export OPENAI_API_KEY=sk-...

# Use
openclaw-kb sync
openclaw-kb query "sandbox configuration" --docs
openclaw-kb stats

# Set up auto-sync
openclaw-kb install-service --interval 2h \
  --upstream-dir /path/to/.upstream \
  --data-dir /path/to/data \
  --env-file /path/to/.env
```

## Sync Command: Node.js Conversion

The bash script's git operations map to `child_process.execFileSync('git', args, opts)`:

| Bash | Node.js equivalent |
|------|-------------------|
| `git fetch --tags` | `execFileSync('git', ['fetch', '--tags'], { cwd })` |
| `git describe --tags --abbrev=0` | `execFileSync('git', ['describe', '--tags', '--abbrev=0'], { cwd })` |
| `git diff --name-only tagA tagB` | `execFileSync('git', ['diff', '--name-only', tagA, tagB], { cwd })` |
| `git stash` | `execFileSync('git', ['stash'], { cwd })` |
| `git checkout <tag>` | `execFileSync('git', ['checkout', tag], { cwd })` |

Logging writes to `KB_LOG_DIR/sync.log` using `fs.appendFileSync`.

## Install-Service: Generated Files

### systemd (Linux)

```ini
# ~/.config/systemd/user/openclaw-kb-sync.service
[Unit]
Description=OpenClaw KB Sync

[Service]
Type=oneshot
ExecStart=openclaw-kb sync --upstream-dir /resolved/path --data-dir /resolved/path
EnvironmentFile=/path/to/.env
```

```ini
# ~/.config/systemd/user/openclaw-kb-sync.timer
[Unit]
Description=OpenClaw KB Sync Timer

[Timer]
OnCalendar=*:0/120
Persistent=true

[Install]
WantedBy=timers.target
```

### launchd (macOS)

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" ...>
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.openclaw.kb-sync</string>
  <key>ProgramArguments</key>
  <array>
    <string>openclaw-kb</string>
    <string>sync</string>
    <string>--upstream-dir</string>
    <string>/resolved/path</string>
    <string>--data-dir</string>
    <string>/resolved/path</string>
  </array>
  <key>StartInterval</key>
  <integer>7200</integer>
  <key>EnvironmentVariables</key>
  <dict>
    <key>OPENAI_API_KEY</key>
    <string>...</string>
  </dict>
</dict>
</plist>
```

## P0: iOS/macOS/Shared Sources

**Problem:** The KB only indexes `src/`, `docs/`, `extensions/`, and `skills/`. It completely misses the Swift codebase (`apps/ios/`, `apps/macos/`, `apps/shared/`), making the KB useless for iOS development sessions.

**Change in `lib/config.js`:** Add three new entries to the `SOURCES` array:

```javascript
{ name: 'ios',    globs: ['apps/ios/Sources/**/*.swift'],          exclude: ['**/*Tests*', '**/*Mock*'] },
{ name: 'macos',  globs: ['apps/macos/Sources/**/*.swift'],        exclude: ['**/*Tests*', '**/*Mock*'] },
{ name: 'shared', globs: ['apps/shared/**/*.swift', 'apps/shared/**/*.md'], exclude: ['**/*Tests*'] },
```

**Change in `commands/query.js`:** Add `--ios`, `--macos`, `--shared` filter flags. These set a `sourceFilter` value passed to `hybridSearch()` (same mechanism as `--releases`, not `--docs`/`--code`/`--skills` which use `contentTypeFilter`). Source filters (`--ios`, `--macos`, `--shared`, `--releases`) are mutually exclusive — if multiple are passed, the last one wins.

**Change in `lib/chunker.js`:** Swift files should use the existing code chunking logic (1200 char max, function/class boundary detection). Add `'swift'` to `deriveMetadata()`: `.swift` files get `contentType: 'code'` and `language: 'swift'`.

## P0: Version-Bounded Changelog Chunking

**Problem:** CHANGELOG.md is chunked by line count (~30 lines). Version sections get split across chunks or merged together. When asking "what changed since v2026.2.21", the agent gets fragments spanning version boundaries.

**Change in `lib/chunker.js`:** Add a special chunking path for CHANGELOG.md (detected by filename). Instead of the generic line-count chunker:

1. Split the file by version heading pattern (e.g., `## v2026.3.8` or `## [v2026.3.8]`)
2. Each version section becomes one chunk, regardless of length
3. Tag each chunk with `version` metadata (e.g., `version: "v2026.3.8"`)
4. Set `contentType: 'release'` for these chunks

**Chunking logic:**

```
Input:  CHANGELOG.md (all versions concatenated)
Split:  by /^## \[?v[\d.]+\]?/m pattern
Output: one chunk per version section
        chunk.metadata.version = extracted version string
        chunk.contentType = 'release'
```

If a single version section exceeds the normal chunk size limit, it should still be kept as one chunk (version integrity > size limit). Changelog sections rarely exceed 3000 chars, so this is acceptable.

**Storage of `version` metadata:** The `version` string is stored in the existing `metadata` JSON column of the `chunks` table (which already holds `contentType`, `language`, `category`). No schema migration needed — `metadata` is a freeform JSON field. The `version` key is added alongside the existing keys when chunking CHANGELOG.md.

## Testing Checklist

After publishing, verify:

```bash
# CLI basics
npm install -g openclaw-kb
openclaw-kb --version                          # prints 1.1.0
openclaw-kb --help                             # shows all subcommands
openclaw-kb query --help                       # shows query flags

# Short aliases
openclaw-kb docs "sandbox configuration"       # same as query --docs
openclaw-kb code "TtsProviderSchema"           # same as query --code
openclaw-kb verify "session persistence"       # same as query --verify
openclaw-kb docs "nonexistent xyz"; echo $?    # exit code 3 = no results

# Core workflow
openclaw-kb sync --upstream-dir /path --data-dir /path
openclaw-kb query "sandbox configuration" --docs
openclaw-kb query "sandbox" --json
openclaw-kb stats
openclaw-kb latest
openclaw-kb history
openclaw-kb since v2026.1.0
openclaw-kb install-service --interval 2h --upstream-dir /path --data-dir /path

# P0: iOS/macOS/shared sources
openclaw-kb query "TalkModeManager" --ios      # should find Swift results
openclaw-kb query "Settings" --macos           # macOS source results
openclaw-kb query "OpenClawKit" --shared       # shared package results
openclaw-kb stats                              # should show ios/macos/shared source counts

# P0: Changelog chunking
openclaw-kb query "what changed in v2026.3.7" --releases  # should return complete version section
openclaw-kb since v2026.2.21                   # should show version-bounded results
```
