# Upstream Knowledge Base - Usage Guide for AI Agents

> **Audience:** Claude Code and AI assistants working with OpenClaw.
> **Purpose:** Comprehensive guide for deciding WHEN to query the KB, WHICH command to use, and HOW to interpret results.
> **Related:** [upstream-knowledge.md](upstream-knowledge.md) contains a minimal agent workflow example.

## Overview

The upstream knowledge base contains **3,910 indexed chunks** from OpenClaw documentation and source code:
- **Docs**: User guides, configuration references, concepts
- **Code**: Implementation source (TypeScript) with code-aware chunking
- **Config schemas**: Type definitions, validation schemas
- **Skills**: Real-world skill examples

**Query Features:**
- ✨ **Automatic query expansion**: Abbreviations and synonyms are handled automatically
  - "tts" → expands to "text-to-speech, voice, speech"
  - "tg" → expands to "telegram"
  - "config" → expands to "configuration, setup, settings"
  - "bot" ↔ "agent" ↔ "assistant"
- 🔍 **Hybrid search**: Combines semantic (vector) and keyword (BM25) matching with RRF fusion
- ⚡ **Fast retrieval**: <2 seconds typical query time

## Available Query Commands

```bash
# General search (docs + code combined, best for broad queries)
node query.jsquery "question"

# Documentation only (config guides, how-tos, references)
node query.jsdocs "question"

# Implementation code only (TypeScript source, functions, classes)
node query.jscode "question"

# Skill examples only (SKILL.md patterns, handlers)
node query.jsskills "question"

# Verification mode (shows docs + related implementation)
node query.jsverify "question"

# Release tracking (new features)
node query.jsquery --latest-release              # Show current KB version
node query.jsquery --release-history             # Show recent releases
node query.jsquery --since-release v2026.2.9     # Filter chunks by release
```

## Decision Tree: Which Command to Use?

```
┌─────────────────────────────────────┐
│ What are you trying to understand?  │
└────────────┬────────────────────────┘
             │
             ├─ "How to configure X?"
             │  → node query.jsdocs
             │
             ├─ "What config options exist?"
             │  → node query.jsdocs "X configuration"
             │
             ├─ "How is X implemented?"
             │  → node query.jscode "X implementation"
             │
             ├─ "Where is function Y defined?"
             │  → node query.jscode "function Y"
             │
             ├─ "How to create a skill that does Z?"
             │  → node query.jsskills "Z"
             │
             ├─ "Docs say X, but how does it actually work?"
             │  → node query.jsverify "X"
             │
             └─ "Unclear/broad question"
                → node query.jsquery (tries everything)
```

## Usage Patterns by Task Type

### Pattern 1: Basic Configuration (DOCS ONLY)

**When:** User asks "how to configure X" where X is a standard feature documented in guides.

**Workflow:**
```bash
# Step 1: Search documentation
node query.jsdocs "configure telegram bot token"

# If docs are clear and sufficient → STOP
# No need to check source code for basic config
```

**Example scenarios:**
- "How to set up Telegram bot?"
- "What's the sandbox.mode option?"
- "How to configure agent skills allowlist?"

**Why docs-only is sufficient:**
- Configuration is documented with examples
- Schema validation handles correctness
- Implementation details aren't relevant to user

---

### Pattern 2: Complex Configuration (VERIFY)

**When:** Docs mention a feature but behavior is unclear, or user reports unexpected behavior.

**Workflow:**
```bash
# Step 1: Read documentation
node query.jsdocs "requireMention telegram groups"

# Step 2: If docs are vague/unclear, verify with code
node query.jsverify "requireMention telegram groups"
# → Shows docs + actual implementation

# Step 3: Check specific implementation if needed
node query.jscode "requireMention group message handling"
```

**Example scenarios:**
- "Why isn't requireMention working in my group?"
- "Docs say 'agents can have skills', but how are they resolved?"
- "What does 'implicit mention' mean in practice?"

**Why verification helps:**
- Docs may be outdated vs implementation
- Edge cases only visible in code
- Behavior depends on internal logic

---

### Pattern 3: Implementation Research (CODE ONLY)

**When:** Troubleshooting, debugging, or understanding internal behavior.

**Workflow:**
```bash
# Step 1: Find relevant implementation
node query.jscode "sandbox container creation"

# Step 2: Narrow down to specific area
node query.jscode "docker exec sandbox" --top 5

# Step 3: If needed, check related security code
node query.jscode "sandbox permission validation"
```

**Example scenarios:**
- "Why is sandbox failing to start?"
- "How does tool execution permission work?"
- "Where is the agent loop implemented?"

**Why code-only:**
- Debugging requires understanding implementation
- Docs don't cover internal error paths
- Need to see actual logic flow

---

### Pattern 4: Skill Development (SKILLS → CODE)

**When:** Creating a new skill or understanding skill patterns.

