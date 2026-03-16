import { handler as queryHandler } from './query.js';

function makeAlias(name, description, filterOpts) {
  return (program) => {
    program
      .command(`${name} <text...>`)
      .description(description)
      .option('--json', 'Output JSON')
      .option('--top <n>', 'Number of results', '8')
      .option('--offline', 'FTS-only keyword search')
      .action(async (textParts, opts) => {
        await queryHandler({ query: textParts.join(' '), ...filterOpts, ...opts });
      });
  };
}

export const registerDocs = makeAlias('docs', 'Search documentation', { docs: true });
export const registerCode = makeAlias('code', 'Search source code', { code: true });
export const registerSkills = makeAlias('skills', 'Search skills', { skills: true });
export const registerVerify = makeAlias('verify', 'Search docs + related code', { verify: true, docs: true });
