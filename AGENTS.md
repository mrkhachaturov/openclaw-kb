# OpenClaw Knowledge Base — AI Agent Guide

> 🤖 **For:** AI assistants (Claude Code, Cursor, Zed, GitHub Copilot, and custom agents)
> 📚 **Purpose:** Semantic search over OpenClaw documentation, code, and configurations
> 🎯 **Use when:** You need accurate, up-to-date OpenClaw context for answering questions or implementing features

---

## What This Is

A **self-updating vector knowledge base** that indexes OpenClaw's entire codebase:
- 📖 **Documentation** — User guides, configuration references, architectural concepts
- 💻 **Source code** — TypeScript implementation with code-aware chunking
- 🛠️ **Skills** — Real-world skill examples and patterns
- ⚙️ **Config schemas** — Type definitions and validation rules

**Auto-tracking:** Monitors OpenClaw GitHub releases and automatically re-indexes when relevant files change.

**Search technology:** Hybrid vector + keyword search (RRF fusion) with automatic query expansion (abbreviations and synonyms).

---

## Quick Start for AI Agents

### 1. Installation

```bash
# Clone the knowledge base
git clone https://github.com/mrkhachaturov/openclaw-kb.git
cd openclaw-kb

# Install dependencies
npm install

# Configure OpenAI API key
cp .env.example .env
# Edit .env and add your OPENAI_API_KEY

# Clone OpenClaw source (required for indexing)
git clone https://github.com/openclaw/openclaw.git ../source

# Run initial indexing (5-10 minutes)
node index.js
```

### 2. Basic Query Usage

```bash
# Search all content
node query.js "How to configure Telegram bot?"

# Search documentation only
node query.js "sandbox modes" --docs

# Search implementation code only
node query.js "tool execution" --code

# Search skills only
node query.js "external API call" --skills

# JSON output (for programmatic use)
node query.js "webhook configuration" --json
```

### 3. Integration with Your Workflow

**Option A: Direct Node.js script**
```javascript
import { query } from './lib/search.js'

const results = await query('How to set up webhooks?', {
  topK: 5,
  sources: ['docs', 'config']
})

for (const result of results) {
  console.log(`${result.path}:${result.lines}`)
  console.log(result.snippet)
}
```

**Option B: justfile integration** (recommended for project-based workflows)
```makefile
# Add to your project's justfile
KB_DIR := "/path/to/openclaw-kb"

kb-query query *args:
    node {{ KB_DIR }}/query.js "{{ query }}" {{ args }}

kb-docs query *args:
    node {{ KB_DIR }}/query.js "{{ query }}" --docs {{ args }}
```

Then use: `just kb-query "your question"`

---

## When to Use the Knowledge Base

### ✅ **USE the KB for:**

| Scenario | Example Query | Why |
|----------|--------------|-----|
| **Configuration questions** | `node query.js "telegram bot token setup" --docs` | Accurate, up-to-date config reference |
| **Implementation research** | `node query.js "sandbox container creation" --code` | Find actual source code, not outdated docs |
| **Debugging** | `node query.js "requireMention not working" --verify` | Cross-reference docs with implementation |
| **Skill development** | `node query.js "external API call" --skills` | Real-world patterns from existing skills |
| **API discovery** | `node query.js "agent session lifecycle" --code` | Understand internal APIs and flows |
| **Schema validation** | `node query.js "sandbox.mode type definition" --docs` | Type definitions and allowed values |

### ❌ **DON'T use the KB for:**

- Questions about the user's specific deployment or config files
- Current state of running services (use direct container inspection instead)
- Non-OpenClaw questions (general programming, other frameworks)

---

## Query Modes Explained

| Mode | Flag | When to Use | Example |
|------|------|------------|---------|
| **General** | _(default)_ | Broad questions, unclear scope | `"How does the agent loop work?"` |
| **Docs** | `--docs` | Configuration, setup, user-facing features | `"What sandbox modes are available?"` |
| **Code** | `--code` | Implementation details, debugging | `"How is sandbox permission validated?"` |
| **Skills** | `--skills` | Skill development patterns | `"How to handle tool responses?"` |
| **Verify** | `--verify` | Docs unclear or behavior unexpected | `"requireMention docs vs actual behavior"` |

