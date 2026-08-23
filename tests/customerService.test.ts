import { beforeEach, afterEach, describe, expect, it } from 'vitest';
import { createTestEnv, fakeImage, formValues, idImages, type TestEnv } from './helpers/testEnv';
import { CUSTOMER_STATUS } from '../src/types';
import { isAppError } from '../src/utils/errors';
import { isoToLocalInput, toDayKey } from '../src/utils/date';

let env: TestEnv;

beforeEach(async () => {
  env = await createTestEnv();
});

afterEach(async () => {
  await env.close();
});

async function checkIn(overrides = {}) {
  return env.customers.checkIn(formValues(overrides), idImages());
}

describe('check-in', () => {
  it('creates a customer with a generated code and device timestamps', async () => {
    const before = new Date().getTime();
    const customer = await checkIn();

    expect(customer.customer_code).toBe('CUS-000001');
    expect(customer.status).toBe(CUSTOMER_STATUS.CHECKED_IN);
    expect(customer.check_out_date).toBeNull();
    expect(customer.check_in_date.slice(0, 10)).toBe(toDayKey());

    // created_at records when the row was written; check_in_date is the arrival
    // time from the form (minute precision), so the two are close but distinct.
    expect(new Date(customer.created_at).getTime()).toBeGreaterThanOrEqual(before - 1000);
    expect(customer.updated_at).toBe(customer.created_at);
    expect(Math.abs(new Date(customer.check_in_date).getTime() - before)).toBeLessThan(70_000);
  });

  it('numbers customers sequentially', async () => {
    const first = await checkIn();
    const second = await checkIn({ room_number: '102' });
    const third = await checkIn({ room_number: '103' });
    expect([first.customer_code, second.customer_code, third.customer_code]).toEqual([
      'CUS-000001',
      'CUS-000002',
      'CUS-000003',
    ]);
  });

  it('stores only file paths in the database and the bytes on disk', async () => {
    const customer = await checkIn();

    expect(customer.id_front_path).toBe('hotel-data/customers/CUS-000001/id-front.jpg');
    expect(customer.id_back_path).toBe('hotel-data/customers/CUS-000001/id-back.jpg');
    expect(customer.id_front_thumb_path).toBe('hotel-data/customers/CUS-000001/id-front-thumb.jpg');
    expect(await env.files.exists(customer.id_front_path)).toBe(true);
    expect(await env.files.exists(customer.id_back_path)).toBe(true);
    // No base64 payload smuggled into a column.
    for (const value of Object.values(customer)) {
      if (typeof value === 'string') expect(value.length).toBeLessThan(200);
    }
  });

  it('rejects an invalid form before writing anything', async () => {
    await expect(env.customers.checkIn(formValues({ name: '' }), idImages())).rejects.toThrow(
      /name is required/i,
    );
    expect(env.files.files.size).toBe(0);
    expect(await env.customers.search()).toMatchObject({ total: 0 });
  });

  it('refuses a room that is not configured', async () => {
    await expect(checkIn({ room_number: '999' })).rejects.toMatchObject({
      code: 'ROOM_UNKNOWN',
    });
  });

  it('prevents assigning a room that is already occupied', async () => {
    await checkIn();
    const error = await checkIn({ name: 'Second Guest' }).catch((e) => e);
    expect(isAppError(error) && error.code).toBe('ROOM_OCCUPIED');
    expect(await env.customers.search().then((p) => p.total)).toBe(1);
  });

  it('does not leave ID photos behind when the insert fails', async () => {
    await checkIn();
    const filesBefore = env.files.files.size;
    await checkIn({ name: 'Second Guest' }).catch(() => undefined);
    expect(env.files.files.size).toBe(filesBefore);
  });

  it('frees the room for reuse after check-out', async () => {
    const first = await checkIn();
    await env.customers.checkOut(first.id);
    const second = await checkIn({ name: 'Later Guest' });
    expect(second.room_number).toBe('101');
  });
});

