/** Hotel information, room-independent preferences and the optional app PIN. */

import { AppError } from '../utils/errors';
import { validatePin } from '../utils/validation';
import type { SettingsRepository } from '../database/repositories/settingsRepository';
import type { HotelSettings } from '../types';

const DEFAULTS: HotelSettings = {
  hotel_name: 'My Hotel',
  hotel_address: '',
  hotel_phone: '',
  pin_hash: '',
  last_backup_at: '',
};

/** Domain separation so the stored digest is useless elsewhere. */
const PIN_SALT = 'hotel-customer-manager/pin/v1:';

function fallbackHash(input: string): string {
  // Only used if Web Crypto is unavailable (very old WebView). Still local-only.
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < input.length; i += 1) {
    h1 = (h1 ^ input.charCodeAt(i)) >>> 0;
    h1 = Math.imul(h1, 16777619) >>> 0;
    h2 = (h2 + Math.imul(input.charCodeAt(i) + i, 2654435761)) >>> 0;
  }
  return `fnv1a$${h1.toString(16).padStart(8, '0')}${h2.toString(16).padStart(8, '0')}`;
}

export async function hashPin(pin: string): Promise<string> {
  const value = PIN_SALT + pin;
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) return fallbackHash(value);
  const digest = await subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export class SettingsService {
  constructor(private readonly repo: SettingsRepository) {}

  async get(): Promise<HotelSettings> {
    const stored = await this.repo.getAll();
    return {
      hotel_name: stored.hotel_name || DEFAULTS.hotel_name,
      hotel_address: stored.hotel_address ?? DEFAULTS.hotel_address,
      hotel_phone: stored.hotel_phone ?? DEFAULTS.hotel_phone,
      pin_hash: stored.pin_hash ?? '',
      last_backup_at: stored.last_backup_at ?? '',
    };
  }

  async saveHotelInfo(info: Pick<HotelSettings, 'hotel_name' | 'hotel_address' | 'hotel_phone'>): Promise<void> {
    const name = info.hotel_name.trim();
    if (!name) throw new AppError('VALIDATION', 'Hotel name is required.');
    if (name.length > 80) throw new AppError('VALIDATION', 'Hotel name is too long.');
    await this.repo.setMany({
      hotel_name: name,
      hotel_address: info.hotel_address.trim(),
      hotel_phone: info.hotel_phone.trim(),
    });
  }

  async isPinEnabled(): Promise<boolean> {
    return Boolean(await this.repo.get('pin_hash'));
  }

  async setPin(pin: string): Promise<void> {
    const error = validatePin(pin);
    if (error) throw new AppError('VALIDATION', error);
    await this.repo.set('pin_hash', await hashPin(pin));
  }

  async verifyPin(pin: string): Promise<boolean> {
    const stored = await this.repo.get('pin_hash');
    if (!stored) return true; // no PIN configured
    return stored === (await hashPin(pin));
  }

  /** Removing the PIN requires the current one. */
  async clearPin(currentPin: string): Promise<void> {
    if (!(await this.verifyPin(currentPin))) {
      throw new AppError('VALIDATION', 'That PIN is incorrect.');
    }
    await this.repo.set('pin_hash', '');
  }

  async lastBackupAt(): Promise<string> {
    return (await this.repo.get('last_backup_at')) ?? '';
  }
}
