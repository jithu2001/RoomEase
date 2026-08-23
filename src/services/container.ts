/**
 * Wires repositories and services together.
 *
 * `createServices` takes its driver and file store as arguments, which is what
 * lets the test suite build the exact same object graph on top of sql.js and an
 * in-memory file store.
 */

import { initDatabase } from '../database/database';
import type { SqlDriver } from '../database/driver';
import { BookingGuestRepository } from '../database/repositories/bookingGuestRepository';
import { CustomerRepository } from '../database/repositories/customerRepository';
import { RoomRepository } from '../database/repositories/roomRepository';
import { SettingsRepository } from '../database/repositories/settingsRepository';
import { AutoBackupService } from './autoBackupService';
import { BackupService } from './backupService';
import { CustomerService } from './customerService';
import { GuestService } from './guestService';
import { ReportService } from './reportService';
import { CapacitorFileStore, type FileStore } from './fileStore';
import { ImageService } from './imageService';
import { RoomService } from './roomService';
import { SettingsService } from './settingsService';

export interface Services {
  db: SqlDriver;
  files: FileStore;
  images: ImageService;
  customers: CustomerService;
  guests: GuestService;
  reports: ReportService;
  rooms: RoomService;
  settings: SettingsService;
  backup: BackupService;
  autoBackup: AutoBackupService;
}

export function createServices(db: SqlDriver, files: FileStore): Services {
  const customerRepo = new CustomerRepository(db);
  const guestRepo = new BookingGuestRepository(db);
  const roomRepo = new RoomRepository(db);
  const settingsRepo = new SettingsRepository(db);

  const images = new ImageService(files);
  const rooms = new RoomService(roomRepo, customerRepo);
  const customers = new CustomerService(customerRepo, roomRepo, rooms, images, guestRepo);
  const guests = new GuestService(guestRepo, customerRepo, images);
  const settings = new SettingsService(settingsRepo);
  const reports = new ReportService(customerRepo, guestRepo, settings);
  const backup = new BackupService(db, customerRepo, guestRepo, roomRepo, settingsRepo, files);
  const autoBackup = new AutoBackupService(backup, settingsRepo, files, customerRepo);

  return { db, files, images, customers, guests, reports, rooms, settings, backup, autoBackup };
}

let services: Services | null = null;

/** Opens the database, runs migrations and builds the services (idempotent). */
export async function initServices(): Promise<Services> {
  if (services) return services;
  const db = await initDatabase();
  services = createServices(db, new CapacitorFileStore());
  return services;
}

export function getServices(): Services {
  if (!services) throw new Error('Services not initialised — call initServices() first.');
  return services;
}
