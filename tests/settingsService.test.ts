import { beforeEach, afterEach, describe, expect, it } from 'vitest';
import { createTestEnv, formValues, idImages, type TestEnv } from './helpers/testEnv';
import { wipeAllTables } from '../src/database/database';
import { hashPin } from '../src/services/settingsService';
import { CUSTOMERS_ROOT } from '../src/services/fileStore';

let env: TestEnv;

beforeEach(async () => {
  env = await createTestEnv();
});

afterEach(async () => {
  await env.close();
});

describe('hotel information', () => {
  it('starts with a usable default and saves changes', async () => {
    expect((await env.settings.get()).hotel_name).toBe('My Hotel');

    await env.settings.saveHotelInfo({
      hotel_name: '  Trinity Residency  ',
      hotel_address: ' Fort Kochi ',
      hotel_phone: ' 04842222333 ',
    });

    expect(await env.settings.get()).toMatchObject({
      hotel_name: 'Trinity Residency',
      hotel_address: 'Fort Kochi',
      hotel_phone: '04842222333',
    });
  });

  it('requires a hotel name', async () => {
    await expect(
      env.settings.saveHotelInfo({ hotel_name: '   ', hotel_address: '', hotel_phone: '' }),
    ).rejects.toThrow(/name is required/i);
  });
});

describe('app pin', () => {
  it('is disabled by default and lets everything through', async () => {
    expect(await env.settings.isPinEnabled()).toBe(false);
    expect(await env.settings.verifyPin('')).toBe(true);
  });

  it('accepts the correct pin and rejects wrong ones', async () => {
    await env.settings.setPin('4321');
    expect(await env.settings.isPinEnabled()).toBe(true);
    expect(await env.settings.verifyPin('4321')).toBe(true);
    expect(await env.settings.verifyPin('1234')).toBe(false);
    expect(await env.settings.verifyPin('')).toBe(false);
  });

  it('never stores the pin itself', async () => {
    await env.settings.setPin('123456');
    const stored = (await env.settings.get()).pin_hash;
    expect(stored).not.toContain('123456');
    expect(stored).toHaveLength(64); // SHA-256 hex
    expect(stored).toBe(await hashPin('123456'));
    expect(await hashPin('123456')).not.toBe(await hashPin('123457'));
  });

  it('rejects a pin that is too short or not numeric', async () => {
    await expect(env.settings.setPin('12')).rejects.toThrow(/4 to 8/);
    await expect(env.settings.setPin('abcd')).rejects.toThrow(/4 to 8/);
  });

  it('requires the current pin to remove it', async () => {
    await env.settings.setPin('4321');
    await expect(env.settings.clearPin('0000')).rejects.toThrow(/incorrect/i);
    expect(await env.settings.isPinEnabled()).toBe(true);

    await env.settings.clearPin('4321');
    expect(await env.settings.isPinEnabled()).toBe(false);
  });
});

describe('clear all data', () => {
  it('removes customers, photos and rooms but keeps the hotel identity', async () => {
    await env.settings.saveHotelInfo({
      hotel_name: 'Trinity Residency',
      hotel_address: 'Fort Kochi',
      hotel_phone: '04842222333',
    });
    await env.settings.setPin('4321');
    await env.customers.checkIn(formValues(), idImages());
    expect((await env.customers.search()).total).toBe(1);

    await wipeAllTables(env.db);
    await env.files.removeDir(CUSTOMERS_ROOT);

    expect((await env.customers.search()).total).toBe(0);
    expect(await env.rooms.list()).toEqual([]);
    expect(env.files.files.size).toBe(0);

    const settings = await env.settings.get();
    expect(settings.hotel_name).toBe('Trinity Residency');
    expect(await env.settings.verifyPin('4321')).toBe(true);
    expect(settings.last_backup_at).toBe('');
  });

  it('leaves the app in a usable state afterwards', async () => {
    await env.customers.checkIn(formValues(), idImages());
    await wipeAllTables(env.db);

    // Rooms are gone, so a check-in must be refused until one is added back.
    await expect(env.customers.checkIn(formValues(), idImages())).rejects.toMatchObject({
      code: 'ROOM_UNKNOWN',
    });

    await env.rooms.add('101');
    const customer = await env.customers.checkIn(formValues(), idImages());
    expect(customer.customer_code).toBe('CUS-000001');
    expect(await env.customers.dashboard()).toMatchObject({
      currently_staying: 1,
      total_rooms: 1,
      available_rooms: 0,
    });
  });
});
