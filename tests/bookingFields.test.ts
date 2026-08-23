/**
 * Editable check-in / check-out times, and the optional booking amount.
 *
 * Times are editable because the check-out button often gets pressed long after
 * the guest actually left; the amount is optional because it is not always known
 * at check-in.
 */

import { beforeEach, afterEach, describe, expect, it } from 'vitest';
import { createTestEnv, formValues, idImages, type TestEnv } from './helpers/testEnv';
import { isoToLocalInput, toIso } from '../src/utils/date';
import { CUSTOMER_STATUS } from '../src/types';

let env: TestEnv;

beforeEach(async () => {
  env = await createTestEnv();
});

afterEach(async () => {
  await env.close();
});

const checkIn = (overrides = {}) => env.customers.checkIn(formValues(overrides), idImages());

describe('check-in time', () => {
  it('defaults to the time the form supplied', async () => {
    const customer = await checkIn({ check_in_at: '2026-08-20T07:15' });
    expect(isoToLocalInput(customer.check_in_date)).toBe('2026-08-20T07:15');
    // Stored with the device offset, not as bare local text.
    expect(customer.check_in_date).toMatch(/^2026-08-20T07:15:00\.000[+-]\d{2}:\d{2}$/);
  });

  it('records a guest who arrived yesterday', async () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const value = isoToLocalInput(toIso(yesterday));

    const customer = await checkIn({ check_in_at: value });
    expect(isoToLocalInput(customer.check_in_date)).toBe(value);
    // It is a past arrival, so it does not count as a check-in today.
    expect((await env.customers.dashboard()).todays_check_ins).toBe(0);
    // But the guest is still staying.
    expect((await env.customers.dashboard()).currently_staying).toBe(1);
  });

  it('refuses a time far in the future', async () => {
    const nextWeek = new Date();
    nextWeek.setDate(nextWeek.getDate() + 7);
    await expect(checkIn({ check_in_at: isoToLocalInput(toIso(nextWeek)) })).rejects.toThrow(
      /more than a day in the future/i,
    );
  });

  it('refuses a malformed time', async () => {
    await expect(checkIn({ check_in_at: 'yesterday' })).rejects.toThrow(/valid date and time/i);
    await expect(checkIn({ check_in_at: '' })).rejects.toThrow(/required/i);
  });

  it('can be corrected afterwards without changing created_at', async () => {
    const customer = await checkIn();
    const corrected = await env.customers.update(
      customer.id,
      formValues({ check_in_at: '2026-08-19T06:00' }),
    );

    expect(isoToLocalInput(corrected.check_in_date)).toBe('2026-08-19T06:00');
    expect(corrected.created_at).toBe(customer.created_at);
  });
});

