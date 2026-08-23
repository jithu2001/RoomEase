/** All SQL touching the `rooms` table. */

import type { SqlDriver } from '../driver';
import { scalar } from '../driver';
import type { Room } from '../../types';

export class RoomRepository {
  constructor(private readonly db: SqlDriver) {}

  /** Natural-ish order: numeric rooms sort numerically, others alphabetically. */
  async list(): Promise<Room[]> {
    return this.db.query<Room>(
      `SELECT id, room_number, created_at FROM rooms
       ORDER BY
         CASE WHEN room_number GLOB '[0-9]*' THEN 0 ELSE 1 END,
         CAST(room_number AS INTEGER),
         room_number`,
    );
  }

  async listNumbers(): Promise<string[]> {
    const rows = await this.list();
    return rows.map((r) => r.room_number);
  }

  async exists(roomNumber: string): Promise<boolean> {
    const c = await scalar<number>(
      this.db,
      'SELECT COUNT(*) AS c FROM rooms WHERE room_number = ? COLLATE NOCASE',
      [roomNumber],
      0,
    );
    return c > 0;
  }

  async insert(roomNumber: string, createdAt: string): Promise<number> {
    const result = await this.db.run(
      'INSERT INTO rooms (room_number, created_at) VALUES (?, ?)',
      [roomNumber, createdAt],
    );
    return result.lastId;
  }

  async deleteByNumber(roomNumber: string): Promise<number> {
    const result = await this.db.run('DELETE FROM rooms WHERE room_number = ?', [roomNumber]);
    return result.changes;
  }

  async count(): Promise<number> {
    return scalar<number>(this.db, 'SELECT COUNT(*) AS c FROM rooms', [], 0);
  }

  async deleteAll(): Promise<void> {
    await this.db.run('DELETE FROM rooms');
  }
}
