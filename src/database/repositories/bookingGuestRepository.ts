/**
 * All SQL touching the `booking_guests` table — the other people sharing a
 * booking's room. No UI, no filesystem.
 */

import type { SqlDriver, SqlValue } from '../driver';
import { scalar } from '../driver';
import type { BookingGuest } from '../../types';

export interface NewBookingGuestRow {
  customer_id: number;
  name: string;
  phone: string | null;
  created_at: string;
  updated_at: string;
}

export interface BookingGuestPatch {
  name?: string;
  phone?: string | null;
  id_front_path?: string | null;
  id_back_path?: string | null;
  id_front_thumb_path?: string | null;
  id_back_thumb_path?: string | null;
  updated_at: string;
}

const COLUMNS = `
  id, customer_id, name, phone,
  id_front_path, id_back_path, id_front_thumb_path, id_back_thumb_path,
  created_at, updated_at
`;

export class BookingGuestRepository {
  constructor(private readonly db: SqlDriver) {}

  /** Oldest first, so the list order matches the order they were recorded. */
  async listByCustomer(customerId: number): Promise<BookingGuest[]> {
    return this.db.query<BookingGuest>(
      `SELECT ${COLUMNS} FROM booking_guests WHERE customer_id = ? ORDER BY id ASC`,
      [customerId],
    );
  }

  /**
   * Companions for several bookings in one query, so a report does not issue
   * one round trip per booking.
   */
  async listByCustomers(customerIds: readonly number[]): Promise<BookingGuest[]> {
    if (customerIds.length === 0) return [];
    const placeholders = customerIds.map(() => '?').join(',');
    return this.db.query<BookingGuest>(
      `SELECT ${COLUMNS} FROM booking_guests
        WHERE customer_id IN (${placeholders})
        ORDER BY customer_id ASC, id ASC`,
      [...customerIds],
    );
  }

  async findById(id: number): Promise<BookingGuest | null> {
    const rows = await this.db.query<BookingGuest>(
      `SELECT ${COLUMNS} FROM booking_guests WHERE id = ? LIMIT 1`,
      [id],
    );
    return rows[0] ?? null;
  }

  async countByCustomer(customerId: number): Promise<number> {
    return scalar<number>(
      this.db,
      'SELECT COUNT(*) AS c FROM booking_guests WHERE customer_id = ?',
      [customerId],
      0,
    );
  }

  /**
   * Inserts the row first so the generated id can name the photo folder; the
   * paths are filled in by a follow-up `update`.
   */
  async insert(row: NewBookingGuestRow): Promise<number> {
    const result = await this.db.run(
      `INSERT INTO booking_guests (customer_id, name, phone, created_at, updated_at)
       VALUES (?,?,?,?,?)`,
      [row.customer_id, row.name, row.phone, row.created_at, row.updated_at],
    );
    return result.lastId;
  }

  async update(id: number, patch: BookingGuestPatch): Promise<number> {
    const fields: string[] = [];
    const values: SqlValue[] = [];
    for (const [key, value] of Object.entries(patch)) {
      if (value === undefined) continue;
      fields.push(`${key} = ?`);
      values.push(value as SqlValue);
    }
    if (!fields.length) return 0;
    values.push(id);
    const result = await this.db.run(
      `UPDATE booking_guests SET ${fields.join(', ')} WHERE id = ?`,
      values,
    );
    return result.changes;
  }

  async delete(id: number): Promise<number> {
    const result = await this.db.run('DELETE FROM booking_guests WHERE id = ?', [id]);
    return result.changes;
  }

  /** Backup support. */
  async listAll(): Promise<BookingGuest[]> {
    return this.db.query<BookingGuest>(`SELECT ${COLUMNS} FROM booking_guests ORDER BY id ASC`);
  }

  async deleteAll(): Promise<void> {
    await this.db.run('DELETE FROM booking_guests');
  }

  /** Restore support: inserts a full row, keeping its original id. */
  async insertRaw(guest: BookingGuest): Promise<void> {
    await this.db.run(
      `INSERT INTO booking_guests (
         id, customer_id, name, phone,
         id_front_path, id_back_path, id_front_thumb_path, id_back_thumb_path,
         created_at, updated_at
       ) VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [
        // id 0/absent means "let SQLite assign one".
        Number.isInteger(guest.id) && guest.id > 0 ? guest.id : null,
        guest.customer_id,
        guest.name,
        guest.phone,
        guest.id_front_path,
        guest.id_back_path,
        guest.id_front_thumb_path,
        guest.id_back_thumb_path,
        guest.created_at,
        guest.updated_at,
      ],
    );
  }
}
