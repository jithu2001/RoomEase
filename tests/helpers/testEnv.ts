/** Builds the real object graph on top of sql.js + an in-memory file store. */

import { runMigrations } from '../../src/database/migrations';
import { createServices, type Services } from '../../src/services/container';
import { MemoryFileStore } from '../../src/services/fileStore';
import type { PreparedImage } from '../../src/types';
import { nowLocalInput } from '../../src/utils/date';
import type { CustomerFormValues } from '../../src/utils/validation';
import { SqlJsDriver } from './sqlJsDriver';

export interface TestEnv extends Services {
  files: MemoryFileStore;
  close(): Promise<void>;
}

export async function createTestEnv(): Promise<TestEnv> {
  const db = await SqlJsDriver.open();
  await runMigrations(db);
  const files = new MemoryFileStore();
  const services = createServices(db, files);
  return {
    ...services,
    files,
    close: () => db.close(),
  };
}

/** Stand-in for the output of compressImage(), which needs a real canvas. */
export function fakeImage(marker = 'front'): PreparedImage {
  const body = new TextEncoder().encode(`jpeg-${marker}-${'x'.repeat(64)}`);
  const bytes = new Uint8Array(body.length + 3);
  bytes.set([0xff, 0xd8, 0xff], 0); // JPEG SOI so the payload looks plausible
  bytes.set(body, 3);
  const thumb = bytes.subarray(0, Math.min(24, bytes.length));
  return {
    full: bytes,
    thumb: new Uint8Array(thumb),
    previewDataUrl: 'data:image/jpeg;base64,AA==',
    width: 800,
    height: 600,
    bytes: bytes.length,
  };
}

export function formValues(overrides: Partial<CustomerFormValues> = {}): CustomerFormValues {
  return {
    name: 'Anoob Suresh',
    address: '12 Beach Road, Kochi, Kerala 682001',
    phone: '9847012345',
    room_number: '101',
    number_of_persons: 2,
    amount: '',
    check_in_at: nowLocalInput(),
    check_out_at: '',
    ...overrides,
  };
}

export function idImages() {
  return { front: fakeImage('front'), back: fakeImage('back') };
}