**Pro tip:** Query expansion is automatic:
- `"tts"` → finds "text-to-speech", "voice", "speech"
- `"tg"` → finds "telegram"
- `"config"` ↔ `"configuration"` ↔ `"settings"`
- `"bot"` ↔ `"agent"` ↔ `"assistant"`

---

## Integration Examples

### Claude Code Integration

**Step 1: Install the KB** (follow Quick Start above)

**Step 2: Create a Claude Code skill or agent**

Create `~/.claude/agents/openclaw-kb.md`:

```markdown
# OpenClaw Knowledge Base Agent

You search the OpenClaw knowledge base to answer questions about configuration, implementation, and patterns.

## Tools

You have access to Bash for running queries.

## Available Commands

# General search
just kb-query "QUERY" --json

# Documentation only
just kb-docs "QUERY" --json

# Implementation code only
just kb-code "QUERY" --json

# Skills only
just kb-skills "QUERY" --json

## Workflow

1. Choose the right command based on question type
2. Run query with JSON output
3. Parse results and provide answer with citations

## Examples

User: "How to configure Telegram bot token?"
→ Run: just kb-docs "telegram bot token" --json
→ Extract path and snippet from results
→ Return: "Configure in channels.telegram.botToken (see docs/channels/telegram.md:42)"
```

**Step 3: Use in Claude Code**
```
@openclaw-kb "How to set up sandbox mode?"
```

### Cursor Integration

**Add to `.cursor/rules`:**

```markdown
## OpenClaw Documentation Lookup

When answering questions about OpenClaw configuration or implementation:

1. Use the OpenClaw KB for accurate reference:
   ```bash
   node /path/to/openclaw-kb/query.js "your query" --json
   ```

2. Prefer `--docs` for configuration questions
3. Prefer `--code` for implementation/debugging questions
4. Always cite file paths from results
```

### Custom Agent Integration

```python
import subprocess
import json

def query_openclaw_kb(question: str, mode: str = "docs") -> list:
    """Query OpenClaw knowledge base"""
    cmd = [
        "node",
        "/path/to/openclaw-kb/query.js",
        question,
        f"--{mode}",
        "--json"
    ]

    result = subprocess.run(cmd, capture_output=True, text=True)
    data = json.loads(result.stdout)

    return data.get("results", [])

# Usage
results = query_openclaw_kb("How to configure Telegram?", mode="docs")
for r in results:
    print(f"{r['path']}:{r['lines']} — {r['snippet'][:100]}...")
```

---

## Advanced Features

### Release Tracking

```bash
# Check current KB version
node query.js --latest-release
# → Shows: v2026.2.12

# View release history
node query.js --release-history
# → Shows last 10 releases with KB impact

# Filter by release (what's new?)
node query.js --since-release v2026.2.9 --top 20
# → Shows only chunks indexed after v2026.2.9
```

**Use case:** You're on OpenClaw v2026.2.9 and KB has indexed v2026.2.12 → see what changed before upgrading.

### Source Filtering

```bash
# Only search in specific source types
node query.js "authentication" --source gateway
# Sources: docs, config, gateway, telegram, skills, agents
```

### Result Limits

```bash
# Control number of results (default: 5)
node query.js "sandbox" --top 10
```

---

## Auto-Update Setup (Optional)

Keep the KB synchronized with upstream OpenClaw releases:

```bash
# Install systemd timer (Linux) or LaunchAgent (macOS)
./install.sh

# Manual sync
./sync-latest-tag.sh
```

**What it does:**
- Runs every 2 hours
- Checks for new OpenClaw releases
- Auto-pulls and re-indexes if KB-relevant files changed

---

## Best Practices for AI Agents

### 1. **Choose the Right Query Mode**

```javascript
// ✅ GOOD: Specific mode for clear question types
await query("telegram bot token", { mode: "docs" })

// ❌ BAD: Using general search when mode is obvious
await query("telegram bot token") // slower, mixed results
```

