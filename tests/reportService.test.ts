/**
 * Guest report for a single date.
 *
 * Two things carry the most risk and get the most attention here:
 *  - the date window: "staying on this date" is inclusive at both ends, which is
 *    easy to get subtly wrong
 *  - the amount must never reach the report, whatever is added to the schema
 *    later
 */

import { beforeEach, afterEach, describe, expect, it } from 'vitest';
import { createTestEnv, fakeImage, formValues, idImages, type TestEnv } from './helpers/testEnv';
import { stripPaymentInfo } from '../src/services/reportService';
import { isoToLocalInput, toIso } from '../src/utils/date';
import { CUSTOMER_STATUS } from '../src/types';

let env: TestEnv;

beforeEach(async () => {
  env = await createTestEnv();
});

afterEach(async () => {
  await env.close();
});

/** Books a stay with explicit arrival/departure days. */
async function stay(options: {
  name: string;
  room: string;
  from: string;
  to?: string;
  persons?: number;
  amount?: string;
  phone?: string;
}) {
  const customer = await env.customers.checkIn(
    formValues({
      name: options.name,
      phone: options.phone ?? '9847012345',
      room_number: options.room,
      number_of_persons: options.persons ?? 1,
      amount: options.amount ?? '',
      check_in_at: `${options.from}T10:00`,
    }),
    idImages(),
  );
  if (options.to) {
    await env.customers.checkOut(customer.id, toIso(new Date(`${options.to}T11:00`)));
  }
  return customer;
}

describe('which guests appear on a date', () => {
  it('includes a guest who arrived that day', async () => {
    await stay({ name: 'Arrived Today', room: '101', from: '2026-08-20' });
    const report = await env.reports.buildDayReport('2026-08-20');

    expect(report.bookings).toHaveLength(1);
    expect(report.bookings[0]).toMatchObject({
      name: 'Arrived Today',
      arrived_on_date: true,
      departed_on_date: false,
      still_staying_on_date: true,
    });
  });

  it('includes a guest who arrived earlier and had not left', async () => {
    await stay({ name: 'Long Stay', room: '101', from: '2026-08-18', to: '2026-08-22' });

    for (const day of ['2026-08-18', '2026-08-19', '2026-08-20', '2026-08-21', '2026-08-22']) {
      const report = await env.reports.buildDayReport(day);
      expect(report.bookings).toHaveLength(1);
    }
  });

  it('includes the day of departure but not the day after', async () => {
    await stay({ name: 'Left Friday', room: '101', from: '2026-08-19', to: '2026-08-21' });

    expect((await env.reports.buildDayReport('2026-08-21')).bookings).toHaveLength(1);
    expect((await env.reports.buildDayReport('2026-08-22')).bookings).toEqual([]);
  });

  it('excludes the day before arrival', async () => {
    await stay({ name: 'Arrives Later', room: '101', from: '2026-08-20' });
    expect((await env.reports.buildDayReport('2026-08-19')).bookings).toEqual([]);
  });

  it('marks arrivals and departures on the reported day', async () => {
    await stay({ name: 'Departing', room: '101', from: '2026-08-18', to: '2026-08-20' });
    await stay({ name: 'Arriving', room: '102', from: '2026-08-20' });

    const report = await env.reports.buildDayReport('2026-08-20');
    expect(report.totals).toMatchObject({ bookings: 2, arrivals: 1, departures: 1, rooms: 2 });

    const departing = report.bookings.find((b) => b.name === 'Departing')!;
    expect(departing).toMatchObject({
      arrived_on_date: false,
      departed_on_date: true,
      still_staying_on_date: false,
    });
  });

  it('orders the register by room number', async () => {
    await stay({ name: 'Third', room: '203', from: '2026-08-20' });
    await stay({ name: 'First', room: '101', from: '2026-08-20' });
    await stay({ name: 'Second', room: '105', from: '2026-08-20' });

    const report = await env.reports.buildDayReport('2026-08-20');
    expect(report.bookings.map((b) => b.room_number)).toEqual(['101', '105', '203']);
  });

  it('counts the booked headcount, not just primary guests', async () => {
    await stay({ name: 'Family', room: '101', from: '2026-08-20', persons: 4 });
    await stay({ name: 'Solo', room: '102', from: '2026-08-20', persons: 1 });

    const report = await env.reports.buildDayReport('2026-08-20');
    expect(report.totals.people).toBe(5);
  });

  it('returns an empty report rather than failing for a quiet day', async () => {
    const report = await env.reports.buildDayReport('2026-08-20');
    expect(report.bookings).toEqual([]);
    expect(report.totals).toMatchObject({ bookings: 0, people: 0, rooms: 0 });
    expect(report.day_label).toBe('20 Aug 2026');
  });

  it('rejects a malformed date', async () => {
    await expect(env.reports.buildDayReport('20-08-2026')).rejects.toThrow(/valid date/i);
    await expect(env.reports.buildDayReport('')).rejects.toThrow(/valid date/i);
  });
});

