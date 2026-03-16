#!/usr/bin/env node
import { handler as queryHandler } from '../commands/query.js';
import { handler as statsHandler } from '../commands/stats.js';
import { handler as latestHandler } from '../commands/latest.js';
import { handler as historyHandler } from '../commands/history.js';
import { handler as sinceHandler } from '../commands/since.js';

const args = process.argv.slice(2);

// Legacy flag routing
if (args.includes('--stats')) {
  statsHandler();
} else if (args.includes('--latest-release')) {
  latestHandler();
} else if (args.includes('--release-history')) {
  historyHandler();
} else if (args.includes('--since-release')) {
  const idx = args.indexOf('--since-release');
  sinceHandler({ version: args[idx + 1] });
} else {
  const opts = {};
  if (args.includes('--docs')) opts.docs = true;
  if (args.includes('--code')) opts.code = true;
  if (args.includes('--skills')) opts.skills = true;
  if (args.includes('--verify')) opts.verify = true;
  if (args.includes('--releases')) opts.releases = true;
  if (args.includes('--json')) opts.json = true;
  if (args.includes('--offline')) opts.offline = true;

  const topIdx = args.indexOf('--top');
  if (topIdx !== -1) opts.top = args[topIdx + 1];

  const query = args.filter(a => !a.startsWith('--') && a !== opts.top).join(' ');
  opts.query = query;
  queryHandler(opts);
}
