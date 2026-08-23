/** Key/value settings table access. */

import type { SqlDriver } from '../driver';

export class SettingsRepository {
  constructor(private readonly db: SqlDriver) {}

  async getAll(): Promise<Record<string, string>> {
    const rows = await this.db.query<{ key: string; value: string | null }>(
      'SELECT key, value FROM settings',
    );
    const out: Record<string, string> = {};
    for (const row of rows) out[row.key] = row.value ?? '';
    return out;
  }

  async get(key: string): Promise<string | null> {
    const rows = await this.db.query<{ value: string | null }>(
      'SELECT value FROM settings WHERE key = ? LIMIT 1',
      [key],
    );
    return rows[0]?.value ?? null;
  }

  async set(key: string, value: string): Promise<void> {
    await this.db.run(
      `INSERT INTO settings (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      [key, value],
    );
  }

  async setMany(entries: Record<string, string>): Promise<void> {
    await this.db.transaction(async () => {
      for (const [key, value] of Object.entries(entries)) {
        await this.set(key, value);
      }
    });
  }

  async remove(key: string): Promise<void> {
    await this.db.run('DELETE FROM settings WHERE key = ?', [key]);
  }
}
