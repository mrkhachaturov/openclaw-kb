import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { platform, homedir } from 'node:os';
import { getUpstreamRoot } from '../lib/config.js';
import { EXIT_SUCCESS, EXIT_CONFIG_ERROR } from '../lib/exit-codes.js';

export function register(program) {
  program
    .command('install-service')
    .description('Generate systemd timer (Linux) or LaunchAgent (macOS)')
    .option('--interval <duration>', 'Sync interval (e.g. 2h, 30m)', '2h')
    .option('--env-file <path>', 'Path to env file for OPENAI_API_KEY')
    .option('--upstream-dir <path>', 'Baked into generated service')
    .option('--data-dir <path>', 'Baked into generated service')
    .action((opts) => handler(opts));
}

export function handler(opts = {}) {
  const { interval = '2h', envFile, upstreamDir, dataDir } = opts;
  const resolvedUpstream = upstreamDir ? resolve(upstreamDir) : getUpstreamRoot();
  const resolvedData = dataDir ? resolve(dataDir) : (process.env.KB_DATA_DIR ? resolve(process.env.KB_DATA_DIR) : resolve('./data'));

  const os = platform();
  if (os === 'linux') {
    generateSystemd({ interval, envFile, upstreamDir: resolvedUpstream, dataDir: resolvedData });
  } else if (os === 'darwin') {
    generateLaunchd({ interval, envFile, upstreamDir: resolvedUpstream, dataDir: resolvedData });
  } else {
    console.error(`Unsupported platform: ${os}. Supports Linux (systemd) and macOS (launchd).`);
    process.exit(EXIT_CONFIG_ERROR);
  }

  if (!envFile) {
    console.warn('\nWarning: No --env-file specified. The generated service will not have OPENAI_API_KEY set.');
    console.warn('You must ensure it is available via the shell environment or another mechanism.');
  }

  process.exit(EXIT_SUCCESS);
}

function parseInterval(str) {
  const match = str.match(/^(\d+)(h|m|s)?$/);
  if (!match) return 7200;
  const val = parseInt(match[1], 10);
  const unit = match[2] || 'h';
  if (unit === 'h') return val * 3600;
  if (unit === 'm') return val * 60;
  return val;
}

function generateSystemd({ interval, envFile, upstreamDir, dataDir }) {
  const dir = join(homedir(), '.config', 'systemd', 'user');
  mkdirSync(dir, { recursive: true });

  const minutes = Math.round(parseInterval(interval) / 60);

  let serviceContent = `[Unit]\nDescription=OpenClaw KB Sync\n\n[Service]\nType=oneshot\nExecStart=openclaw-kb sync --upstream-dir ${upstreamDir} --data-dir ${dataDir}\n`;
  if (envFile) {
    serviceContent += `EnvironmentFile=${resolve(envFile)}\n`;
  }

  const timerContent = `[Unit]\nDescription=OpenClaw KB Sync Timer\n\n[Timer]\nOnCalendar=*:0/${minutes}\nPersistent=true\n\n[Install]\nWantedBy=timers.target\n`;

  const servicePath = join(dir, 'openclaw-kb-sync.service');
  const timerPath = join(dir, 'openclaw-kb-sync.timer');

  writeFileSync(servicePath, serviceContent);
  writeFileSync(timerPath, timerContent);

  console.log(`Created: ${servicePath}`);
  console.log(`Created: ${timerPath}`);
  console.log('\nTo enable:');
  console.log('  systemctl --user daemon-reload');
  console.log('  systemctl --user enable openclaw-kb-sync.timer');
  console.log('  systemctl --user start openclaw-kb-sync.timer');
}

function generateLaunchd({ interval, envFile, upstreamDir, dataDir }) {
  const dir = join(homedir(), 'Library', 'LaunchAgents');
  mkdirSync(dir, { recursive: true });

  const seconds = parseInterval(interval);

  let envVarsXml = '';
  if (envFile && existsSync(resolve(envFile))) {
    const content = readFileSync(resolve(envFile), 'utf-8');
    const envVars = {};
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx === -1) continue;
      envVars[trimmed.slice(0, eqIdx).trim()] = trimmed.slice(eqIdx + 1).trim();
    }
    if (Object.keys(envVars).length > 0) {
      envVarsXml = '    <key>EnvironmentVariables</key>\n    <dict>\n';
      for (const [k, v] of Object.entries(envVars)) {
        envVarsXml += `        <key>${k}</key>\n        <string>${v}</string>\n`;
      }
      envVarsXml += '    </dict>\n';
    }
  }

  const plistContent = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.openclaw.kb-sync</string>
    <key>ProgramArguments</key>
    <array>
        <string>openclaw-kb</string>
        <string>sync</string>
        <string>--upstream-dir</string>
        <string>${upstreamDir}</string>
        <string>--data-dir</string>
        <string>${dataDir}</string>
    </array>
    <key>StartInterval</key>
    <integer>${seconds}</integer>
${envVarsXml}</dict>
</plist>
`;

  const plistPath = join(dir, 'com.openclaw.kb-sync.plist');
  writeFileSync(plistPath, plistContent);

  console.log(`Created: ${plistPath}`);
  console.log('\nTo enable:');
  console.log(`  launchctl load ${plistPath}`);
  console.log('\nTo disable:');
  console.log(`  launchctl unload ${plistPath}`);
}
