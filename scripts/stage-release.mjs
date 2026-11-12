// Release step for CI. The npm trusted publisher of this package may only
// *stage* versions: `npm stage publish` puts the version in the stage queue,
// and a maintainer approves it on npmjs.com (or `npm stage approve`) with 2FA.
// Nothing reaches `npm install` without that human step.
//
// Runs on every push to main once there are no changesets left, so it skips
// a version that is already published, and one that is already staged.

import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const dir = new URL('../packages/starlight-annotations/', import.meta.url);
const { name, version } = JSON.parse(readFileSync(new URL('package.json', dir), 'utf8'));
const id = `${name}@${version}`;

function published() {
  try {
    return execFileSync('npm', ['view', id, 'version'], { encoding: 'utf8' }).trim() === version;
  } catch {
    return false;
  }
}

if (published()) {
  console.log(`${id} is already published. Nothing to stage.`);
  process.exit(0);
}

console.log(`Staging ${id}…`);
const result = spawnSync('npm', ['stage', 'publish', '--provenance'], { cwd: dir, encoding: 'utf8' });
process.stdout.write(result.stdout ?? '');
process.stderr.write(result.stderr ?? '');

if (result.status !== 0) {
  if (/already (been )?staged|already exists in the stage/i.test(`${result.stdout}${result.stderr}`)) {
    console.log(`${id} is already waiting for approval.`);
    process.exit(0);
  }
  process.exit(result.status ?? 1);
}

console.log(`\n${id} is staged. Approve it at https://www.npmjs.com/package/${name} (or \`npm stage approve\`) to publish it.`);