**Workflow:**
```bash
# Step 1: Find similar skill examples
node query.jsskills "tool handler function"

# Step 2: Check skill configuration docs
node query.jsdocs "skill creation guide"

# Step 3: If implementing complex logic, check agent code
node query.jscode "skill execution context"
```

**Example scenarios:**
- "How to create a skill that calls external API?"
- "What parameters does a skill handler receive?"
- "How to return structured data from a skill?"

**Why this order:**
- Skills follow patterns (examples first)
- Docs explain conventions
- Code shows execution context

---

### Pattern 5: Version Tracking (RELEASE FILTERS)

**When:** Upgrading OpenClaw and need to understand what changed since your current version.

**Workflow:**
```bash
# Step 1: Check what KB version is indexed
node query.js --latest-release
# → Shows: v2026.2.12

# Step 2: See what's new since your current version
node query.js --since-release v2026.2.9 --top 30
# → Shows all chunks indexed after that version

# Step 3: Review release history for major changes
node query.js --release-history
# → See: commits count, KB impact level
```

**Example scenarios:**
- "Should I upgrade from v2026.2.9 to v2026.2.12?"
- "What documentation changed between releases?"
- "Has the sandbox configuration changed since a specific version?"

**Why release filtering helps:**
- Identifies breaking changes in new releases
- Shows documentation additions/updates
- Helps plan upgrade path
- Filters noise (only see relevant changes)

---

### Pattern 6: Architecture Understanding (QUERY → VERIFY)

**When:** Understanding system design, concepts, or how components interact.

**Workflow:**
```bash
# Step 1: Broad search to find relevant docs/code
node query.jsquery "agent session lifecycle"

# Step 2: If results span docs + code, verify connections
node query.jsverify "agent session lifecycle"

# Step 3: Deep dive into specific components
node query.jscode "session manager" --top 10
```

**Example scenarios:**
- "How does the agent loop work?"
- "What happens when a message arrives?"
- "How are tools executed in sandbox?"

**Why combined approach:**
- Architecture spans docs (concepts) + code (implementation)
- Need both high-level (docs) and details (code)
- Verification ensures understanding is correct

---

## Best Practices

### ✅ DO

1. **Start with docs for user-facing features**
   - Configuration, setup, channels, providers → `kb-docs`

2. **Use verification when docs are insufficient**
   - Vague docs → `kb-verify`
   - Reported bugs → `kb-verify` to confirm behavior

3. **Use code-only for troubleshooting**
   - Error messages → `kb-code "error message text"`
   - Internal behavior → `kb-code "component name"`

4. **Check skill examples before writing new skills**
   - Existing patterns → `kb-skills`
   - Avoid reinventing wheels

5. **Use --top N to control result count**
   - Narrow queries: `--top 3`
   - Broad exploration: `--top 10`

### ❌ DON'T

1. **Don't check code for basic configuration**
   - If docs clearly explain how to set `telegram.botToken`, don't verify source

2. **Don't verify everything by default**
   - Verification adds latency (2 API calls instead of 1)
   - Only verify when docs are unclear or behavior is unexpected

3. **Don't search without a specific question**
   - Bad: `node query.jsquery "telegram"`
   - Good: `node query.jsdocs "telegram bot configuration"`

4. **Don't ignore content type tags in results**
   - `[docs]` → User-facing documentation
   - `[code]` → Implementation details
   - `[config]` → Type definitions, schemas

5. **Don't assume docs == implementation**
   - Open-source projects can have outdated docs
   - When in doubt, verify with code

---

## Performance Considerations

### Query Cost

Each query costs one OpenAI embedding API call (~$0.00002):
- `kb-docs`, `kb-code`, `kb-skills`, `kb-query`: **1 API call**
- `kb-verify`: **2 API calls** (main search + code search)

### Query Speed

- Vector + FTS hybrid search: **<2 seconds** typically
- Network latency (VPS → OpenAI): adds ~200-500ms
- Database is in-memory (31 MB), no disk I/O

**Optimization:**
- Use specific queries (faster, better results)
- Limit results with `--top N` when appropriate
- Cache repeated queries mentally (same question → same answer)

---

## Advanced Usage

### Combining Filters

```bash
# Narrow by source AND content type
node query.jsquery "authentication" --source gateway --top 5
# → Only gateway-related docs/code about auth

# Docs from specific source
node query.jsdocs "telegram groups" --source telegram
```

### Release-Based Filtering

```bash
# Check current KB version
node query.jsquery --latest-release
# → Shows which OpenClaw release is currently indexed

# Show release history
node query.jsquery --release-history
# → Shows last 10 releases with commit counts and KB impact

# Find what changed since a specific release
node query.jsquery --since-release v2026.2.9 --top 20
# → Shows only chunks indexed at or after v2026.2.9
# Useful for: "What's new since my version?"
```

### JSON Output for Programmatic Use

```bash
node query.jsdocs "agent configuration" --json | jq '.results[0].path'
# → Extract first result path programmatically
```

### Iterative Refinement