### 2. **Provide Citations**

```javascript
// ✅ GOOD: Include file paths and line numbers
"Configure telegram.botToken (see docs/channels/telegram.md:42-45)"

// ❌ BAD: No source attribution
"Configure telegram.botToken in the config"
```

### 3. **Verify When Docs Are Unclear**

```javascript
// ✅ GOOD: Cross-reference docs with code
const docs = await query("requireMention", { mode: "docs" })
const code = await query("requireMention group handling", { mode: "code" })
// → Compare behavior described in docs vs actual implementation

// ❌ BAD: Trust docs blindly
const docs = await query("requireMention", { mode: "docs" })
// → Docs might be outdated
```

### 4. **Use JSON Output for Structured Parsing**

```bash
# ✅ GOOD: JSON output for programmatic use
node query.js "sandbox" --json | jq '.results[0].path'

# ❌ BAD: Parsing human-readable output
node query.js "sandbox" | grep "path:" | cut -d: -f2
```

### 5. **Limit Results Appropriately**

```javascript
// ✅ GOOD: Narrow queries use fewer results
await query("sandbox.mode exact value", { topK: 3 })

// ✅ GOOD: Broad exploration uses more results
await query("agent lifecycle", { topK: 10 })

// ❌ BAD: Always using default (may miss or overwhelm)
await query("agent lifecycle") // defaults to topK: 5, might be too few
```

---

## Query Result Structure

Each result contains:

```json
{
  "score": 0.85,          // Relevance score (0-1, higher = better)
  "path": "docs/sandbox.md",  // File path relative to OpenClaw root
  "lines": "42-58",       // Line range in original file
  "source": "docs",       // Content category
  "snippet": "...",       // Text excerpt with context
  "release": "v2026.2.12" // OpenClaw version when indexed
}
```

**How to use:**
1. **Check `score`** — Ignore results below 0.5 (low relevance)
2. **Read `snippet`** — Quick answer might be here
3. **Use `path:lines`** — Provide citation to user
4. **Filter by `source`** — Validate answer type (docs vs code)

---

## Troubleshooting

### No Results Found

```bash
# Try broader terms
node query.js "telegram" --docs
# instead of:
node query.js "telegram.requireMention.implicitInGroups" --docs

# Try general search (all content types)
node query.js "your query"
# instead of filtered mode
```

### Results Are All Code, But I Need Docs

```bash
# Use explicit mode filter
node query.js "your query" --docs
# instead of:
node query.js "your query"
```

### KB Is Outdated

```bash
# Manual sync to latest OpenClaw release
./sync-latest-tag.sh

# Or re-index from scratch
node index.js
```

### OpenAI API Errors

```bash
# Check .env has valid key
cat .env | grep OPENAI_API_KEY

# Verify API quota
# → https://platform.openai.com/usage
```

---

## Performance

- **Index time:** ~5-10 minutes for full OpenClaw codebase (~4000 chunks)
- **Query time:** <100ms (hybrid search, in-memory)
- **Storage:** ~50MB SQLite database
- **API cost:** ~$0.10 per full re-index (OpenAI embeddings)

---

## Contributing

Found a bug or have a suggestion? [Open an issue](https://github.com/mrkhachaturov/openclaw-kb/issues).

For OpenClaw itself: [github.com/openclaw/openclaw](https://github.com/openclaw/openclaw)

---

## License

MIT License — see [LICENSE](LICENSE)

---

## Summary: Quick Command Reference

| Task | Command |
|------|---------|
| **Basic config lookup** | `node query.js "question" --docs` |
| **Implementation research** | `node query.js "question" --code` |
| **Skill patterns** | `node query.js "question" --skills` |
| **Verify docs vs code** | `node query.js "question" --verify` |
| **Check KB version** | `node query.js --latest-release` |
| **What's new since X?** | `node query.js --since-release vX.Y.Z` |
| **JSON output** | `node query.js "question" --json` |
| **Limit results** | `node query.js "question" --top N` |
| **Filter by source** | `node query.js "question" --source docs` |

---

**Happy searching! 🚀**
