// Runs the Android project's Gradle wrapper with the given tasks (`node scripts/gradle.mjs assembleDebug`),
// on Windows too, where cmd won't run a bare `gradlew` from the current folder.
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const windows = process.platform === 'win32';
const android = resolve('android');
const result = spawnSync(`"${resolve(android, windows ? 'gradlew.bat' : 'gradlew')}"`, process.argv.slice(2), {
  cwd: android,
  stdio: 'inherit',
  shell: true,
});

process.exit(result.status ?? 1);
