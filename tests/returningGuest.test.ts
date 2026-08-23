/**
 * Returning-guest check-in.
 *
 * The point of the feature is that a repeat visitor's details are never taken
 * twice. The safety property that matters most: each booking owns its own copy
 * of the ID photos, so deleting an old stay can never strip the ID proof from a
 * later one.
 */

import { beforeEach, afterEach, describe, expect, it } from 'vitest';
import { createTestEnv, fakeImage, formValues, idImages, type TestEnv } from './helpers/testEnv';
import { isoToLocalInput } from '../src/utils/date';

let env: TestEnv;

beforeEach(async () => {
  env = await createTestEnv();
});

afterEach(async () => {
  await env.close();
});

/** A guest with one completed stay, ready to come back. */
async function firstStay(overrides = {}) {
  const customer = await env.customers.checkIn(formValues(overrides), idImages());
  await env.customers.checkOut(customer.id);
  return customer;
}

describe('finding a returning guest', () => {
  it('finds a previous guest by phone number', async () => {
    await firstStay();
    const matches = await env.customers.findReturningGuests('9847012345');

    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({
      name: 'Anoob Suresh',
      phone: '9847012345',
      stay_count: 1,
      has_id_photos: true,
    });
  });

  it('matches a partial phone number and a name', async () => {
    await firstStay();
    expect(await env.customers.findReturningGuests('98470')).toHaveLength(1);
    expect(await env.customers.findReturningGuests('anoob')).toHaveLength(1);
    expect(await env.customers.findReturningGuests('SURESH')).toHaveLength(1);
  });

  it('ignores a term too short to be a real search', async () => {
    await firstStay();
    expect(await env.customers.findReturningGuests('98')).toEqual([]);
    expect(await env.customers.findReturningGuests('  ')).toEqual([]);
  });

  it('returns nothing for an unknown number', async () => {
    await firstStay();
    expect(await env.customers.findReturningGuests('9000000000')).toEqual([]);
  });

  it('shows a repeat visitor once, with their latest details', async () => {
    await firstStay();
    // Second stay, same phone, updated name and address.
    const second = await env.customers.checkIn(
      formValues({ name: 'Anoob S George', address: 'New House, Kochi', room_number: '102' }),
      idImages(),
    );
    await env.customers.checkOut(second.id);

    const matches = await env.customers.findReturningGuests('9847012345');
    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({
      customer_id: second.id,
      name: 'Anoob S George',
      address: 'New House, Kochi',
      stay_count: 2,
    });
  });

  it('reports when the saved ID photos have gone missing', async () => {
    const customer = await firstStay();
    await env.files.remove(customer.id_front_path);

    const matches = await env.customers.findReturningGuests('9847012345');
    expect(matches[0].has_id_photos).toBe(false);
  });

  it('lists different guests newest-stay first', async () => {
    await firstStay({ name: 'Older Guest', phone: '9800000001' });
    await firstStay({ name: 'Newer Guest', phone: '9800000002', room_number: '102' });

    const matches = await env.customers.findReturningGuests('980000000');
    expect(matches.map((m) => m.name)).toEqual(['Newer Guest', 'Older Guest']);
  });
});

describe('checking in a returning guest', () => {
  it('reuses the details and copies the ID photos into the new booking', async () => {
    const previous = await firstStay();

    const repeat = await env.customers.checkIn(
      formValues({ room_number: '102', number_of_persons: 3 }),
      { reuseFromCustomerId: previous.id },
    );

    expect(repeat.customer_code).toBe('CUS-000002');
    expect(repeat.name).toBe(previous.name);
    expect(repeat.address).toBe(previous.address);
    expect(repeat.phone).toBe(previous.phone);
    expect(repeat.number_of_persons).toBe(3);
    expect(repeat.room_number).toBe('102');

    // Its own files, not the previous booking's.
    expect(repeat.id_front_path).toBe('hotel-data/customers/CUS-000002/id-front.jpg');
    expect(repeat.id_front_path).not.toBe(previous.id_front_path);
    expect(await env.files.exists(repeat.id_front_path)).toBe(true);
    expect(await env.files.exists(repeat.id_back_path)).toBe(true);
    expect(await env.files.exists(repeat.id_front_thumb_path!)).toBe(true);

    // Same image content as the original.
    expect(await env.files.read(repeat.id_front_path)).toEqual(
      await env.files.read(previous.id_front_path),
    );
  });

  it('keeps the new photos when the old stay is deleted', async () => {
    const previous = await firstStay();
    const repeat = await env.customers.checkIn(formValues({ room_number: '102' }), {
      reuseFromCustomerId: previous.id,
    });

    await env.customers.remove(previous.id);

    expect(await env.customers.find(repeat.id)).not.toBeNull();
    expect(await env.files.exists(repeat.id_front_path)).toBe(true);
    expect(await env.files.exists(repeat.id_back_path)).toBe(true);
    expect(await env.files.exists(previous.id_front_path)).toBe(false);
  });

  it('lets a fresh photo override the copied one', async () => {
    const previous = await firstStay();
    const newFront = fakeImage('updated-front');

    const repeat = await env.customers.checkIn(formValues({ room_number: '102' }), {
      reuseFromCustomerId: previous.id,
      front: newFront,
    });

    expect(await env.files.read(repeat.id_front_path)).toEqual(newFront.full);
    // The back was still copied from the previous stay.
    expect(await env.files.read(repeat.id_back_path)).toEqual(
      await env.files.read(previous.id_back_path),
    );
  });

  it('refuses the reuse when the source photos are gone, leaving nothing behind', async () => {
    const previous = await firstStay();
    await env.files.remove(previous.id_front_path);
    const filesBefore = env.files.files.size;

    await expect(
      env.customers.checkIn(formValues({ room_number: '102' }), {
        reuseFromCustomerId: previous.id,
      }),
    ).rejects.toMatchObject({ code: 'MISSING_FILE' });

    // No half-created record, no stray files.
    expect((await env.customers.search()).total).toBe(1);
    expect(env.files.files.size).toBe(filesBefore);
  });

  it('still requires photos when there is nothing to reuse', async () => {
    await expect(env.customers.checkIn(formValues(), {})).rejects.toThrow(/ID proof front/i);
    expect((await env.customers.search()).total).toBe(0);
  });

  it('counts as a separate stay in history and occupancy', async () => {
    const previous = await firstStay();
    await env.customers.checkIn(formValues({ room_number: '102' }), {
      reuseFromCustomerId: previous.id,
    });

    expect((await env.customers.search()).total).toBe(2);
    expect(await env.rooms.listAvailable()).not.toContain('102');
    // The old stay is still checked out, so its room stayed free.
    expect(await env.rooms.listAvailable()).toContain('101');
  });

  it('can reuse details from a guest who is still checked in', async () => {
    const staying = await env.customers.checkIn(formValues(), idImages());
    const second = await env.customers.checkIn(formValues({ room_number: '102' }), {
      reuseFromCustomerId: staying.id,
    });
    expect(second.name).toBe(staying.name);
    expect((await env.customers.search({ filter: 'CHECKED_IN' })).total).toBe(2);
  });

  it('keeps the check-in time the form supplied', async () => {
    const previous = await firstStay();
    const when = '2026-08-20T07:15';
    const repeat = await env.customers.checkIn(
      formValues({ room_number: '102', check_in_at: when }),
      { reuseFromCustomerId: previous.id },
    );
    expect(isoToLocalInput(repeat.check_in_date)).toBe(when);
  });
});
