/**
 * All SQL touching the `customers` table. No UI, no filesystem.
 */

import type { SqlDriver, SqlValue } from '../driver';
import { scalar } from '../driver';
import {
  CUSTOMER_STATUS,
  type Customer,
  type CustomerQuery,
  type CustomerStatus,
  type GuestMatch,
} from '../../types';

export interface NewCustomerRow {
  customer_code: string;
  name: string;
  address: string;
  phone: string;
  room_number: string;
  number_of_persons: number;
  id_front_path: string;
  id_back_path: string;
  id_front_thumb_path: string | null;
  id_back_thumb_path: string | null;
  check_in_date: string;
  status: CustomerStatus;
  created_at: string;
  updated_at: string;
  amount_minor: number | null;
}

export interface CustomerPatch {
  name?: string;
  address?: string;
  phone?: string;
  room_number?: string;
  number_of_persons?: number;
  id_front_path?: string;
  id_back_path?: string;
  id_front_thumb_path?: string | null;
  id_back_thumb_path?: string | null;
  amount_minor?: number | null;
  /** Correcting a mistyped or late-recorded arrival. */
  check_in_date?: string;
  /** Correcting a check-out that was recorded at the wrong time. */
  check_out_date?: string;
  updated_at: string;
}

const COLUMNS = `
  id, customer_code, name, address, phone, room_number, number_of_persons,
  id_front_path, id_back_path, id_front_thumb_path, id_back_thumb_path,
  check_in_date, check_out_date, status, created_at, updated_at, amount_minor
`;

/** Escapes LIKE wildcards so a search for "50%" does not match everything. */
export function escapeLike(term: string): string {
  return term.replace(/[\\%_]/g, (c) => `\\${c}`);
}

interface WhereClause {
  sql: string;
  values: SqlValue[];
}

export function buildCustomerWhere(query: CustomerQuery): WhereClause {
  const conditions: string[] = [];
  const values: SqlValue[] = [];

  const filter = query.filter ?? 'ALL';
  if (filter !== 'ALL') {
    conditions.push('status = ?');
    values.push(filter);
  }

  const search = (query.search ?? '').trim();
  if (search) {
    const like = `%${escapeLike(search)}%`;
    // The EXISTS clause lets a companion's name find the booking they stayed
    // on — the main reason for recording those details at all. It is last in
    // the OR chain so the cheap column comparisons short-circuit first.
    conditions.push(
      `(name LIKE ? ESCAPE '\\'
        OR phone LIKE ? ESCAPE '\\'
        OR room_number LIKE ? ESCAPE '\\'
        OR customer_code LIKE ? ESCAPE '\\'
        OR EXISTS (
             SELECT 1 FROM booking_guests g
              WHERE g.customer_id = customers.id
                AND g.name LIKE ? ESCAPE '\\'
           ))`,
    );
    values.push(like, like, like, like, like);
  }

  return {
    sql: conditions.length ? `WHERE ${conditions.join(' AND ')}` : '',
    values,
  };
}

export class CustomerRepository {
  constructor(private readonly db: SqlDriver) {}

  async insert(row: NewCustomerRow): Promise<number> {
    const result = await this.db.run(
      `INSERT INTO customers (
         customer_code, name, address, phone, room_number, number_of_persons,
         id_front_path, id_back_path, id_front_thumb_path, id_back_thumb_path,
         check_in_date, check_out_date, status, created_at, updated_at, amount_minor
       ) VALUES (?,?,?,?,?,?,?,?,?,?,?,NULL,?,?,?,?)`,
      [
        row.customer_code,
        row.name,
        row.address,
        row.phone,
        row.room_number,
        row.number_of_persons,
        row.id_front_path,
        row.id_back_path,
        row.id_front_thumb_path,
        row.id_back_thumb_path,
        row.check_in_date,
        row.status,
        row.created_at,
        row.updated_at,
        row.amount_minor,
      ],
    );
    return result.lastId;
  }

  async findById(id: number): Promise<Customer | null> {
    const rows = await this.db.query<Customer>(
      `SELECT ${COLUMNS} FROM customers WHERE id = ? LIMIT 1`,
      [id],
    );
    return rows[0] ?? null;
  }

