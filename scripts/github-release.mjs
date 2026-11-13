// Creates the GitHub Release `v<version>` for a version that is live on npm,
// with that version's section of the changelog as notes. It does nothing when
// the release already exists, so it is safe to run again.
//
//   node scripts/github-release.mjs 0.2.0   # one version, e.g. to backfill (v0.2.0 works too)
//
// The release workflow calls it through stage-release.mjs once an approved
// version shows up on npm. Needs the `gh` CLI, signed in or with GH_TOKEN /
// GITHUB_TOKEN set.

import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const dir = new URL('../packages/starlight-annotations/', import.meta.url);
const { name } = JSON.parse(readFileSync(new URL('package.json', dir), 'utf8'));

/** The body of `## <version>` in the changelog, without the heading. */
export function changelogSection(version) {
  const changelog = readFileSync(new URL('CHANGELOG.md', dir), 'utf8');
  const lines = changelog.split('\n');
  const start = lines.findIndex((line) => line.trim() === `## ${version}`);
  if (start === -1) return '';
  const end = lines.findIndex((line, i) => i > start && /^## /.test(line));
  return lines
    .slice(start + 1, end === -1 ? undefined : end)
    .join('\n')
    .trim();
}

function npmView(version, field) {
  try {
    return execFileSync('npm', ['view', `${name}@${version}`, field], { encoding: 'utf8' }).trim();
  } catch {
    return '';
  }
}

// The commit that set the version in package.json, so the tag points at the
// code that was published. Falls back to the current commit.
function versionCommit(version) {
  try {
    // Oldest first-parent commit that changed the count of this string: the
    // one that added it (the newest would be the one that bumped it away).
    const sha = execFileSync(
      'git',
      ['log', '--first-parent', '--format=%H', `-S"version": "${version}"`, '--', fileURLToPath(new URL('package.json', dir))],
      { encoding: 'utf8' },
    )
      .trim()
      .split('\n')
      .at(-1);
    if (sha) return sha;
  } catch {}
  return execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
}

export { versionCommit };

export function githubRelease(version) {
  const tag = `v${version}`;
  if (npmView(version, 'version') !== version) {
    console.log(`${name}@${version} is not on npm yet. No GitHub release.`);
    return;
  }
  if (spawnSync('gh', ['release', 'view', tag], { stdio: 'ignore' }).status === 0) {
    console.log(`GitHub release ${tag} already exists.`);
    return;
  }

  const deprecated = npmView(version, 'deprecated');
  const notes = [
    deprecated && `> [!WARNING]\n> Deprecated on npm: ${deprecated}.`,
    changelogSection(version) || 'First release.',
    `📦 [${name}@${version} on npm](https://www.npmjs.com/package/${name}/v/${version})`,
  ]
    .filter(Boolean)
    .join('\n\n');

  const result = spawnSync(
    'gh',
    ['release', 'create', tag, '--target', versionCommit(version), '--title', tag, '--notes-file', '-'],
    { input: notes, encoding: 'utf8' },
  );
  process.stdout.write(result.stdout ?? '');
  process.stderr.write(result.stderr ?? '');
  if (result.status !== 0) throw new Error(`Could not create the GitHub release ${tag}.`);
  console.log(`Created the GitHub release ${tag}.`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  // Accept the tag name too: "v0.2.0" and "0.2.0" are the same version.
  const version = process.argv[2]?.replace(/^v/, '');
  if (!version) {
    console.error('Usage: node scripts/github-release.mjs <version>');
    process.exit(1);
  }
  githubRelease(version);
}
