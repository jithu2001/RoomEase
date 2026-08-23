/**
 * Developer utility: dump a SQLite file pulled off a device.
 *
 *   adb exec-out run-as com.trinity.hotelmanager cat databases/hotelmanagerSQLite.db > device.db
 *   node scripts/inspect-db.mjs device.db
 *
 * Uses sql.js (a dev dependency) so no native tooling is needed. Note the
 * output includes customer names — only run it on your own device.
 */

import initSqlJs from 'sql.js';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const require = createRequire(import.meta.url);
const wasmDir = path.dirname(require.resolve('sql.js/dist/sql-wasm.js'));
const SQL = await initSqlJs({ locateFile: (f) => path.join(wasmDir, f) });

const file = process.argv[2];
if (!file) {
  console.error('usage: node scripts/inspect-db.mjs <path-to-sqlite-file>');
  process.exit(1);
}

const db = new SQL.Database(readFileSync(file));

const dump = (label, sql) => {
  try {
    const res = db.exec(sql);
    console.log(`\n== ${label} ==`);
    if (!res[0]) return console.log('  (no rows)');
    for (const row of res[0].values) console.log('  ' + row.map((v) => String(v)).join(' | '));
  } catch (e) {
    console.log(`\n== ${label} == ERROR: ${e.message}`);
  }
};

dump('user_version', 'PRAGMA user_version');
dump('rooms', 'SELECT id, room_number FROM rooms ORDER BY id');
dump('settings keys', 'SELECT key FROM settings ORDER BY key');
dump('customer count', 'SELECT COUNT(*) AS c FROM customers');
dump('schema objects', 'SELECT type, name FROM sqlite_master ORDER BY type, name');
dump('customers columns', 'PRAGMA table_info(customers)');
dump('sqlite_sequence', 'SELECT * FROM sqlite_sequence');