describe('room availability', () => {
  it('lists every configured room as available initially', async () => {
    expect(await env.rooms.listAvailable()).toEqual([
      '101', '102', '103', '104', '105', '201', '202', '203',
    ]);
  });

  it('removes an occupied room from the available list', async () => {
    await checkIn({ room_number: '102' });
    const available = await env.rooms.listAvailable();
    expect(available).not.toContain('102');
    expect(available).toContain('101');

    const status = await env.rooms.listStatus();
    expect(status.find((r) => r.room_number === '102')).toMatchObject({
      occupied: true,
      customer_code: 'CUS-000001',
      customer_name: 'Anoob Suresh',
    });
  });

  it('keeps the current room selectable while editing a booking', async () => {
    await checkIn({ room_number: '102' });
    expect(await env.rooms.listAvailable('102')).toContain('102');
  });

  it('will not delete a room that has a guest in it', async () => {
    await checkIn({ room_number: '103' });
    await expect(env.rooms.remove('103')).rejects.toMatchObject({ code: 'ROOM_IN_USE' });
    await env.customers.checkOut(1);
    await expect(env.rooms.remove('103')).resolves.toBeUndefined();
  });

  it('rejects duplicate room numbers', async () => {
    await expect(env.rooms.add('101')).rejects.toMatchObject({ code: 'DUPLICATE_ROOM' });
    await expect(env.rooms.add('301')).resolves.toMatchObject({ room_number: '301' });
  });
});