  /** Newest check-in first. */
  async list(query: CustomerQuery = {}): Promise<Customer[]> {
    const where = buildCustomerWhere(query);
    const limit = query.limit ?? 50;
    const offset = query.offset ?? 0;
    return this.db.query<Customer>(
      `SELECT ${COLUMNS} FROM customers
       ${where.sql}
       ORDER BY check_in_date DESC, id DESC
       LIMIT ? OFFSET ?`,
      [...where.values, limit, offset],
    );
  }

  async count(query: CustomerQuery = {}): Promise<number> {
    const where = buildCustomerWhere(query);
    return scalar<number>(
      this.db,
      `SELECT COUNT(*) AS c FROM customers ${where.sql}`,
      where.values,
      0,
    );
  }

  async listAll(): Promise<Customer[]> {
    return this.db.query<Customer>(`SELECT ${COLUMNS} FROM customers ORDER BY id ASC`);
  }

  async update(id: number, patch: CustomerPatch): Promise<number> {
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
      `UPDATE customers SET ${fields.join(', ')} WHERE id = ?`,
      values,
    );
    return result.changes;
  }

  async checkOut(id: number, checkOutDate: string): Promise<number> {
    const result = await this.db.run(
      `UPDATE customers
         SET status = ?, check_out_date = ?, updated_at = ?
       WHERE id = ? AND status = ?`,
      [CUSTOMER_STATUS.CHECKED_OUT, checkOutDate, checkOutDate, id, CUSTOMER_STATUS.CHECKED_IN],
    );
    return result.changes;
  }

  async delete(id: number): Promise<number> {
    const result = await this.db.run('DELETE FROM customers WHERE id = ?', [id]);
    return result.changes;
  }

  /** Used by restore and "clear all data". */
  async deleteAll(): Promise<void> {
    await this.db.run('DELETE FROM customers');
  }

  async highestCustomerCode(): Promise<string | null> {
    const rows = await this.db.query<{ customer_code: string }>(
      `SELECT customer_code FROM customers
       WHERE customer_code LIKE 'CUS-%'
       ORDER BY LENGTH(customer_code) DESC, customer_code DESC
       LIMIT 1`,
    );
    return rows[0]?.customer_code ?? null;
  }

  /** The active (checked-in) guest of a room, if any. */
  async activeByRoom(roomNumber: string): Promise<Customer | null> {
    const rows = await this.db.query<Customer>(
      `SELECT ${COLUMNS} FROM customers
       WHERE room_number = ? AND status = ? LIMIT 1`,
      [roomNumber, CUSTOMER_STATUS.CHECKED_IN],
    );
    return rows[0] ?? null;
  }

  async listActive(): Promise<Customer[]> {
    return this.db.query<Customer>(
      `SELECT ${COLUMNS} FROM customers
       WHERE status = ?
       ORDER BY check_in_date DESC, id DESC`,
      [CUSTOMER_STATUS.CHECKED_IN],
    );
  }

  async countActive(): Promise<number> {
    return scalar<number>(
      this.db,
      'SELECT COUNT(*) AS c FROM customers WHERE status = ?',
      [CUSTOMER_STATUS.CHECKED_IN],
      0,
    );
  }

  async sumActivePersons(): Promise<number> {
    return scalar<number>(
      this.db,
      'SELECT COALESCE(SUM(number_of_persons), 0) AS c FROM customers WHERE status = ?',
      [CUSTOMER_STATUS.CHECKED_IN],
      0,
    );
  }

  /**
   * Counts records whose check-in falls on `dayKey` (YYYY-MM-DD). Stored
   * timestamps are local time, so a prefix comparison is the local day.
   */
  async countCheckInsOn(dayKey: string): Promise<number> {
    return scalar<number>(
      this.db,
      'SELECT COUNT(*) AS c FROM customers WHERE substr(check_in_date, 1, 10) = ?',
      [dayKey],
      0,
    );
  }

  async countCheckOutsOn(dayKey: string): Promise<number> {
    return scalar<number>(
      this.db,
      `SELECT COUNT(*) AS c FROM customers
       WHERE check_out_date IS NOT NULL AND substr(check_out_date, 1, 10) = ?`,
      [dayKey],
      0,
    );
  }

  /**
   * Every booking whose stay covered `dayKey` (YYYY-MM-DD): checked in on or
   * before that day, and not checked out before it. A guest who left *during*
   * the day was still present, so the comparison is inclusive at both ends.
   *
   * Stored timestamps are local time, so the 10-character prefix is the local
   * calendar day. Ordered like a register: by room, then arrival.
   */
  async listStayingOn(dayKey: string): Promise<Customer[]> {
    return this.db.query<Customer>(
      `SELECT ${COLUMNS} FROM customers
        WHERE substr(check_in_date, 1, 10) <= ?
          AND (check_out_date IS NULL OR substr(check_out_date, 1, 10) >= ?)
        ORDER BY
          CASE WHEN room_number GLOB '[0-9]*' THEN 0 ELSE 1 END,
          CAST(room_number AS INTEGER),
          room_number,
          check_in_date`,
      [dayKey, dayKey],
    );
  }

  /** room_number -> active guest, for the room status board. */
  async occupancyMap(): Promise<Map<string, { customer_code: string; name: string }>> {
    const rows = await this.db.query<{ room_number: string; customer_code: string; name: string }>(
      `SELECT room_number, customer_code, name FROM customers WHERE status = ?`,
      [CUSTOMER_STATUS.CHECKED_IN],
    );
    return new Map(rows.map((r) => [r.room_number, { customer_code: r.customer_code, name: r.name }]));
  }

  /** Restore support: inserts a full row, keeping its original id. */
  async insertRaw(customer: Customer): Promise<void> {
    await this.db.run(
      `INSERT INTO customers (
         id, customer_code, name, address, phone, room_number, number_of_persons,
         id_front_path, id_back_path, id_front_thumb_path, id_back_thumb_path,
         check_in_date, check_out_date, status, created_at, updated_at, amount_minor
       ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        // id 0/absent means "let SQLite assign one".
        Number.isInteger(customer.id) && customer.id > 0 ? customer.id : null,
        customer.customer_code,
        customer.name,
        customer.address,
        customer.phone,
        customer.room_number,
        customer.number_of_persons,
        customer.id_front_path,
        customer.id_back_path,
        customer.id_front_thumb_path,
        customer.id_back_thumb_path,
        customer.check_in_date,
        customer.check_out_date,
        customer.status,
        customer.created_at,
        customer.updated_at,
        customer.amount_minor,
      ],
    );
  }

  /**
   * Returning-guest lookup: one row per phone number, showing that guest's
   * MOST RECENT stay, plus how many stays that number has in total.
   *
   * ROW_NUMBER() rather than `MAX(check_in_date)` with bare columns: SQLite's
   * bare-column rule picks an *arbitrary* row when several share the maximum,
   * which happens as soon as two stays are recorded in the same minute. The
   * explicit `(check_in_date DESC, id DESC)` ordering is deterministic.
   *
   * The correlated COUNT runs only for the handful of rows that survive
   * `rn = 1`, and counts every stay for that phone number even when the search
   * term matched only one of them (a guest whose name changed between visits).
   */
  async findGuestsByPhoneOrName(term: string, limit = 8): Promise<GuestMatch[]> {
    const like = `%${escapeLike(term)}%`;
    const rows = await this.db.query<{
      customer_id: number;
      customer_code: string;
      name: string;
      address: string;
      phone: string;
      stay_count: number;
      last_stay: string;
      id_front_path: string;
      id_back_path: string;
    }>(
      `SELECT m.customer_id, m.customer_code, m.name, m.address, m.phone,
              (SELECT COUNT(*) FROM customers t WHERE t.phone = m.phone) AS stay_count,
              m.last_stay, m.id_front_path, m.id_back_path
         FROM (
           SELECT id AS customer_id, customer_code, name, address, phone,
                  check_in_date AS last_stay, id_front_path, id_back_path,
                  ROW_NUMBER() OVER (
                    PARTITION BY phone ORDER BY check_in_date DESC, id DESC
                  ) AS rn
             FROM customers
            WHERE phone LIKE ? ESCAPE '\\' OR name LIKE ? ESCAPE '\\'
         ) AS m
        WHERE m.rn = 1
        ORDER BY m.last_stay DESC, m.customer_id DESC
        LIMIT ?`,
      [like, like, limit],
    );
    return rows.map((row) => ({
      customer_id: row.customer_id,
      customer_code: row.customer_code,
      name: row.name,
      address: row.address,
      phone: row.phone,
      stay_count: row.stay_count,
      last_stay: row.last_stay,
      has_id_photos: Boolean(row.id_front_path && row.id_back_path),
    }));
  }
}
