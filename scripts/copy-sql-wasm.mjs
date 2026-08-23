/**
 * Copies sql.js's WASM binary into public/assets so the *browser* build of
 * @capacitor-community/sqlite (jeep-sqlite) can load it offline.
 *
 * With --clean it removes the file instead: production builds target Android,
 * which uses native SQLite, and anything left in public/ would be copied
 * verbatim into the APK.
 */

import { copyFile, mkdir, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
const target = path.resolve('public', 'assets');
const wasm = path.join(target, 'sql-wasm.wasm');

if (process.argv.includes('--clean')) {
  await rm(wasm, { force: true });
  console.log('removed public/assets/sql-wasm.wasm (not needed on Android)');
} else {
  try {
    const source = path.join(
      path.dirname(require.resolve('sql.js/dist/sql-wasm.js')),
      'sql-wasm.wasm',
    );
    await mkdir(target, { recursive: true });
    await copyFile(source, wasm);
    console.log('copied sql-wasm.wasm -> public/assets/');
  } catch (error) {
    console.warn('[copy-sql-wasm] skipped:', error.message);
    console.warn('Browser-mode SQLite will not work until sql.js is installed.');
  }
}
