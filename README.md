# OpenClaw Knowledge Base

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D18-brightgreen)](https://nodejs.org/)
[![OpenClaw](https://img.shields.io/badge/OpenClaw-2026.2.12-blue)](https://github.com/openclaw/openclaw)

**[🇷🇺 Русская версия](README.ru.md)** | **[🤖 For AI Assistants](AGENTS.md)**

🤖 **Self-updating vector knowledge base for OpenClaw** - semantic search over docs, code, and configs with automatic release tracking.

Perfect for:
- **AI Agents**: Claude Code, Cursor, or custom agents that need OpenClaw context
- **Developers**: Quick semantic search for API patterns and config options
- **DevOps**: Self-updating documentation that stays current with releases
- **Support**: Accurate answers from the actual codebase, not outdated docs

## What This Does

- **Auto-tracks releases**: Monitors OpenClaw GitHub for new version tags
- **Self-updating**: Automatically pulls new releases and re-indexes
- **Vector search**: Semantic search across docs, code, skills, config schemas
- **Query expansion**: Understands abbreviations (tts→text-to-speech, tg→telegram)
- **Hybrid ranking**: Combines vector similarity + keyword matching (RRF fusion)

## Prerequisites

- **Node.js** 18+ (with npm/pnpm)
- **Git** for tracking upstream source
- **OpenAI API key** for embeddings (text-embedding-3-small)
- **Linux with systemd** (for auto-update timer) or macOS (for LaunchAgent)

## Quick Start

```bash
# 1. Clone this repository
git clone https://github.com/mrkhachaturov/openclaw-kb.git
cd openclaw-kb

# 2. Install dependencies
npm install

# 3. Configure
cp .env.example .env
# Edit .env and add your OPENAI_API_KEY

# 4. Clone upstream OpenClaw source
git clone https://github.com/openclaw/openclaw.git ../source

# 5. Run initial indexing
node index.js

# 6. Install auto-update timer (optional)
./install.sh
```

## Directory Structure

```
openclaw-kb/
├── README.md              # This file
├── install.sh             # Auto-update timer installer
├── sync-latest-tag.sh     # Auto-update script (tracks releases)
├── index.js               # Indexing engine
├── query.js               # Query interface
├── lib/                   # Core modules
│   ├── chunker.js         # Text chunking
│   ├── config.js          # KB configuration
│   ├── embedder.js        # OpenAI embeddings
│   └── search.js          # Hybrid search (vector + BM25)
├── .env                   # API keys (create from .env.example)
└── data/                  # SQLite database (auto-created)
    └── kb.db              # Vector index + chunks

Sibling directory (required):
../source/                 # OpenClaw git clone (tracked by sync script)
```

## Usage

### Manual Query

```bash
# General search (all content)
node query.js "How to configure Telegram?"

# Documentation only
node query.js "sandbox modes" --docs

# Code only (implementation details)
node query.js "tool execution" --code

# Skills only
node query.js "external API call" --skills

# Show statistics
node query.js --stats
```

### Programmatic (Node.js)

```javascript
import { query } from './lib/search.js'

const results = await query('How to set up webhooks?', {
  topK: 5,
  sources: ['docs', 'config']
})

for (const result of results) {
  console.log(`${result.path}:${result.lines}`)
  console.log(result.snippet)
  console.log(`Score: ${result.score}\n`)
}
```

### Integration with justfile

Add to your project's `justfile`:

```makefile
# Query OpenClaw knowledge base
kb-query query *args:
    #!/usr/bin/env bash
    export NVM_DIR="$HOME/.nvm"
    [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
    node /path/to/openclaw-kb/query.js "{{ query }}" {{ args }}

kb-docs query *args:
    node /path/to/openclaw-kb/query.js "{{ query }}" --docs {{ args }}

kb-code query *args:
    node /path/to/openclaw-kb/query.js "{{ query }}" --code {{ args }}
```

## Auto-Update Setup

The install script sets up automatic tracking of upstream releases:

```bash
./install.sh
```

**What it does:**
- Creates systemd timer (Linux) or LaunchAgent (macOS)
- Runs every 2 hours
- Checks for new OpenClaw releases
- Auto-pulls and re-indexes if KB-relevant files changed

**Manual sync:**
```bash
./sync-latest-tag.sh
```

## AI Assistant Integration

**For Claude Code, Cursor, Zed, and other AI tools:**

See [AGENTS.md](AGENTS.md) for comprehensive integration guide with:
- Setup instructions for different AI platforms
- Query modes and best practices
- Example agent configurations
- Programmatic API usage

**Quick example for Claude Code:**
```bash
# Create agent config
cp docs/upstream-knowledge.md ~/.claude/agents/

# Use in Claude Code
@upstream-knowledge "How to configure sandbox?"
```

See [docs/upstream-knowledge.md](docs/upstream-knowledge.md) for Claude Code agent example.

## justfile Integration (Optional)

If you use [just](https://github.com/casey/just) for task running, add these recipes to your project's `justfile`:

```makefile
# Path to openclaw-kb installation
KB_DIR := "/path/to/openclaw-kb"

# Query OpenClaw knowledge base (all content)
kb-query query *args:
    #!/usr/bin/env bash
    export NVM_DIR="$HOME/.nvm"
    [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
    node {{ KB_DIR }}/query.js "{{ query }}" {{ args }}

# Query documentation only
kb-docs query *args:
    #!/usr/bin/env bash
    export NVM_DIR="$HOME/.nvm"
    [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
    node {{ KB_DIR }}/query.js "{{ query }}" --docs {{ args }}

# Query implementation code only
kb-code query *args:
    #!/usr/bin/env bash
    export NVM_DIR="$HOME/.nvm"
    [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
    node {{ KB_DIR }}/query.js "{{ query }}" --code {{ args }}

# Query skills only
kb-skills query *args:
    #!/usr/bin/env bash
    export NVM_DIR="$HOME/.nvm"
    [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
    node {{ KB_DIR }}/query.js "{{ query }}" --skills {{ args }}

# Verify mode (docs + source cross-check)
kb-verify query *args:
    #!/usr/bin/env bash
    export NVM_DIR="$HOME/.nvm"
    [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
    node {{ KB_DIR }}/query.js "{{ query }}" --verify {{ args }}

# Show KB statistics
kb-stats:
    #!/usr/bin/env bash
    export NVM_DIR="$HOME/.nvm"
    [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
    node {{ KB_DIR }}/query.js --stats

# Re-index knowledge base
reindex:
    #!/usr/bin/env bash
    export NVM_DIR="$HOME/.nvm"
    [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
    node {{ KB_DIR }}/index.js

# Manual sync to latest release
kb-auto-update:
    {{ KB_DIR }}/sync-latest-tag.sh
```

Then use in your terminal:
```bash
just kb-query "How to configure Telegram?"
just kb-docs "sandbox modes"
just kb-code "tool execution"
just kb-stats
```

## How It Works

### Indexing Pipeline

1. **Source discovery**: Scans upstream/source for docs, code, skills, config
2. **Chunking**: Splits files into semantic chunks (500-2000 tokens)
3. **Embedding**: Generates OpenAI embeddings (text-embedding-3-small)
4. **Storage**: SQLite with sqlite-vec extension for vector similarity

### Query Pipeline

1. **Query expansion**: Expands abbreviations and synonyms
2. **Vector search**: Finds semantically similar chunks
3. **Keyword search**: BM25 ranking for exact term matches
4. **RRF fusion**: Combines rankings (chunks with both signals rank higher)
5. **Deduplication**: Merges overlapping chunks

### Auto-Update Flow

```
Timer fires (every 2 hours)
  ↓
Fetch upstream tags
  ↓
Latest tag (e.g., v2026.2.12)
  ↓
Compare to current checkout
  ↓
If different:
  ├─ Checkout new tag
  ├─ Check which files changed
  └─ If KB-relevant → reindex
```

## Configuration

Edit `.env`:

```bash
# OpenAI API (required)
OPENAI_API_KEY=sk-...

# Embedding model (optional, default: text-embedding-3-small)
EMBEDDING_MODEL=text-embedding-3-small

# Chunk size (optional, default: 1000)
CHUNK_SIZE=1000

# Overlap (optional, default: 200)
CHUNK_OVERLAP=200
```

## Development

```bash
# Run indexing with debug output
DEBUG=kb:* node index.js

# Test query without indexing
node query.js "test query" --json

# Compare different search strategies
node compare-results.js "test query"

# Check chunk quality
node check-chunks.js
```

## Performance

- **Index time**: ~10-15 minutes for full OpenClaw codebase (~7700 chunks from 2500 files)
- **Query time**: <100ms (hybrid search)
- **Storage**: ~80MB SQLite database
- **Cost**: ~$0.15 per full reindex (OpenAI embeddings)

## Troubleshooting

**"No results found"**
- Check that upstream source is cloned: `ls ../source`
- Verify indexing completed: `node query.js --stats`

**"OpenAI API error"**
- Verify `.env` has valid `OPENAI_API_KEY`
- Check API quota: https://platform.openai.com/usage

**"sqlite-vec not found"**
- Requires Node.js 18+ with native sqlite support
- Install dependencies: `npm install`

**Auto-update not working**
- Check timer status: `systemctl status openclaw-kb-sync.timer`
- View logs: `journalctl -u openclaw-kb-sync -f`
- Test manually: `./sync-latest-tag.sh`

## License

MIT License - see upstream OpenClaw project for details.

## Contributing

This is a standalone tool for tracking OpenClaw releases. For OpenClaw itself, see: https://github.com/openclaw/openclaw
