#!/usr/bin/env bash
# KB Auto-Update: Track latest upstream release tag
# Standalone mode - checks for new releases and auto-upgrades KB to latest version.
# Designed to run as a cron job/systemd timer for continuous KB freshness.
set -euo pipefail

# Detect script directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# Set up logging
SYNC_LOG="$SCRIPT_DIR/log/sync.log"
mkdir -p "$(dirname "$SYNC_LOG")"

# Helper function to log sync operations
log_sync() {
  local timestamp=$(date -u +"%Y-%m-%dT%H:%M:%S")
  local message="$1"
  echo "$timestamp | $message" >> "$SYNC_LOG"

  # Keep last 1000 lines only (simple rotation)
  if [ -f "$SYNC_LOG" ]; then
    local linecount=$(wc -l < "$SYNC_LOG")
    if [ "$linecount" -gt 1000 ]; then
      tail -n 1000 "$SYNC_LOG" > "$SYNC_LOG.tmp" && mv "$SYNC_LOG.tmp" "$SYNC_LOG"
    fi
  fi
}

# Load configuration from .env
if [ -f "$SCRIPT_DIR/.env" ]; then
    export $(grep -v '^#' "$SCRIPT_DIR/.env" | xargs)
fi

# Use env var or default to source directory inside this repo
UPSTREAM_DIR="${UPSTREAM_DIR:-$SCRIPT_DIR/source}"

# Verify upstream exists (should be set up by install.sh)
if [ ! -d "$UPSTREAM_DIR" ]; then
    echo "[kb-auto-update] ERROR: Upstream directory not found: $UPSTREAM_DIR"
    echo "Run ./install.sh first to set up the knowledge base"
    exit 1
fi

# Verify it's a valid git repository
if [ ! -d "$UPSTREAM_DIR/.git" ]; then
    echo "[kb-auto-update] ERROR: $UPSTREAM_DIR exists but is not a git repository"
    exit 1
fi

# KB source directory prefixes (from upstream/kb/lib/config.js SOURCES)
KB_PREFIXES="^(docs/|src/|extensions/|skills/)"

cd "$UPSTREAM_DIR"

echo "[kb-auto-update] Fetching upstream tags..."
git fetch origin --tags --quiet

# Find latest semantic version tag (v2026.x.y format)
LATEST_TAG=$(git tag --list 'v2026.*' --sort=-v:refname | head -1)

if [ -z "$LATEST_TAG" ]; then
    echo "[kb-auto-update] ERROR: No v2026.* tags found"
    exit 1
fi

echo "[kb-auto-update] Latest upstream release: $LATEST_TAG"

# Get current state
CURRENT_TAG=$(git describe --tags --exact-match 2>/dev/null || echo "none")
CURRENT_COMMIT=$(git rev-parse HEAD)
TARGET_COMMIT=$(git rev-parse "$LATEST_TAG")

if [ "$CURRENT_TAG" = "$LATEST_TAG" ]; then
    echo "[kb-auto-update] Already on latest release ($LATEST_TAG)"
    # No logging - only log when version number changes
    exit 0
fi

echo "[kb-auto-update] Current: $CURRENT_TAG ($CURRENT_COMMIT)"
echo "[kb-auto-update] Target:  $LATEST_TAG ($TARGET_COMMIT)"

# Check which files would change
CHANGED=$(git diff --name-only HEAD.."$LATEST_TAG" || true)
RELEVANT=$(echo "$CHANGED" | grep -E "$KB_PREFIXES" || true)

# Stash local changes if any
if ! git diff --quiet || ! git diff --cached --quiet; then
    echo "[kb-auto-update] Stashing local changes..."
    git stash push -m "kb-auto-update: stash before $LATEST_TAG" --quiet
    STASHED=true
else
    STASHED=false
fi

# Checkout latest tag
echo "[kb-auto-update] Upgrading to $LATEST_TAG..."
git checkout "$LATEST_TAG" --quiet 2>&1 | grep -v "You are in 'detached HEAD' state" || true

if [ -z "$RELEVANT" ]; then
    echo "[kb-auto-update] No KB-relevant files changed, skipping reindex"
    echo "[kb-auto-update] Changed files (not indexed):"
    echo "$CHANGED" | head -20 | sed 's/^/  /' || echo "  (none)"
    # No logging - KB was not updated (for system logs use journalctl -u astromech-kb-sync)
    exit 0
fi

RELEVANT_COUNT=$(echo "$RELEVANT" | wc -l)
echo "[kb-auto-update] $RELEVANT_COUNT KB-relevant file(s) changed:"
echo "$RELEVANT" | head -20 | sed 's/^/  /' || true

# Extract and store release metadata
echo "[kb-auto-update] Extracting release metadata..."
cd "$SCRIPT_DIR"

# Call Node.js to extract and store release info
if command -v node &> /dev/null; then
    NODE_CMD="node"
elif [ -d "$HOME/.nvm" ]; then
    # Try loading nvm if available
    export NVM_DIR="$HOME/.nvm"
    [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
    NODE_CMD="node"
else
    echo "[kb-auto-update] WARNING: Node.js not found, skipping release metadata"
    NODE_CMD=""
fi

if [ -n "$NODE_CMD" ]; then
    $NODE_CMD -e "
import { extractReleaseMetadata } from './lib/release-parser.js';
import { openDb, insertRelease } from './lib/db.js';

try {
  const metadata = extractReleaseMetadata(
    '$LATEST_TAG',
    '$CURRENT_TAG',
    '$UPSTREAM_DIR'
  );

  const db = openDb();
  insertRelease(metadata);

  console.log('[kb-auto-update] Stored release metadata for $LATEST_TAG');
} catch (err) {
  console.error('[kb-auto-update] WARNING: Failed to extract release metadata:', err.message);
}
" || echo "[kb-auto-update] WARNING: Release metadata extraction failed"
fi

echo "[kb-auto-update] Re-indexing knowledge base..."

# Run reindexing (using NODE_CMD from above)
if [ -n "$NODE_CMD" ]; then
    $NODE_CMD index.js --release "$LATEST_TAG"
else
    echo "[kb-auto-update] ERROR: Node.js not found"
    exit 1
fi

echo "[kb-auto-update] ✓ KB upgraded to $LATEST_TAG"

# Log successful upgrade
COMMITS_COUNT=$(cd "$UPSTREAM_DIR" && git rev-list "$CURRENT_TAG".."$LATEST_TAG" --count 2>/dev/null || echo "?")
log_sync "$CURRENT_TAG → $LATEST_TAG | $COMMITS_COUNT commits | $RELEVANT_COUNT KB files | reindexed"