describe('what the report contains', () => {
  it('carries every field the register needs', async () => {
    await stay({
      name: 'Anoob Suresh',
      room: '101',
      from: '2026-08-20',
      persons: 2,
      phone: '9360008924',
    });

    const report = await env.reports.buildDayReport('2026-08-20');
    const booking = report.bookings[0];

    expect(booking.customer_code).toBe('CUS-000001');
    expect(booking.name).toBe('Anoob Suresh');
    expect(booking.address).toBeTruthy();
    expect(booking.phone).toBe('9360008924');
    expect(booking.room_number).toBe('101');
    expect(booking.number_of_persons).toBe(2);
    expect(isoToLocalInput(booking.check_in_date)).toBe('2026-08-20T10:00');
    expect(booking.id_front_path).toBeTruthy();
    expect(booking.id_back_path).toBeTruthy();
  });

  it('includes the hotel details for the letterhead', async () => {
    await env.settings.saveHotelInfo({
      hotel_name: 'Trinity Stays',
      hotel_address: 'Fort Kochi',
      hotel_phone: '04842222333',
    });
    await stay({ name: 'Guest', room: '101', from: '2026-08-20' });

    const report = await env.reports.buildDayReport('2026-08-20');
    expect(report).toMatchObject({
      hotel_name: 'Trinity Stays',
      hotel_address: 'Fort Kochi',
      hotel_phone: '04842222333',
      day_label: '20 Aug 2026',
    });
    expect(report.generated_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('includes additional guests with their own ID photos', async () => {
    const booking = await stay({ name: 'Primary', room: '101', from: '2026-08-20', persons: 3 });
    await env.guests.add(
      booking.id,
      { name: 'Companion With ID', phone: '9000011111' },
      { front: fakeImage('g-front'), back: fakeImage('g-back') },
    );
    await env.guests.add(booking.id, { name: 'Companion Without ID', phone: '' });

    const report = await env.reports.buildDayReport('2026-08-20');
    const guests = report.bookings[0].guests;

    expect(guests).toHaveLength(2);
    expect(guests[0]).toMatchObject({ name: 'Companion With ID', phone: '9000011111' });
    expect(guests[0].id_front_path).toBeTruthy();
    expect(guests[1]).toMatchObject({ name: 'Companion Without ID', phone: null });
    expect(guests[1].id_front_path).toBeNull();
  });

  it('fetches companions for many bookings without dropping any', async () => {
    const a = await stay({ name: 'Booking Alpha', room: '101', from: '2026-08-20', persons: 2 });
    const b = await stay({ name: 'Booking Beta', room: '102', from: '2026-08-20', persons: 2 });
    await env.guests.add(a.id, { name: 'A Companion', phone: '' });
    await env.guests.add(b.id, { name: 'B Companion', phone: '' });

    const report = await env.reports.buildDayReport('2026-08-20');
    expect(report.bookings.map((x) => x.guests.map((g) => g.name))).toEqual([
      ['A Companion'],
      ['B Companion'],
    ]);
  });

  it('shows a still-staying guest as having no check-out', async () => {
    await stay({ name: 'Staying', room: '101', from: '2026-08-20' });
    const report = await env.reports.buildDayReport('2026-08-20');
    expect(report.bookings[0].check_out_date).toBeNull();
  });
});

describe('payment information never reaches the report', () => {
  it('omits the amount even when one was collected', async () => {
    await stay({ name: 'Paid Guest', room: '101', from: '2026-08-20', amount: '2500' });

    // The booking really does have an amount stored.
    const stored = (await env.customers.search()).items[0];
    expect(stored.amount_minor).toBe(250000);

    const report = await env.reports.buildDayReport('2026-08-20');
    const booking = report.bookings[0];

    expect(Object.keys(booking)).not.toContain('amount_minor');
    // Nothing anywhere in the serialised report mentions the amount or its value.
    const serialised = JSON.stringify(report);
    expect(serialised).not.toContain('amount');
    expect(serialised).not.toContain('250000');
    expect(serialised).not.toContain('2500');
  });

  it('copies only whitelisted fields, so a future column is excluded by default', () => {
    const customer = {
      id: 1,
      customer_code: 'CUS-000001',
      name: 'Guest',
      address: 'Somewhere',
      phone: '9847012345',
      room_number: '101',
      number_of_persons: 1,
      id_front_path: 'f',
      id_back_path: 'b',
      id_front_thumb_path: 'ft',
      id_back_thumb_path: 'bt',
      check_in_date: '2026-08-20T10:00:00.000+05:30',
      check_out_date: null,
      status: CUSTOMER_STATUS.CHECKED_IN,
      created_at: 'c',
      updated_at: 'u',
      amount_minor: 999999,
      // Pretend a later migration added something sensitive.
      card_last_four: '4242',
    } as unknown as Parameters<typeof stripPaymentInfo>[0];

    const booking = stripPaymentInfo(customer, '2026-08-20', []);
    const serialised = JSON.stringify(booking);

    expect(serialised).not.toContain('999999');
    expect(serialised).not.toContain('4242');
    expect(serialised).not.toContain('card_last_four');
    // But the register fields did come through.
    expect(booking.name).toBe('Guest');
    expect(booking.room_number).toBe('101');
  });
});
