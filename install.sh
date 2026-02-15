#!/usr/bin/env bash
# OpenClaw KB Auto-Update Installer
# Sets up systemd timer (Linux) or LaunchAgent (macOS) for automatic release tracking
set -euo pipefail

# Detect KB directory (script location)
KB_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
SYNC_SCRIPT="$KB_DIR/sync-latest-tag.sh"

# Load .env to get UPSTREAM_DIR if customized
if [ -f "$KB_DIR/.env" ]; then
    export $(grep -v '^#' "$KB_DIR/.env" | grep -v '^$' | xargs)
fi

# Use env var or default to source directory
UPSTREAM_DIR="${UPSTREAM_DIR:-$KB_DIR/source}"

# Detect platform
if [[ "$OSTYPE" == "linux-gnu"* ]]; then
    PLATFORM="linux"
elif [[ "$OSTYPE" == "darwin"* ]]; then
    PLATFORM="macos"
else
    echo "ERROR: Unsupported platform: $OSTYPE"
    echo "This installer supports Linux (systemd) and macOS (LaunchAgent)"
    exit 1
fi

# Verify prerequisites
if [ ! -f "$SYNC_SCRIPT" ]; then
    echo "ERROR: sync-latest-tag.sh not found at $SYNC_SCRIPT"
    exit 1
fi

if [ ! -f "$KB_DIR/.env" ]; then
    echo "ERROR: .env file not found at $KB_DIR/.env"
    echo "Please create .env with your OPENAI_API_KEY"
    exit 1
fi

# Clone upstream OpenClaw if not present
if [ ! -d "$UPSTREAM_DIR" ]; then
    echo "Upstream source not found, cloning OpenClaw..."
    git clone https://github.com/openclaw/openclaw.git "$UPSTREAM_DIR"

    if [ $? -ne 0 ]; then
        echo "ERROR: Failed to clone OpenClaw repository"
        exit 1
    fi

    echo "✓ Repository cloned"

    # Fetch tags and checkout latest release
    cd "$UPSTREAM_DIR"
    git fetch origin --tags --quiet

    LATEST_TAG=$(git tag --list 'v2026.*' --sort=-v:refname | head -1)
    if [ -n "$LATEST_TAG" ]; then
        echo "Checking out latest release: $LATEST_TAG..."
        git checkout "$LATEST_TAG" --quiet 2>&1 | grep -v "detached HEAD" || true
        echo "✓ Upstream ready at $LATEST_TAG"
    fi

    cd "$KB_DIR"
fi

echo "OpenClaw KB Auto-Update Installer"
echo "=================================="
echo "Platform:  $PLATFORM"
echo "KB Dir:    $KB_DIR"
echo "Upstream:  $UPSTREAM_DIR"
echo ""

# Linux installation (systemd)
if [ "$PLATFORM" = "linux" ]; then
    SERVICE_NAME="openclaw-kb-sync"
    SERVICE_FILE="/etc/systemd/system/${SERVICE_NAME}.service"
    TIMER_FILE="/etc/systemd/system/${SERVICE_NAME}.timer"

    echo "Creating systemd service..."
    sudo tee "$SERVICE_FILE" > /dev/null <<EOF
[Unit]
Description=OpenClaw KB auto-sync (track upstream releases)
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
User=$USER
Group=$USER
ExecStart=$SYNC_SCRIPT
Environment=HOME=$HOME
Environment=PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
WorkingDirectory=$KB_DIR

# Logging
StandardOutput=journal
StandardError=journal
SyslogIdentifier=$SERVICE_NAME

# Timeout: reindexing can take a few minutes (OpenAI API calls)
TimeoutStartSec=600
EOF

    echo "Creating systemd timer (runs every 2 hours)..."
    sudo tee "$TIMER_FILE" > /dev/null <<EOF
[Unit]
Description=OpenClaw KB auto-sync timer (every 2 hours)

[Timer]
OnCalendar=*:00/2
RandomizedDelaySec=300
Persistent=true

[Install]
WantedBy=timers.target
EOF

    echo "Enabling and starting timer..."
    sudo systemctl daemon-reload
    sudo systemctl enable "$SERVICE_NAME.timer"
    sudo systemctl start "$SERVICE_NAME.timer"

    echo ""
    echo "✓ Installation complete!"
    echo ""
    echo "Commands:"
    echo "  Status:  systemctl status $SERVICE_NAME.timer"
    echo "  Logs:    journalctl -u $SERVICE_NAME -f"
    echo "  Manual:  $SYNC_SCRIPT"
    echo ""
    echo "Next run:"
    systemctl list-timers "$SERVICE_NAME.timer" --no-pager | tail -2

# macOS installation (LaunchAgent)
elif [ "$PLATFORM" = "macos" ]; then
    PLIST_NAME="com.openclaw.kb-sync"
    PLIST_FILE="$HOME/Library/LaunchAgents/${PLIST_NAME}.plist"

    echo "Creating LaunchAgent..."
    mkdir -p "$HOME/Library/LaunchAgents"

    cat > "$PLIST_FILE" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>$PLIST_NAME</string>

    <key>ProgramArguments</key>
    <array>
        <string>$SYNC_SCRIPT</string>
    </array>

    <key>StartInterval</key>
    <integer>7200</integer>

    <key>RunAtLoad</key>
    <true/>

    <key>StandardOutPath</key>
    <string>$HOME/Library/Logs/openclaw-kb-sync.log</string>

    <key>StandardErrorPath</key>
    <string>$HOME/Library/Logs/openclaw-kb-sync-error.log</string>

    <key>EnvironmentVariables</key>
    <dict>
        <key>HOME</key>
        <string>$HOME</string>
        <key>PATH</key>
        <string>/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
    </dict>
</dict>
</plist>
EOF

    echo "Loading LaunchAgent..."
    launchctl unload "$PLIST_FILE" 2>/dev/null || true
    launchctl load "$PLIST_FILE"

    echo ""
    echo "✓ Installation complete!"
    echo ""
    echo "Commands:"
    echo "  Status:  launchctl list | grep $PLIST_NAME"
    echo "  Logs:    tail -f ~/Library/Logs/openclaw-kb-sync.log"
    echo "  Manual:  $SYNC_SCRIPT"
    echo ""
    echo "The agent will run every 2 hours and at login."
fi

echo ""
echo "Testing sync script..."
if "$SYNC_SCRIPT"; then
    echo "✓ Sync test successful"
else
    echo "⚠ Sync test failed - check logs for details"
    exit 1
fi
