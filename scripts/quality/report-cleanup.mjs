import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { pruneReportBranches } from './report-retention.mjs';
import { resolveBranchIdentity } from './branch-identity.mjs';
import { readFile } from 'node:fs/promises';

async function readConfig(projectRoot) {
  return JSON.parse(await readFile(path.join(projectRoot, 'quality.config.json'), 'utf8'));
}

export async function main(argv = process.argv.slice(2), {
  projectRoot = path.resolve(process.cwd()),
  now = Date.now(),
  branchIdentity,
} = {}) {
  const dryRun = !argv.includes('--cleanup');
  if (!dryRun && !argv.includes('--yes')) {
    throw new Error('La poda aplicada requiere --cleanup --yes; sin --cleanup se ejecuta dry-run');
  }
  const branch = branchIdentity ?? await resolveBranchIdentity(projectRoot);
  const config = await readConfig(projectRoot);
  const result = await pruneReportBranches({
    projectRoot,
    currentBranchKey: branch.branchKey,
    currentTaskId: null,
    config: config.reportRetention,
    dryRun,
    now,
  });
  process.stdout.write(`${JSON.stringify({
    command: 'quality report cleanup',
    status: 'pass',
    dryRun,
    branch,
    result,
  }, null, 2)}\n`);
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    process.stderr.write(`[quality:reports] ERROR: ${error.message}\n`);
    process.exitCode = 2;
  });
}
