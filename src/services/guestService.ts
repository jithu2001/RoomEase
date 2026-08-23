/**
 * Additional guests sharing a booking's room.
 *
 * Recording companions is optional: a booking with none behaves exactly as it
 * did before this existed. What the service guarantees is that a booking never
 * holds more companions than the room was booked for, and that a companion's ID
 * photos are cleaned up whenever the companion or the booking goes away.
 */

import { nowIso } from '../utils/date';
import { AppError } from '../utils/errors';
import {
  normaliseGuestInput,
  validateGuestForm,
  hasErrors,
} from '../utils/validation';
import type { BookingGuest, BookingGuestInput, GuestCapacity, PreparedImage } from '../types';
import type { BookingGuestRepository } from '../database/repositories/bookingGuestRepository';
import type { CustomerRepository } from '../database/repositories/customerRepository';
import type { ImageService } from './imageService';

export interface GuestImages {
  front?: PreparedImage;
  back?: PreparedImage;
}

export class GuestService {
  constructor(
    private readonly guests: BookingGuestRepository,
    private readonly customers: CustomerRepository,
    private readonly images: ImageService,
  ) {}

  async list(customerId: number): Promise<BookingGuest[]> {
    return this.guests.listByCustomer(customerId);
  }

  async get(guestId: number): Promise<BookingGuest> {
    const guest = await this.guests.findById(guestId);
    if (!guest) throw new AppError('NOT_FOUND', 'That guest record no longer exists.');
    return guest;
  }

  /**
   * How many companions this booking has room for. The primary guest counts as
   * one of `number_of_persons`, so a booking for 3 allows 2 companions.
   */
  async capacity(customerId: number): Promise<GuestCapacity> {
    const customer = await this.customers.findById(customerId);
    if (!customer) throw new AppError('NOT_FOUND', 'That customer record no longer exists.');
    const recorded = await this.guests.countByCustomer(customerId);
    const allowed = Math.max(0, customer.number_of_persons - 1);
    return {
      persons: customer.number_of_persons,
      recorded,
      allowed,
      canAddMore: recorded < allowed,
    };
  }

  /** Adds a companion, optionally with their own ID photos. */
  async add(
    customerId: number,
    values: BookingGuestInput,
    images: GuestImages = {},
  ): Promise<BookingGuest> {
    const errors = validateGuestForm(values);
    if (hasErrors(errors)) {
      throw new AppError('VALIDATION', Object.values(errors).find(Boolean) ?? 'Please check the form.');
    }

    const customer = await this.customers.findById(customerId);
    if (!customer) throw new AppError('NOT_FOUND', 'That customer record no longer exists.');

    const capacity = await this.capacity(customerId);
    if (!capacity.canAddMore) {
      throw new AppError(
        'VALIDATION',
        capacity.allowed === 0
          ? 'This booking is for one person. Increase "Number of Persons" to record other guests.'
          : `This booking is for ${capacity.persons} persons, so only ${capacity.allowed} other ` +
            'guests can be recorded. Increase "Number of Persons" to add more.',
      );
    }

    const input = normaliseGuestInput(values);
    const timestamp = nowIso();
    // The row goes in first so its id can name the photo folder.
    const id = await this.guests.insert({
      customer_id: customerId,
      name: input.name,
      phone: input.phone,
      created_at: timestamp,
      updated_at: timestamp,
    });

    try {
      await this.storePhotos(customer.customer_code, id, images, timestamp);
    } catch (e) {
      // Roll the row back so a failed photo write leaves no half-record.
      await this.guests.delete(id);
      await this.images.removeGuestImages(customer.customer_code, id);
      throw e;
    }

    return this.get(id);
  }

  /** Updates a companion's details, and replaces any photo that was retaken. */
  async update(
    guestId: number,
    values: BookingGuestInput,
    images: GuestImages = {},
  ): Promise<BookingGuest> {
    const errors = validateGuestForm(values);
    if (hasErrors(errors)) {
      throw new AppError('VALIDATION', Object.values(errors).find(Boolean) ?? 'Please check the form.');
    }

    const guest = await this.get(guestId);
    const customer = await this.customers.findById(guest.customer_id);
    if (!customer) throw new AppError('NOT_FOUND', 'That customer record no longer exists.');

    const input = normaliseGuestInput(values);
    const timestamp = nowIso();
    await this.guests.update(guestId, {
      name: input.name,
      phone: input.phone,
      updated_at: timestamp,
    });
    // Replacing a photo overwrites the same filename, so no orphan is created.
    await this.storePhotos(customer.customer_code, guestId, images, timestamp);

    return this.get(guestId);
  }

  /** Removes a companion and their photos. */
  async remove(guestId: number): Promise<void> {
    const guest = await this.get(guestId);
    const customer = await this.customers.findById(guest.customer_id);

    const changes = await this.guests.delete(guestId);
    if (changes === 0) {
      throw new AppError('DB_QUERY', 'The guest record could not be deleted.');
    }
    // The row is gone first, so a filesystem hiccup cannot leave a record
    // pointing at deleted photos.
    if (customer) {
      await this.images.removeGuestImages(customer.customer_code, guestId);
    }
  }

  private async storePhotos(
    customerCode: string,
    guestId: number,
    images: GuestImages,
    timestamp: string,
  ): Promise<void> {
    const patch: Parameters<BookingGuestRepository['update']>[1] = { updated_at: timestamp };
    let touched = false;

    if (images.front) {
      const stored = await this.images.storeGuestIdImage(customerCode, guestId, 'front', images.front);
      patch.id_front_path = stored.path;
      patch.id_front_thumb_path = stored.thumbPath;
      touched = true;
    }
    if (images.back) {
      const stored = await this.images.storeGuestIdImage(customerCode, guestId, 'back', images.back);
      patch.id_back_path = stored.path;
      patch.id_back_thumb_path = stored.thumbPath;
      touched = true;
    }
    if (touched) await this.guests.update(guestId, patch);
  }
}
