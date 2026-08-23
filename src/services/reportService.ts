/**
 * Guest report for a single date.
 *
 * Assembles exactly what the printed document shows and nothing more. In
 * particular it **omits the amount**: this report is a guest register, and the
 * money side of a booking has no business being handed to whoever asks for it.
 * `stripPaymentInfo` enforces that at the type *and* the value level, so adding
 * a column to `customers` later cannot quietly leak it into the report.
 */

import { dayKeyOf, formatDate, toIso } from '../utils/date';
import { AppError } from '../utils/errors';
import type { BookingGuest, Customer } from '../types';
import type { BookingGuestRepository } from '../database/repositories/bookingGuestRepository';
import type { CustomerRepository } from '../database/repositories/customerRepository';
import type { SettingsService } from './settingsService';

/** A booking as it appears on the report: no payment fields, by construction. */
export interface ReportBooking {
  customer_code: string;
  name: string;
  address: string;
  phone: string;
  room_number: string;
  number_of_persons: number;
  check_in_date: string;
  check_out_date: string | null;
  id_front_path: string;
  id_back_path: string;
  id_front_thumb_path: string | null;
  id_back_thumb_path: string | null;
  /** Whether this booking was still open at the end of the reported day. */
  still_staying_on_date: boolean;
  arrived_on_date: boolean;
  departed_on_date: boolean;
  guests: ReportGuest[];
}

export interface ReportGuest {
  name: string;
  phone: string | null;
  id_front_path: string | null;
  id_back_path: string | null;
  id_front_thumb_path: string | null;
  id_back_thumb_path: string | null;
}

export interface DayReport {
  /** The reported local day, YYYY-MM-DD. */
  day: string;
  /** `23 Aug 2026`, ready to print. */
  day_label: string;
  hotel_name: string;
  hotel_address: string;
  hotel_phone: string;
  generated_at: string;
  bookings: ReportBooking[];
  totals: {
    bookings: number;
    /** Primary guests plus recorded companions. */
    people: number;
    arrivals: number;
    departures: number;
    rooms: number;
  };
}

const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** `2026-08-23` -> local midnight on that date, for display only. */
function dayToLocalDate(day: string): Date {
  const [year, month, date] = day.split('-').map(Number);
  return new Date(year, month - 1, date);
}

/**
 * Copies only the fields the report is allowed to show.
 *
 * Written as an explicit whitelist rather than `delete row.amount_minor`, so a
 * future column is excluded by default instead of included by accident.
 */
export function stripPaymentInfo(
  customer: Customer,
  day: string,
  guests: BookingGuest[],
): ReportBooking {
  const checkOutDay = dayKeyOf(customer.check_out_date);
  return {
    customer_code: customer.customer_code,
    name: customer.name,
    address: customer.address,
    phone: customer.phone,
    room_number: customer.room_number,
    number_of_persons: customer.number_of_persons,
    check_in_date: customer.check_in_date,
    check_out_date: customer.check_out_date,
    id_front_path: customer.id_front_path,
    id_back_path: customer.id_back_path,
    id_front_thumb_path: customer.id_front_thumb_path,
    id_back_thumb_path: customer.id_back_thumb_path,
    arrived_on_date: dayKeyOf(customer.check_in_date) === day,
    departed_on_date: checkOutDay === day,
    still_staying_on_date: customer.check_out_date === null || checkOutDay > day,
    guests: guests.map((guest) => ({
      name: guest.name,
      phone: guest.phone,
      id_front_path: guest.id_front_path,
      id_back_path: guest.id_back_path,
      id_front_thumb_path: guest.id_front_thumb_path,
      id_back_thumb_path: guest.id_back_thumb_path,
    })),
  };
}

export class ReportService {
  constructor(
    private readonly customers: CustomerRepository,
    private readonly guests: BookingGuestRepository,
    private readonly settings: SettingsService,
  ) {}

  /**
   * Everyone whose stay covered `day` (YYYY-MM-DD), with their companions.
   */
  async buildDayReport(day: string, now: Date = new Date()): Promise<DayReport> {
    if (!DAY_PATTERN.test(day)) {
      throw new AppError('VALIDATION', 'Please choose a valid date for the report.');
    }

    const [rows, hotel] = await Promise.all([
      this.customers.listStayingOn(day),
      this.settings.get(),
    ]);

    // One query for every booking's companions rather than one per booking.
    const guestRows = await this.guests.listByCustomers(rows.map((r) => r.id));
    const guestsByCustomer = new Map<number, BookingGuest[]>();
    for (const guest of guestRows) {
      const list = guestsByCustomer.get(guest.customer_id);
      if (list) list.push(guest);
      else guestsByCustomer.set(guest.customer_id, [guest]);
    }

    const bookings = rows.map((row) =>
      stripPaymentInfo(row, day, guestsByCustomer.get(row.id) ?? []),
    );

    return {
      day,
      // Built from the parts as a LOCAL date: labelling via a UTC instant
      // would name the wrong day in far-eastern time zones.
      day_label: formatDate(toIso(dayToLocalDate(day))),
      hotel_name: hotel.hotel_name,
      hotel_address: hotel.hotel_address,
      hotel_phone: hotel.hotel_phone,
      generated_at: toIso(now),
      bookings,
      totals: {
        bookings: bookings.length,
        // The booked person count is the real headcount; recorded companions
        // are a subset of it, so counting both would double-count.
        people: bookings.reduce((sum, b) => sum + b.number_of_persons, 0),
        arrivals: bookings.filter((b) => b.arrived_on_date).length,
        departures: bookings.filter((b) => b.departed_on_date).length,
        rooms: new Set(bookings.map((b) => b.room_number)).size,
      },
    };
  }
}