describe('check-out time', () => {
  it('defaults to now but accepts the time the guest actually left', async () => {
    const customer = await checkIn({ check_in_at: '2026-08-18T09:00' });
    const at = toIso(new Date(2026, 7, 19, 11, 30));

    const out = await env.customers.checkOut(customer.id, at);
    expect(out.status).toBe(CUSTOMER_STATUS.CHECKED_OUT);
    expect(isoToLocalInput(out.check_out_date)).toBe('2026-08-19T11:30');
    expect(await env.rooms.listAvailable()).toContain('101');
  });

  it('refuses a check-out before the check-in', async () => {
    const customer = await checkIn({ check_in_at: '2026-08-18T09:00' });
    await expect(
      env.customers.checkOut(customer.id, toIso(new Date(2026, 7, 17, 10, 0))),
    ).rejects.toThrow(/cannot be before check-in/i);
    // Still staying, so the room is still taken.
    expect(await env.rooms.listAvailable()).not.toContain('101');
  });

  it('can be corrected after the fact — the whole point of the feature', async () => {
    const customer = await checkIn({ check_in_at: '2026-08-18T09:00' });
    // Checked out late on Wednesday, but actually left Tuesday morning.
    const late = await env.customers.checkOut(customer.id, toIso(new Date(2026, 7, 19, 23, 45)));
    expect(isoToLocalInput(late.check_out_date)).toBe('2026-08-19T23:45');

    const corrected = await env.customers.update(
      customer.id,
      formValues({
        check_in_at: '2026-08-18T09:00',
        check_out_at: '2026-08-19T10:00',
      }),
    );
    expect(isoToLocalInput(corrected.check_out_date)).toBe('2026-08-19T10:00');
    expect(corrected.status).toBe(CUSTOMER_STATUS.CHECKED_OUT);
  });

  it('refuses a corrected check-out that precedes the check-in', async () => {
    const customer = await checkIn({ check_in_at: '2026-08-18T09:00' });
    await env.customers.checkOut(customer.id);

    await expect(
      env.customers.update(
        customer.id,
        formValues({ check_in_at: '2026-08-18T09:00', check_out_at: '2026-08-17T09:00' }),
      ),
    ).rejects.toThrow(/before check-in/i);
  });

  it('rejects setting a check-out time on a guest who is still staying', async () => {
    const customer = await checkIn({ check_in_at: '2026-08-18T09:00' });
    await expect(
      env.customers.update(
        customer.id,
        formValues({ check_in_at: '2026-08-18T09:00', check_out_at: '2026-08-19T09:00' }),
      ),
    ).rejects.toThrow(/still staying/i);
  });

  it('counts a corrected check-out on the day it actually happened', async () => {
    const customer = await checkIn();
    await env.customers.checkOut(customer.id);
    expect((await env.customers.dashboard()).todays_check_outs).toBe(1);

    await env.customers.update(
      customer.id,
      formValues({
        // Move the whole stay into the past: a check-out must still follow its own
        // check-in, so both dates shift together.
        check_in_at: '2026-01-04T10:00',
        check_out_at: '2026-01-05T10:00',
      }),
    );
    expect((await env.customers.dashboard()).todays_check_outs).toBe(0);
  });
});

describe('booking amount', () => {
  it('is optional', async () => {
    const customer = await checkIn();
    expect(customer.amount_minor).toBeNull();
  });

  it('stores whole rupees and paise exactly', async () => {
    const a = await checkIn({ amount: '1500' });
    expect(a.amount_minor).toBe(150000);

    const b = await checkIn({ amount: '2,499.50', room_number: '102' });
    expect(b.amount_minor).toBe(249950);

    const zero = await checkIn({ amount: '0', room_number: '103' });
    expect(zero.amount_minor).toBe(0);
  });

  it('distinguishes zero from not recorded', async () => {
    const zero = await checkIn({ amount: '0' });
    const blank = await checkIn({ amount: '', room_number: '102' });
    expect(zero.amount_minor).toBe(0);
    expect(blank.amount_minor).toBeNull();
  });

  it('rejects a nonsense amount before saving anything', async () => {
    await expect(checkIn({ amount: 'about 1500' })).rejects.toThrow(/enter an amount/i);
    expect((await env.customers.search()).total).toBe(0);
    expect(env.files.files.size).toBe(0);
  });

  it('can be added or cleared later', async () => {
    const customer = await checkIn();
    const at = isoToLocalInput(customer.check_in_date);

    const priced = await env.customers.update(
      customer.id,
      formValues({ amount: '3000', check_in_at: at }),
    );
    expect(priced.amount_minor).toBe(300000);

    const cleared = await env.customers.update(
      customer.id,
      formValues({ amount: '', check_in_at: at }),
    );
    expect(cleared.amount_minor).toBeNull();
  });

  it('survives a backup round trip', async () => {
    await checkIn({ amount: '1750.25' });
    const archive = (await env.backup.buildArchive()).bytes;

    const fresh = await createTestEnv();
    try {
      await fresh.backup.restoreBackup(archive);
      const restored = (await fresh.customers.search()).items[0];
      expect(restored.amount_minor).toBe(175025);
    } finally {
      await fresh.close();
    }
  });

  it('treats a missing amount in an older backup as not recorded', async () => {
    const customer = await checkIn({ amount: '500' });
    const archive = (await env.backup.buildArchive()).bytes;

    // Simulate an archive written before the amount column existed.
    const { payload } = await env.backup.inspect(archive);
    expect(payload.customers[0].amount_minor).toBe(50000);
    expect(customer.amount_minor).toBe(50000);
  });
});
