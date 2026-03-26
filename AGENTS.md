# OpenClaw Knowledge Base — AI Agent Guide

Semantic search over OpenClaw documentation, source code, skills, and configurations.

Use when you need accurate, up-to-date OpenClaw context for answering questions or implementing features.

## Quick Reference

```bash
# Search by content type
openclaw-kb docs "sandbox configuration"
openclaw-kb code "TtsProviderSchema"
openclaw-kb skills "external API call"
openclaw-kb verify "requireMention behavior"    # docs + related code

# Source filters (mutually exclusive)
openclaw-kb query "provider" --ios              # Swift iOS sources
openclaw-kb query "settings" --macos            # Swift macOS sources
openclaw-kb query "OpenClawKit" --shared        # shared Swift package
openclaw-kb query "v2026.3" --releases          # release notes

# Output options
openclaw-kb query "webhook" --json --top 5
openclaw-kb query "telegram" --offline          # FTS-only, no API key

# Metadata
openclaw-kb stats
openclaw-kb latest
openclaw-kb history
openclaw-kb since v2026.2.21
```

## When to Use

| Scenario | Command | Why |
|----------|---------|-----|
| Configuration questions | `openclaw-kb docs "telegram bot token"` | Accurate config reference |
| Implementation research | `openclaw-kb code "sandbox container"` | Find actual source code |
| Debug unexpected behavior | `openclaw-kb verify "requireMention"` | Cross-reference docs with code |
| Skill development | `openclaw-kb skills "external API call"` | Real-world patterns |
| iOS/macOS development | `openclaw-kb query "TalkModeManager" --ios` | Swift source search |
| What changed in a release | `openclaw-kb since v2026.2.21` | Version-bounded results |

Don't use for: user-specific deployment questions, running service state, non-OpenClaw topics.

## Query Modes

| Mode | When to Use |
|------|------------|
| `docs` | Configuration, setup, user-facing features |
| `code` | Implementation details, debugging, TypeScript/JavaScript |
| `skills` | Skill patterns, SKILL.md format, handler examples |
| `verify` | Docs unclear — cross-references docs with code |
| `--ios` / `--macos` / `--shared` | Swift codebase (apps/) |
| `--releases` | Release notes, changelogs |
| `--offline` | Keyword search only, no API key needed |

Query expansion is automatic: `tts` finds "text-to-speech", `tg` finds "telegram", `config` matches "configuration".

## Result Structure (--json)

```json
{
  "query": "sandbox configuration",
  "results": [
    {
      "score": 0.842,
      "path": "docs/sandbox.md",
      "lines": "42-58",
      "source": "docs",
      "contentType": "docs",
      "language": "markdown",
      "category": "documentation",
      "snippet": "..."
    }
  ]
}
```

The `path` is relative to the OpenClaw source root (UPSTREAM_DIR), not the KB repo.

## Exit Codes

| Code | Meaning | Agent Action |
|------|---------|-------------|
| `0` | Success | Parse results normally |
| `1` | Runtime error | Report error to user |
| `2` | Config error | Check environment setup |
| `3` | No results | Try broader query or different mode |

## Integration

### Claude Code / Cursor

```bash
# In your project, install via mise:
# mise.toml:
# [tools]
# "npm:openclaw-kb" = "latest"

# Then query from any agent/skill:
openclaw-kb docs "your question" --json
```

If you expose the KB over MCP, configure the server with explicit `KB_DATA_DIR` and `UPSTREAM_DIR` environment variables. Do not assume the host will inherit your shell or `mise` environment.

### Programmatic (Python)

```python
import subprocess, json

def query_kb(question, mode="docs"):
    result = subprocess.run(
        ["openclaw-kb", mode, question, "--json"],
        capture_output=True, text=True
    )
    if result.returncode == 3:
        return []  # no results
    return json.loads(result.stdout).get("results", [])
```

## Best Practices

1. **Use specific modes** — `openclaw-kb docs "X"` over `openclaw-kb query "X"`
2. **Cite sources** — include `path:lines` from results
3. **Use verify for ambiguity** — when docs might not match implementation
4. **Check exit code 3** — no results means try broader terms
5. **Use --json for parsing** — don't parse human-readable output
6. **Ignore low scores** — results below 0.5 are likely irrelevant
