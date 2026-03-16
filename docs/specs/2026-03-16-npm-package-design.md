# openclaw-kb npm Package Design

**Date:** 2026-03-16
**Status:** Draft
**Goal:** Publish openclaw-kb as a standalone npm CLI tool installable via `npm install -g openclaw-kb` or `mise`.

## Overview

Convert the current repo-local scripts into a proper npm package with a single `openclaw-kb` binary exposing all functionality as subcommands. The core `lib/` modules (chunker, embedder, db, config, synonyms, release-parser) remain unchanged. Shell scripts are replaced with Node.js equivalents.

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
├── lib/                         # UNCHANGED
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
openclaw-kb query <text> [--docs|--code|--skills|--releases|--verify] [--json] [--top N]
openclaw-kb index [--force] [--release <tag>]
openclaw-kb sync [--upstream-dir <path>] [--data-dir <path>]
openclaw-kb stats
openclaw-kb latest
openclaw-kb history
openclaw-kb since <version>
openclaw-kb install-service [--interval <duration>] [--env-file <path>] [--upstream-dir <path>] [--data-dir <path>]
```

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
| `--releases` | Filter to source `release` |
| `--verify` | Filter to `docs` + `code` combined |
| `--json` | Output JSON instead of human-readable |
| `--top N` | Number of results (default: 5) |

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
- **Linux:** systemd user timer + service unit
- **macOS:** launchd plist (LaunchAgent)

The generated service invokes `openclaw-kb sync` with `--upstream-dir` and `--data-dir` flags baked in from the resolved values at generation time, making the service self-contained.

| Flag | Effect |
|------|--------|
| `--interval <duration>` | Sync interval, e.g. `2h`, `30m` (default: `2h`) |
| `--env-file <path>` | Path to env file for `OPENAI_API_KEY` etc. |
| `--upstream-dir <path>` | Baked into generated service file |
| `--data-dir <path>` | Baked into generated service file |

## Environment Variables

| Env Var | Purpose | Default |
|---------|---------|---------|
| `UPSTREAM_DIR` | Path to OpenClaw source checkout | `./source` |
| `KB_DATA_DIR` | Where to store SQLite DB + logs | `./data` |
| `OPENAI_API_KEY` | For embedding generation | required |
| `KB_EMBEDDING_MODEL` | OpenAI embedding model | `text-embedding-3-small` |
| `KB_LOG_DIR` | Override log directory | `$KB_DATA_DIR/log` |

**New in config.js:** Add `KB_LOG_DIR` with default `path.join(KB_DATA_DIR, 'log')`.

All commands respect the precedence: CLI flags → env vars → defaults.

## package.json Changes

```json
{
  "name": "openclaw-kb",
  "version": "1.1.0",
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
  "dependencies": {
    "sqlite-vec": "0.1.7-alpha.2",
    "commander": "^13.0.0"
  }
}
```

The `files` whitelist replaces `.npmignore`. Only `bin/`, `commands/`, `lib/`, `README.md`, and `LICENSE` are published. `scripts/`, `docs/`, `data/`, `source/`, `log/`, `.env`, `test-queries.json`, and `scripts/tools/` are excluded.

## Scripts Backward Compatibility

`scripts/index.js` and `scripts/query.js` become thin wrappers:

```javascript
// scripts/index.js
import { handler } from '../commands/index.js';
handler(process.argv.slice(2));
```

This ensures `npm run index` and `openclaw-kb index` execute identical code paths. No implementation duplication, no drift.

## Files Deleted

| File | Replacement |
|------|-------------|
| `scripts/sync-latest-tag.sh` | `commands/sync.js` |
| `scripts/install.sh` | `commands/install-service.js` |

## Files Unchanged

- `lib/*` — all core modules
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

## Testing Checklist

After publishing, verify:

```bash
npm install -g openclaw-kb
openclaw-kb --version                          # prints 1.1.0
openclaw-kb --help                             # shows all subcommands
openclaw-kb query --help                       # shows query flags
openclaw-kb sync --upstream-dir /path --data-dir /path
openclaw-kb query "sandbox configuration" --docs
openclaw-kb query "sandbox" --json
openclaw-kb stats
openclaw-kb latest
openclaw-kb history
openclaw-kb since v2026.1.0
openclaw-kb install-service --interval 2h --upstream-dir /path --data-dir /path
```
