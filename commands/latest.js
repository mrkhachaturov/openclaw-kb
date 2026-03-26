import { openDb, closeDb, getCurrentIndexedRelease } from '../lib/db.js';
import { EXIT_SUCCESS, EXIT_RUNTIME_ERROR } from '../lib/exit-codes.js';

export function register(program) {
  program
    .command('latest')
    .description('Show current indexed release version')
    .action(() => handler());
}

export function handler() {
  try {
    openDb();
    const latest = getCurrentIndexedRelease();
    if (!latest) {
      console.log('No releases tracked yet');
    } else {
      console.log(`Latest Release: ${latest.tag} (${latest.date.split('T')[0]})`);
      if (latest.previous_tag) {
        console.log(`${latest.commits_count} commits since ${latest.previous_tag}`);
      }
      console.log(`KB Impact: ${latest.kb_impact} (${latest.kb_files_changed} files changed)`);
    }
    closeDb();
    process.exit(EXIT_SUCCESS);
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(EXIT_RUNTIME_ERROR);
  }
}