```bash
# 1. Broad search
node query.jsquery "sandbox configuration"

# 2. Too many results? Narrow down
node query.jsdocs "sandbox scope per-agent"

# 3. Still unclear? Verify implementation
node query.jsverify "sandbox scope per-agent"

# 4. Need specific function? Code search
node query.jscode "resolveSandboxConfigForAgent"
```

---

## Common Pitfalls & Solutions

### Pitfall 1: "No results found"

**Cause:** Query too specific or using very uncommon terminology.

**Note:** Query expansion now automatically handles common abbreviations and synonyms, so this is less common than before. The system automatically expands:
- Abbreviations: "tts" → "text-to-speech", "tg" → "telegram"
- Synonyms: "config" ↔ "configuration", "bot" ↔ "agent"

**Solution (if still no results):**
```bash
# Try broader terms
node query.jsdocs "telegram" instead of "telegram.requireMention"

# Try different phrasing (though expansion usually handles this)
node query.jsdocs "bot token" instead of "botToken configuration"

# Try general search instead of filtered
node query.jsquery "your question" instead of kb-docs/kb-code
```

### Pitfall 2: "Results are all code, but I need docs"

**Cause:** Used `kb-query` instead of `kb-docs`.

**Solution:**
```bash
# Explicit content type filter
node query.jsdocs "your question"  # Forces docs-only
```

### Pitfall 3: "Docs contradict implementation"

**Cause:** Docs may be outdated vs current code.

**Solution:**
```bash
# Verify with actual implementation
node query.jsverify "feature name"

# Trust code over docs when they conflict
node query.jscode "specific function" --top 3
```

### Pitfall 4: "Too many irrelevant results"

**Cause:** Query too broad.

**Solution:**
```bash
# Add context to query
node query.jsdocs "telegram bot configuration groups"
# vs just "telegram"

# Limit results
node query.jsdocs "telegram" --top 3

# Filter by source
node query.jsdocs "telegram" --source telegram
```

---

## Examples by Complexity

### Simple: Basic Config Lookup
```bash
# User: "How do I set my Telegram bot token?"
node query.jsdocs "telegram bot token"
# → Returns: docs/channels/telegram.md with clear example
# ✓ DONE - No verification needed
```

### Medium: Feature Behavior Clarification
```bash
# User: "What does sandbox.mode = 'all' mean?"
node query.jsdocs "sandbox mode"
# → Returns: docs explain modes, but not implementation details

# Docs mention "creates one container per agent" - unclear lifecycle
node query.jsverify "sandbox container lifecycle"
# → Shows docs + code that creates/reuses containers
# ✓ DONE - Verified behavior
```

### Complex: Debugging Issue
```bash
# User: "Sandbox container fails with 'permission denied'"
node query.jscode "sandbox permission" --top 5
# → Find permission check logic

node query.jscode "sandbox docker exec" --top 5
# → Find container execution code

node query.jscode "validateHostEnv" --top 3
# → Find env validation that might block execution
# ✓ DONE - Identified root cause
```

### Expert: Architecture Understanding
```bash
# User: "Explain the full agent execution flow"

# 1. High-level concepts
node query.jsdocs "agent loop execution"

# 2. Verify with implementation
node query.jsverify "agent loop"

# 3. Deep dive into specific components
node query.jscode "agent message handler" --top 10
node query.jscode "tool execution sandbox" --top 10
node query.jscode "session management" --top 5

# 4. Check related infrastructure
node query.jscode "gateway RPC methods" --top 10
# ✓ DONE - Complete mental model
```

---

## Integration with AI Workflows

### When Configuring OpenClaw

1. **User provides requirement** → Search docs first
2. **Find config option** → Check schema for validation
3. **Option unclear?** → Verify with implementation
4. **Complex behavior?** → Read related code

### When Troubleshooting

1. **User reports error** → Search error message in code
2. **Find error source** → Check surrounding logic
3. **Check documentation** → See if behavior is documented
4. **Propose fix** → Based on code understanding

### When Writing Skills

1. **Check existing skills** → Avoid duplication
2. **Read skill creation guide** → Follow conventions
3. **Check agent context** → Understand available APIs
4. **Reference similar patterns** → Consistency

---

## Summary: Quick Reference

| Task | Command | Why |
|------|---------|-----|
| Basic config | `kb-docs` | Docs explain user-facing features |
| Unclear docs | `kb-verify` | Cross-reference implementation |
| Debugging | `kb-code` | Need implementation details |
| Skill creation | `kb-skills` | Follow existing patterns |
| Architecture | `kb-query → kb-verify` | Concepts + implementation |
| Specific function | `kb-code "function name"` | Direct code lookup |

**Default Strategy:**
1. Try `kb-docs` first (fastest, user-facing)
2. If insufficient, use `kb-verify` (adds implementation context)
3. If debugging/troubleshooting, use `kb-code` (direct source access)

**When in Doubt:**
- Start broad (`kb-query`)
- Narrow down with type filters (`kb-docs`, `kb-code`)
- Verify when docs and behavior don't match (`kb-verify`)
