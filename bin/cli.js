#!/usr/bin/env node

import { Command } from 'commander';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf-8'));
const program = new Command();

program
  .name('openclaw-kb')
  .description('Self-updating vector knowledge base for OpenClaw')
  .version(pkg.version);

// Subcommands will be registered here as they are implemented

program.parse();
