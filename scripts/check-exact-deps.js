#!/usr/bin/env node
// Enforces this project's dependency-hardening convention (save-exact=true
// in .npmrc): every entry in dependencies/devDependencies must be a plain
// exact version, not a range. Catches the case .npmrc alone can't — a
// range added by hand, or by a tool that ignores .npmrc — before it lands
// on main. See ~/.claude/CLAUDE.md's "Dependency hardening" section.
const pkg = require('../package.json');

const EXACT_VERSION = /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/;

const offenders = [];
for (const section of ['dependencies', 'devDependencies']) {
  const deps = pkg[section] || {};
  for (const [name, version] of Object.entries(deps)) {
    if (!EXACT_VERSION.test(version)) {
      offenders.push(`${section}.${name}: "${version}"`);
    }
  }
}

if (offenders.length > 0) {
  console.error('Non-exact dependency version(s) found in package.json:\n');
  offenders.forEach((line) => console.error(`  ${line}`));
  console.error('\nPin these to an exact version (no ^ ~ > < * ||).');
  process.exit(1);
}

console.log('All dependencies are exact-pinned.');
