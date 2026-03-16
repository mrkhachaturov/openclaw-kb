import { openDb, closeDb, getReleaseHistory } from '../lib/db.js';
import { EXIT_SUCCESS, EXIT_RUNTIME_ERROR } from '../lib/exit-codes.js';

export function register(program) {
  program
    .command('history')
    .description('Show last 10 indexed releases')
    .action(() => handler());
}

export function handler() {
  try {
    openDb();
    const history = getReleaseHistory(10);
    if (history.length === 0) {
      console.log('No releases tracked yet');
    } else {
      console.log('Recent Releases:\n');
      for (const r of history) {
        const dateStr = r.date.split('T')[0];
        const impactStr = r.kb_impact ? r.kb_impact.padEnd(8) : 'unknown ';
        console.log(`${r.tag.padEnd(15)} (${dateStr}) - ${r.commits_count.toString().padStart(3)} commits - ${impactStr} impact`);
      }
    }
    closeDb();
    process.exit(EXIT_SUCCESS);
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(EXIT_RUNTIME_ERROR);
  }
}
