#!/usr/bin/env node
import { handler } from '../commands/index.js';

const force = process.argv.includes('--force');
const releaseIdx = process.argv.indexOf('--release');
const release = releaseIdx !== -1 ? process.argv[releaseIdx + 1] : undefined;
handler({ force, release });
