/**
 * Additional guests sharing a booking's room.
 *
 * Recording them is optional, so the first thing to protect is that a booking
 * with no companions behaves exactly as it did before. After that: capacity is
 * bounded by the person count, photos are cleaned up, and deleting a booking
 * takes its companions with it.
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

const book = (persons = 3, overrides = {}) =>
  env.customers.checkIn(formValues({ number_of_persons: persons, ...overrides }), idImages());

describe('recording additional guests', () => {
  it('starts with none, and that is a complete booking', async () => {
    const booking = await book();
    expect(await env.guests.list(booking.id)).toEqual([]);
    expect(await env.guests.capacity(booking.id)).toEqual({
      persons: 3,
      recorded: 0,
      allowed: 2,
      canAddMore: true,
    });
  });

  it('records a companion with only a name', async () => {
    const booking = await book();
    const guest = await env.guests.add(booking.id, { name: 'Meera Nair', phone: '' });

    expect(guest.name).toBe('Meera Nair');
    expect(guest.phone).toBeNull();
    expect(guest.id_front_path).toBeNull();
    expect(guest.id_back_path).toBeNull();
    expect(guest.customer_id).toBe(booking.id);
  });

  it('records a phone and ID photos when they are collected', async () => {
    const booking = await book();
    const guest = await env.guests.add(
      booking.id,
      { name: 'Meera Nair', phone: '9000011111' },
      { front: fakeImage('guest-front'), back: fakeImage('guest-back') },
    );

    expect(guest.phone).toBe('9000011111');
    expect(guest.id_front_path).toBe(
      `hotel-data/customers/CUS-000001/guests/${guest.id}/id-front.jpg`,
    );
    expect(await env.files.exists(guest.id_front_path!)).toBe(true);
    expect(await env.files.exists(guest.id_back_path!)).toBe(true);
    expect(await env.files.exists(guest.id_front_thumb_path!)).toBe(true);
  });

  it('accepts a front photo without a back one', async () => {
    const booking = await book();
    const guest = await env.guests.add(
      booking.id,
      { name: 'Meera Nair', phone: '' },
      { front: fakeImage('only-front') },
    );
    expect(guest.id_front_path).toBeTruthy();
    expect(guest.id_back_path).toBeNull();
  });

  it('requires a name once you start adding someone', async () => {
    const booking = await book();
    await expect(env.guests.add(booking.id, { name: '  ', phone: '' })).rejects.toThrow(
      /name is required/i,
    );
    expect(await env.guests.list(booking.id)).toEqual([]);
  });

  it('validates a phone number only when one is given', async () => {
    const booking = await book();
    await expect(
      env.guests.add(booking.id, { name: 'Meera Nair', phone: '123' }),
    ).rejects.toThrow(/too short/i);
    await expect(
      env.guests.add(booking.id, { name: 'Meera Nair', phone: '' }),
    ).resolves.toBeTruthy();
  });

  it('keeps the list in the order guests were recorded', async () => {
    const booking = await book(4);
    await env.guests.add(booking.id, { name: 'Second Person', phone: '' });
    await env.guests.add(booking.id, { name: 'Third Person', phone: '' });
    await env.guests.add(booking.id, { name: 'Fourth Person', phone: '' });

    expect((await env.guests.list(booking.id)).map((g) => g.name)).toEqual([
      'Second Person',
      'Third Person',
      'Fourth Person',
    ]);
  });
});

describe('capacity', () => {
  it('allows one fewer guest than the person count', async () => {
    const booking = await book(2);
    await env.guests.add(booking.id, { name: 'Companion', phone: '' });

    expect(await env.guests.capacity(booking.id)).toMatchObject({
      recorded: 1,
      allowed: 1,
      canAddMore: false,
    });
    await expect(env.guests.add(booking.id, { name: 'Third Person', phone: '' })).rejects.toThrow(
      /only 1 other guests can be recorded|Increase/i,
    );
  });

  it('explains that a single-person booking has no room for others', async () => {
    const booking = await book(1);
    expect(await env.guests.capacity(booking.id)).toMatchObject({ allowed: 0, canAddMore: false });
    await expect(env.guests.add(booking.id, { name: 'Someone', phone: '' })).rejects.toThrow(
      /booking is for one person/i,
    );
  });

  it('makes room when the person count is increased', async () => {
    const booking = await book(2);
    await env.guests.add(booking.id, { name: 'Companion', phone: '' });

    await env.customers.update(
      booking.id,
      formValues({
        number_of_persons: 3,
        check_in_at: isoToLocalInput(booking.check_in_date),
      }),
    );

    expect(await env.guests.capacity(booking.id)).toMatchObject({ allowed: 2, canAddMore: true });
    await expect(env.guests.add(booking.id, { name: 'Third Person', phone: '' })).resolves.toBeTruthy();
  });

  it('refuses to strand recorded guests by lowering the person count', async () => {
    const booking = await book(3);
    await env.guests.add(booking.id, { name: 'Second Person', phone: '' });
    await env.guests.add(booking.id, { name: 'Third Person', phone: '' });

    await expect(
      env.customers.update(
        booking.id,
        formValues({
          number_of_persons: 2,
          check_in_at: isoToLocalInput(booking.check_in_date),
        }),
      ),
    ).rejects.toThrow(/2 other guests are recorded/i);

    // Removing one first makes the change legal.
    const list = await env.guests.list(booking.id);
    await env.guests.remove(list[1].id);
    await expect(
      env.customers.update(
        booking.id,
        formValues({
          number_of_persons: 2,
          check_in_at: isoToLocalInput(booking.check_in_date),
        }),
      ),
    ).resolves.toBeTruthy();
  });
});

describe('editing and removing a guest', () => {
  it('updates the details and replaces a retaken photo', async () => {
    const booking = await book();
    const guest = await env.guests.add(
      booking.id,
      { name: 'Meera Nair', phone: '' },
      { front: fakeImage('v1') },
    );
    const replacement = fakeImage('v2');

    const updated = await env.guests.update(
      guest.id,
      { name: 'Meera S Nair', phone: '9000011111' },
      { front: replacement },
    );

    expect(updated.name).toBe('Meera S Nair');
    expect(updated.phone).toBe('9000011111');
    expect(updated.id_front_path).toBe(guest.id_front_path);
    expect(await env.files.read(updated.id_front_path!)).toEqual(replacement.full);
  });

  it('can add a photo to a guest recorded without one', async () => {
    const booking = await book();
    const guest = await env.guests.add(booking.id, { name: 'Meera Nair', phone: '' });
    expect(guest.id_front_path).toBeNull();

    const updated = await env.guests.update(
      guest.id,
      { name: 'Meera Nair', phone: '' },
      { front: fakeImage('late') },
    );
    expect(updated.id_front_path).toBeTruthy();
    expect(await env.files.exists(updated.id_front_path!)).toBe(true);
  });

  it('can clear a phone number', async () => {
    const booking = await book();
    const guest = await env.guests.add(booking.id, { name: 'Meera Nair', phone: '9000011111' });
    const updated = await env.guests.update(guest.id, { name: 'Meera Nair', phone: '' });
    expect(updated.phone).toBeNull();
  });

  it('removes the guest and their photos, leaving the booking intact', async () => {
    const booking = await book();
    const guest = await env.guests.add(
      booking.id,
      { name: 'Meera Nair', phone: '' },
      { front: fakeImage('front'), back: fakeImage('back') },
    );
    const frontPath = guest.id_front_path!;

    await env.guests.remove(guest.id);

    expect(await env.guests.list(booking.id)).toEqual([]);
    expect(await env.files.exists(frontPath)).toBe(false);
    // The booking and its own photos are untouched.
    expect(await env.customers.find(booking.id)).not.toBeNull();
    expect(await env.files.exists(booking.id_front_path)).toBe(true);
  });

  it('reports a guest that no longer exists', async () => {
    await expect(env.guests.remove(999)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('deleting a booking', () => {
  it('takes its guests and their photos with it', async () => {
    const booking = await book();
    const guest = await env.guests.add(
      booking.id,
      { name: 'Meera Nair', phone: '' },
      { front: fakeImage('front') },
    );
    const guestPhoto = guest.id_front_path!;

    await env.customers.remove(booking.id);

    // Cascade removed the row; the recursive directory delete removed the file.
    expect(await env.guests.list(booking.id)).toEqual([]);
    expect(await env.files.exists(guestPhoto)).toBe(false);
    expect(env.files.files.size).toBe(0);
  });
});

describe('searching by an additional guest', () => {
  it('finds the booking a companion stayed on', async () => {
    const booking = await book();
    await env.guests.add(booking.id, { name: 'Meera Nair', phone: '' });

    const page = await env.customers.search({ search: 'Meera' });
    expect(page.total).toBe(1);
    expect(page.items[0].id).toBe(booking.id);
  });

  it('still matches the primary guest and does not duplicate rows', async () => {
    const booking = await book();
    // A companion who happens to share the primary guest's surname.
    await env.guests.add(booking.id, { name: 'Anoob Junior', phone: '' });

    const page = await env.customers.search({ search: 'Anoob' });
    expect(page.total).toBe(1);
    expect(page.items).toHaveLength(1);
  });

  it('does not match a companion on a different booking', async () => {
    const first = await book();
    await env.guests.add(first.id, { name: 'Meera Nair', phone: '' });
    await book(2, { name: 'Other Primary', phone: '9111122222', room_number: '102' });

    const page = await env.customers.search({ search: 'Meera' });
    expect(page.total).toBe(1);
    expect(page.items[0].id).toBe(first.id);
  });
});

describe('backup and restore', () => {
  it('carries guests and their photos through a round trip', async () => {
    const booking = await book();
    await env.guests.add(
      booking.id,
      { name: 'Meera Nair', phone: '9000011111' },
      { front: fakeImage('guest-front'), back: fakeImage('guest-back') },
    );
    await env.guests.add(booking.id, { name: 'No Photo Guest', phone: '' });

    const { bytes, manifest } = await env.backup.buildArchive();
    expect(manifest.counts.guests).toBe(2);

    const fresh = await createTestEnv();
    try {
      const summary = await fresh.backup.restoreBackup(bytes);
      expect(summary.guests).toBe(2);
      expect(summary.warnings).toEqual([]);

      const restoredBooking = (await fresh.customers.search()).items[0];
      const list = await fresh.guests.list(restoredBooking.id);
      expect(list.map((g) => g.name)).toEqual(['Meera Nair', 'No Photo Guest']);

      const withPhoto = list[0];
      expect(withPhoto.phone).toBe('9000011111');
      expect(await fresh.files.exists(withPhoto.id_front_path!)).toBe(true);
      expect(await fresh.files.exists(withPhoto.id_back_path!)).toBe(true);

      // A guest recorded without a photo must not gain a path to a missing file.
      expect(list[1].id_front_path).toBeNull();
      expect(list[1].phone).toBeNull();

      // And the companion is still searchable after the restore.
      expect((await fresh.customers.search({ search: 'Meera' })).total).toBe(1);
    } finally {
      await fresh.close();
    }
  });

  it('skips a guest whose booking was not restored', async () => {
    const booking = await book();
    await env.guests.add(booking.id, { name: 'Meera Nair', phone: '' });
    const { bytes } = await env.backup.buildArchive();

    // Corrupt the archive so the booking is dropped but the guest remains.
    const { unzipSync, zipSync } = await import('fflate');
    const entries = unzipSync(bytes);
    const data = JSON.parse(new TextDecoder().decode(entries['data.json']));
    data.customers = [];
    entries['data.json'] = new TextEncoder().encode(JSON.stringify(data));

    const fresh = await createTestEnv();
    try {
      const summary = await fresh.backup.restoreBackup(zipSync(entries));
      expect(summary.customers).toBe(0);
      expect(summary.guests).toBe(0);
      expect(summary.warnings.join(' ')).toMatch(/booking was not restored/i);
    } finally {
      await fresh.close();
    }
  });

  it('restores an older archive that has no guests at all', async () => {
    await book();
    const { bytes } = await env.backup.buildArchive();

    const { unzipSync, zipSync } = await import('fflate');
    const entries = unzipSync(bytes);
    const data = JSON.parse(new TextDecoder().decode(entries['data.json']));
    delete data.guests;
    entries['data.json'] = new TextEncoder().encode(JSON.stringify(data));

    const fresh = await createTestEnv();
    try {
      const summary = await fresh.backup.restoreBackup(zipSync(entries));
      expect(summary.customers).toBe(1);
      expect(summary.guests).toBe(0);
      expect(summary.warnings).toEqual([]);
    } finally {
      await fresh.close();
    }
  });
});
