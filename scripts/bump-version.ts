/**
 * bump-version.ts
 *
 * Automated semantic version bumper.
 * Rule: Each bump increments the patch version by 1; when a digit exceeds 9, it carries over to the higher segment (满9进一位).
 * E.g.: 0.0.1 -> 0.0.2 -> ... -> 0.0.9 -> 0.1.0 -> ... -> 0.1.9 -> 0.2.0 -> ... -> 0.9.9 -> 1.0.0
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const packageJsonPath = path.resolve(__dirname, '../package.json');

export function computeNextVersion(currentVersion: string): string {
  const parts = currentVersion.trim().split('.').map(Number);
  if (parts.length !== 3 || parts.some(isNaN)) {
    throw new Error(`Invalid version format: "${currentVersion}". Expected x.y.z`);
  }

  let [major, minor, patch] = parts;

  patch += 1;
  if (patch > 9) {
    patch = 0;
    minor += 1;
    if (minor > 9) {
      minor = 0;
      major += 1;
    }
  }

  return `${major}.${minor}.${patch}`;
}

export function bumpPackageVersion(): { oldVersion: string; newVersion: string } {
  const raw = fs.readFileSync(packageJsonPath, 'utf-8');
  const pkg = JSON.parse(raw);
  const oldVersion = pkg.version || '0.0.1';
  const newVersion = computeNextVersion(oldVersion);

  pkg.version = newVersion;
  fs.writeFileSync(packageJsonPath, JSON.stringify(pkg, null, 2) + '\n', 'utf-8');

  return { oldVersion, newVersion };
}

// CLI Execution
if (process.argv[1] === __filename) {
  const { oldVersion, newVersion } = bumpPackageVersion();
  console.log(`[Version Bump] ${oldVersion} -> ${newVersion} (满9进位)`);
}
