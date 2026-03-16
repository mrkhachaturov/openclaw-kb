#!/usr/bin/env node

import { Command } from 'commander';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf-8'));
const program = new Command();

program
  .name('openclaw-kb')
  .description('Self-updating vector knowledge base for OpenClaw')
  .version(pkg.version);

import { register as registerStats } from '../commands/stats.js';
import { register as registerLatest } from '../commands/latest.js';
import { register as registerHistory } from '../commands/history.js';
import { register as registerSince } from '../commands/since.js';

registerStats(program);
registerLatest(program);
registerHistory(program);
registerSince(program);

program.parse();
