/**
 * Runs a Gradle task in android/ with a correct toolchain, on any machine.
 *
 * Capacitor 7.1 plugins compile at source/target 21, so Gradle itself must RUN
 * on a JDK 21+ (a toolchain path alone fails with "invalid source release: 21").
 * Rather than committing a machine-specific path, this resolves a suitable JDK
 * at build time: JAVA_HOME first, then the JDK bundled with Android Studio,
 * then common install locations.
 *
 *   node scripts/android.mjs assembleDebug
 *   node scripts/android.mjs assembleRelease
 *
 * Paths below use forward slashes on purpose — Node accepts them on Windows.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const MIN_JAVA = 21;
const BACKSLASH = String.fromCharCode(92);
const isWindows = process.platform === 'win32';
const exe = (name) => (isWindows ? `${name}.exe` : name);

function parseMajor(text) {
  const match = /version "(\d+)(?:\.(\d+))?/.exec(text ?? '');
  if (!match) return null;
  const major = Number(match[1]);
  return major === 1 ? Number(match[2]) : major;
}

function javaMajor(javaHome) {
  const bin = path.join(javaHome, 'bin', exe('java'));
  if (!existsSync(bin)) return null;
  // `java -version` writes to stderr on every JDK, and `--version` (JDK 9+)
  // writes to stdout - read both streams so either form is picked up.
  const probe = spawnSync(bin, ["-version"], { encoding: "utf8" });
  return parseMajor(`${probe.stdout ?? ""}${probe.stderr ?? ""}`);
}

function safeList(dir) {
  try {
    return readdirSync(dir);
  } catch {
    return [];
  }
}

const STUDIO_DIRS = [
  'D:/Android/Android Studio',
  'C:/Program Files/Android/Android Studio',
  'E:/Android/Android Studio',
  '/Applications/Android Studio.app/Contents',
  path.join(os.homedir(), 'Android/Android Studio'),
];

const JDK_ROOTS = [
  'C:/Program Files/Eclipse Adoptium',
  'C:/Program Files/Java',
  'C:/Program Files/Microsoft',
  '/usr/lib/jvm',
  '/Library/Java/JavaVirtualMachines',
];

function* javaCandidates() {
  if (process.env.JAVA_HOME) yield process.env.JAVA_HOME;
  for (const dir of STUDIO_DIRS) yield path.join(dir, 'jbr');
  for (const root of JDK_ROOTS) {
    for (const entry of safeList(root)) {
      yield path.join(root, entry);
      yield path.join(root, entry, 'Contents/Home');
    }
  }
}

function resolveJavaHome() {
  const tried = [];
  for (const candidate of javaCandidates()) {
    if (!candidate || tried.includes(candidate)) continue;
    tried.push(candidate);
    const major = javaMajor(candidate);
    if (major !== null && major >= MIN_JAVA) return { javaHome: candidate, major };
  }
  console.error(
    `\nERROR: no JDK ${MIN_JAVA}+ found. The Capacitor plugins need one to compile.\n` +
      `Install Temurin ${MIN_JAVA} (https://adoptium.net), or point JAVA_HOME at the\n` +
      `JDK bundled with Android Studio. Locations checked:\n  ${tried.join('\n  ')}\n`,
  );
  process.exit(1);
}

/** Java .properties files escape both backslashes and colons. */
function unescapeProperty(value) {
  return value
    .split(BACKSLASH + BACKSLASH)
    .join(BACKSLASH)
    .split(BACKSLASH + ':')
    .join(':');
}

function resolveAndroidHome() {
  const fromEnv = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT;
  if (fromEnv && existsSync(fromEnv)) return fromEnv;

  const localProps = path.resolve('android', 'local.properties');
  if (existsSync(localProps)) {
    const match = /^sdk\.dir=(.*)$/m.exec(readFileSync(localProps, 'utf8'));
    if (match) {
      const dir = unescapeProperty(match[1].trim());
      if (existsSync(dir)) return dir;
    }
  }

  return (
    [
      path.join(os.homedir(), 'AppData/Local/Android/Sdk'),
      'D:/Android/Sdk',
      'C:/Android/Sdk',
      path.join(os.homedir(), 'Android/Sdk'),
      path.join(os.homedir(), 'Library/Android/sdk'),
    ].find((candidate) => existsSync(candidate)) ?? null
  );
}

const task = process.argv.slice(2);
if (task.length === 0) {
  console.error('usage: node scripts/android.mjs <gradle-task> [...]');
  process.exit(1);
}

const { javaHome, major } = resolveJavaHome();
const androidHome = resolveAndroidHome();
if (!androidHome) {
  console.error(
    '\nERROR: Android SDK not found. Set ANDROID_HOME, or create android/local.properties\n' +
      'containing sdk.dir=C:/Android/Sdk (see README section 1).\n',
  );
  process.exit(1);
}

console.log(`> JDK ${major} at ${javaHome}`);
console.log(`> Android SDK at ${androidHome}`);
console.log(`> gradlew ${task.join(' ')}`);

// Absolute path: a bare gradlew.bat is not resolvable from cwd by cmd.exe.
const gradlew = path.resolve('android', isWindows ? 'gradlew.bat' : 'gradlew');
const result = spawnSync(isWindows ? JSON.stringify(gradlew) : gradlew, task, {
  cwd: path.resolve('android'),
  stdio: 'inherit',
  shell: isWindows,
  env: {
    ...process.env,
    JAVA_HOME: javaHome,
    ANDROID_HOME: androidHome,
    ANDROID_SDK_ROOT: androidHome,
  },
});
process.exit(result.status ?? 1);
