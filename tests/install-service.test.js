import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSystemdFiles } from '../commands/install-service.js';

test('buildSystemdFiles uses elapsed-time timers for hourly intervals', () => {
  const { serviceContent, timerContent } = buildSystemdFiles({
    interval: '2h',
    envFile: '/tmp/kb.env',
    upstreamDir: '/tmp/upstream',
    dataDir: '/tmp/data',
  });

  assert.match(serviceContent, /ExecStart=openclaw-kb sync --upstream-dir \/tmp\/upstream --data-dir \/tmp\/data/);
  assert.match(serviceContent, /EnvironmentFile=\/tmp\/kb\.env/);
  assert.match(timerContent, /OnBootSec=60/);
  assert.match(timerContent, /OnUnitActiveSec=7200/);
  assert.doesNotMatch(timerContent, /OnCalendar=/);
});