describe('check-out', () => {
  it('records the timestamp, keeps the record and frees the room', async () => {
    const customer = await checkIn();
    const out = await env.customers.checkOut(customer.id);

    expect(out.status).toBe(CUSTOMER_STATUS.CHECKED_OUT);
    expect(out.check_out_date).toBeTruthy();
    expect(out.check_in_date).toBe(customer.check_in_date);
    expect(await env.customers.find(customer.id)).not.toBeNull();
    expect(await env.rooms.listAvailable()).toContain('101');
  });

  it('cannot check out twice', async () => {
    const customer = await checkIn();
    await env.customers.checkOut(customer.id);
    await expect(env.customers.checkOut(customer.id)).rejects.toThrow(/already been checked out/i);
  });

  it('reports a missing record clearly', async () => {
    await expect(env.customers.checkOut(4321)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('editing', () => {
  it('updates details, keeps the check-in time and bumps updated_at', async () => {
    const customer = await checkIn();
    await new Promise((r) => setTimeout(r, 5));
    const edited = await env.customers.update(customer.id, formValues({
      name: 'Anoob S George',
      phone: '9847099999',
      number_of_persons: 4,
      // Submit the stored arrival time unchanged, which is what the form does
      // when nobody touches the field. (Relying on "now" here would break
      // whenever the test straddled a minute boundary.)
      check_in_at: isoToLocalInput(customer.check_in_date),
    }));

    expect(edited.name).toBe('Anoob S George');
    expect(edited.number_of_persons).toBe(4);
    expect(edited.check_in_date).toBe(customer.check_in_date);
    expect(edited.created_at).toBe(customer.created_at);
    expect(edited.updated_at >= customer.updated_at).toBe(true);
  });

  it('moves a guest to an available room', async () => {
    const customer = await checkIn();
    const moved = await env.customers.update(customer.id, formValues({ room_number: '104' }));
    expect(moved.room_number).toBe('104');
    expect(await env.rooms.listAvailable()).toContain('101');
  });

  it('refuses to move a guest into an occupied room', async () => {
    const first = await checkIn();
    await checkIn({ name: 'Other Guest', room_number: '105' });
    await expect(
      env.customers.update(first.id, formValues({ room_number: '105' })),
    ).rejects.toMatchObject({ code: 'ROOM_OCCUPIED' });
  });

  it('replaces an ID photo in place without orphaning files', async () => {
    const customer = await checkIn();
    const fileCount = env.files.files.size;
    const replacement = fakeImage('front-v2');

    const updated = await env.customers.update(customer.id, formValues(), { front: replacement });

    expect(env.files.files.size).toBe(fileCount);
    expect(updated.id_front_path).toBe(customer.id_front_path);
    expect(await env.files.read(updated.id_front_path)).toEqual(replacement.full);
  });
});

describe('search and filters', () => {
  beforeEach(async () => {
    await checkIn({ name: 'Anoob Suresh', phone: '9847012345', room_number: '101' });
    await checkIn({ name: 'Meera Nair', phone: '9000011111', room_number: '102' });
    const third = await checkIn({ name: 'Rahul Menon', phone: '9812345678', room_number: '103' });
    await env.customers.checkOut(third.id);
  });

  it('finds customers by name, phone, room and code', async () => {
    expect((await env.customers.search({ search: 'meera' })).items).toHaveLength(1);
    expect((await env.customers.search({ search: 'NAIR' })).items[0].name).toBe('Meera Nair');
    expect((await env.customers.search({ search: '9847' })).items[0].phone).toBe('9847012345');
    expect((await env.customers.search({ search: '103' })).items[0].room_number).toBe('103');
    expect((await env.customers.search({ search: 'CUS-000002' })).items[0].name).toBe('Meera Nair');
  });

  it('returns nothing for an unmatched search', async () => {
    expect(await env.customers.search({ search: 'nobody' })).toMatchObject({ total: 0, items: [] });
  });

  it('treats LIKE wildcards as literal text', async () => {
    expect((await env.customers.search({ search: '%' })).total).toBe(0);
    expect((await env.customers.search({ search: '_' })).total).toBe(0);
  });

  it('filters by status', async () => {
    expect((await env.customers.search({ filter: 'ALL' })).total).toBe(3);
    expect((await env.customers.search({ filter: 'CHECKED_IN' })).total).toBe(2);
    expect((await env.customers.search({ filter: 'CHECKED_OUT' })).total).toBe(1);
  });

  it('sorts newest first and pages results', async () => {
    const page1 = await env.customers.search({ limit: 2, offset: 0 });
    expect(page1.items.map((c) => c.customer_code)).toEqual(['CUS-000003', 'CUS-000002']);
    expect(page1.hasMore).toBe(true);

    const page2 = await env.customers.search({ limit: 2, offset: 2 });
    expect(page2.items.map((c) => c.customer_code)).toEqual(['CUS-000001']);
    expect(page2.hasMore).toBe(false);
  });

  it('summarises the dashboard', async () => {
    const stats = await env.customers.dashboard();
    expect(stats).toMatchObject({
      currently_staying: 2,
      active_guests: 4,
      occupied_rooms: 2,
      total_rooms: 8,
      available_rooms: 6,
      todays_check_ins: 3,
      todays_check_outs: 1,
    });
  });
});

describe('deleting', () => {
  it('removes the record and every associated image file', async () => {
    const customer = await checkIn();
    expect(env.files.files.size).toBe(4);

    await env.customers.remove(customer.id);

    expect(await env.customers.find(customer.id)).toBeNull();
    expect(env.files.files.size).toBe(0);
    expect(await env.rooms.listAvailable()).toContain('101');
  });

  it('succeeds even when the image files are already gone', async () => {
    const customer = await checkIn();
    env.files.files.clear();
    await expect(env.customers.remove(customer.id)).resolves.toBeUndefined();
    expect(await env.customers.find(customer.id)).toBeNull();
  });

  it('reports an unknown record instead of failing silently', async () => {
    await expect(env.customers.remove(999)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('leaves other customers untouched', async () => {
    const first = await checkIn();
    const second = await checkIn({ name: 'Other', room_number: '102' });
    await env.customers.remove(first.id);

    expect(await env.customers.find(second.id)).not.toBeNull();
    expect(await env.files.exists(second.id_front_path)).toBe(true);
  });
});
