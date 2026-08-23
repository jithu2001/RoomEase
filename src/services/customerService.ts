/**
 * Check-in / check-out / edit / delete business rules.
 *
 * This is the only place that coordinates SQLite and the filesystem, so it is
 * also the place that guarantees we never leave orphaned ID photos behind.
 */

import { nextCustomerCode } from '../utils/customerCode';
import { nowIso, toDayKey } from '../utils/date';
import { AppError, logError } from '../utils/errors';
import {
  hasErrors,
  normaliseCustomerInput,
  validateCustomerForm,
  type CustomerFormValues,
} from '../utils/validation';
import {
  CUSTOMER_STATUS,
  type Customer,
  type CustomerQuery,
  type DashboardStats,
  type GuestMatch,
  type PreparedImage,
} from '../types';
import type { BookingGuestRepository } from '../database/repositories/bookingGuestRepository';
import type { CustomerRepository } from '../database/repositories/customerRepository';
import type { RoomRepository } from '../database/repositories/roomRepository';
import type { ImageService, StoredIdImage } from './imageService';
import type { RoomService } from './roomService';

export interface CheckInImages {
  /** Freshly captured photo; always wins over a reused one. */
  front?: PreparedImage;
  back?: PreparedImage;
  /**
   * Reuse the ID photos already stored for this earlier booking (a returning
   * guest). The files are copied, not shared.
   */
  reuseFromCustomerId?: number;
}

export interface EditImages {
  front?: PreparedImage;
  back?: PreparedImage;
}

export interface CustomerPage {
  items: Customer[];
  total: number;
  hasMore: boolean;
}

export class CustomerService {
  constructor(
    private readonly customers: CustomerRepository,
    private readonly rooms: RoomRepository,
    private readonly roomService: RoomService,
    private readonly images: ImageService,
    /** Optional: only needed to guard number_of_persons against recorded guests. */
    private readonly guests?: BookingGuestRepository,
  ) {}

  /* ---------------------------------------------------------------- */
  /* Reads                                                            */
  /* ---------------------------------------------------------------- */

  async get(id: number): Promise<Customer> {
    const customer = await this.customers.findById(id);
    if (!customer) throw new AppError('NOT_FOUND', 'That customer record no longer exists.');
    return customer;
  }

  async find(id: number): Promise<Customer | null> {
    return this.customers.findById(id);
  }

  /** Paged + filtered list, newest check-in first. */
  async search(query: CustomerQuery = {}): Promise<CustomerPage> {
    const limit = query.limit ?? 25;
    const offset = query.offset ?? 0;
    const [items, total] = await Promise.all([
      this.customers.list({ ...query, limit, offset }),
      this.customers.count(query),
    ]);
    return { items, total, hasMore: offset + items.length < total };
  }

  async listActive(): Promise<Customer[]> {
    return this.customers.listActive();
  }

  async dashboard(): Promise<DashboardStats> {
    const today = toDayKey();
    const [totalRooms, occupancy, rooms, staying, guests, checkIns, checkOuts] = await Promise.all([
      this.rooms.count(),
      this.customers.occupancyMap(),
      this.rooms.listNumbers(),
      this.customers.countActive(),
      this.customers.sumActivePersons(),
      this.customers.countCheckInsOn(today),
      this.customers.countCheckOutsOn(today),
    ]);
    const occupiedRooms = rooms.filter((room) => occupancy.has(room)).length;
    return {
      currently_staying: staying,
      active_guests: guests,
      occupied_rooms: occupiedRooms,
      available_rooms: Math.max(0, totalRooms - occupiedRooms),
      total_rooms: totalRooms,
      todays_check_ins: checkIns,
      todays_check_outs: checkOuts,
    };
  }

  /* ---------------------------------------------------------------- */
  /* Check-in                                                         */
  /* ---------------------------------------------------------------- */

  async nextCode(): Promise<string> {
    return nextCustomerCode(await this.customers.highestCustomerCode());
  }

  /**
   * Finds guests who have stayed before, so their details never have to be
   * collected twice. Matches on phone number or name and returns one entry per
   * phone number — the most recent stay — with a flag saying whether that
   * stay's ID photos are still on disk and can be reused.
   */
  async findReturningGuests(term: string, limit = 8): Promise<GuestMatch[]> {
    const trimmed = term.trim();
    // Two characters would match half the database; make the staff type a bit.
    if (trimmed.length < 3) return [];

    const matches = await this.customers.findGuestsByPhoneOrName(trimmed, limit);
    return Promise.all(
      matches.map(async (match) => {
        if (!match.has_id_photos) return match;
        const source = await this.customers.findById(match.customer_id);
        const usable =
          source !== null &&
          (await this.images.exists(source.id_front_path)) &&
          (await this.images.exists(source.id_back_path));
        return { ...match, has_id_photos: usable };
      }),
    );
  }

  /**
   * Creates a booking: validates, reserves the room, resolves the ID photos and
   * inserts the row.
   *
   * ID photos come from one of two places — freshly captured images, or an
   * earlier stay by the same guest, copied into this booking's own folder. A
   * fresh capture always overrides a reused photo.
   *
   * The check-in timestamp defaults to now, but staff can set it explicitly for
   * a guest whose arrival is being recorded after the fact. `created_at` still
   * records when the row was actually written, so the two can differ.
   */
  async checkIn(values: CustomerFormValues, images: CheckInImages): Promise<Customer> {
    const source = images.reuseFromCustomerId
      ? await this.get(images.reuseFromCustomerId)
      : null;

    const errors = validateCustomerForm(values, {
      hasIdFront: Boolean(images.front) || source !== null,
      hasIdBack: Boolean(images.back) || source !== null,
    });
    if (hasErrors(errors)) {
      throw new AppError('VALIDATION', Object.values(errors).find(Boolean) ?? 'Please check the form.');
    }

    const input = normaliseCustomerInput(values);
    await this.roomService.assertAssignable(input.room_number);

    const code = await this.nextCode();
    const now = nowIso();
    const checkInAt = input.check_in_date ?? now;

    let front: StoredIdImage;
    let back: StoredIdImage;
    try {
      if (source) {
        const copied = await this.images.copyIdImages(source, code);
        front = copied.front;
        back = copied.back;
        // A retake during a returning-guest check-in replaces the copy.
        if (images.front) front = await this.images.storeIdImage(code, 'front', images.front);
        if (images.back) back = await this.images.storeIdImage(code, 'back', images.back);
      } else {
        // Both are guaranteed present here by validateCustomerForm above.
        front = await this.images.storeIdImage(code, 'front', images.front as PreparedImage);
        back = await this.images.storeIdImage(code, 'back', images.back as PreparedImage);
      }
    } catch (e) {
      // Never leave photos of a guest we failed to record.
      await this.images.removeCustomerImages(code);
      throw e;
    }

    try {
      const id = await this.customers.insert({
        customer_code: code,
        name: input.name,
        address: input.address,
        phone: input.phone,
        room_number: input.room_number,
        number_of_persons: input.number_of_persons,
        id_front_path: front.path,
        id_back_path: back.path,
        id_front_thumb_path: front.thumbPath,
        id_back_thumb_path: back.thumbPath,
        check_in_date: checkInAt,
        status: CUSTOMER_STATUS.CHECKED_IN,
        created_at: now,
        updated_at: now,
        amount_minor: input.amount_minor,
      });
      return this.get(id);
    } catch (e) {
      await this.images.removeCustomerImages(code);
      logError('checkIn.insert', e);
      if (e instanceof AppError && e.code === 'DB_QUERY') {
        // Most often the partial unique index rejecting a second active guest
        // in the room, but do not assert a cause we have not confirmed.
        throw new AppError(
          'DB_QUERY',
          'This booking could not be saved. If the room was just taken by another booking, choose a different room and try again.',
          e,
        );
      }
      throw e;
    }
  }

  /* ---------------------------------------------------------------- */
  /* Edit                                                             */
  /* ---------------------------------------------------------------- */

  /**
   * Updates an existing booking. `check_in_date` and `created_at` are never
   * touched; `updated_at` always is.
   */
  async update(id: number, values: CustomerFormValues, images: EditImages = {}): Promise<Customer> {
    const existing = await this.get(id);
    const errors = validateCustomerForm(values, { hasIdFront: true, hasIdBack: true });
    if (hasErrors(errors)) {
      throw new AppError('VALIDATION', Object.values(errors).find(Boolean) ?? 'Please check the form.');
    }
    const input = normaliseCustomerInput(values);

    // Lowering the person count below the companions already on file would
    // leave them stranded, so say what needs doing instead.
    if (this.guests && input.number_of_persons < existing.number_of_persons) {
      const recorded = await this.guests.countByCustomer(id);
      if (input.number_of_persons < recorded + 1) {
        throw new AppError(
          'VALIDATION',
          `${recorded} other ${recorded === 1 ? 'guest is' : 'guests are'} recorded on this ` +
            `booking, so it needs at least ${recorded + 1} persons. Remove a guest first.`,
        );
      }
    }

    if (input.room_number !== existing.room_number) {
      if (existing.status === CUSTOMER_STATUS.CHECKED_IN) {
        await this.roomService.assertAssignable(input.room_number, id);
      } else if (!(await this.rooms.exists(input.room_number))) {
        throw new AppError('ROOM_UNKNOWN', `Room ${input.room_number} is not in the room list.`);
      }
    }

    const patch: Parameters<CustomerRepository['update']>[1] = {
      name: input.name,
      address: input.address,
      phone: input.phone,
      room_number: input.room_number,
      number_of_persons: input.number_of_persons,
      amount_minor: input.amount_minor,
      updated_at: nowIso(),
    };

    // Correcting a late-recorded arrival, or a check-out logged at the wrong
    // time (the reason this is editable at all).
    if (input.check_in_date) patch.check_in_date = input.check_in_date;
    if (input.check_out_date) {
      if (existing.status !== CUSTOMER_STATUS.CHECKED_OUT) {
        throw new AppError(
          'VALIDATION',
          'This guest is still staying, so there is no check-out time to change yet.',
        );
      }
      patch.check_out_date = input.check_out_date;
    }

    const effectiveCheckIn = patch.check_in_date ?? existing.check_in_date;
    const effectiveCheckOut = patch.check_out_date ?? existing.check_out_date;
    if (
      effectiveCheckOut &&
      new Date(effectiveCheckOut).getTime() < new Date(effectiveCheckIn).getTime()
    ) {
      throw new AppError('VALIDATION', 'Check-out cannot be before check-in.');
    }

    // Replacing a photo overwrites the same filename, so no orphan is created.
    if (images.front) {
      const stored = await this.images.storeIdImage(existing.customer_code, 'front', images.front);
      patch.id_front_path = stored.path;
      patch.id_front_thumb_path = stored.thumbPath;
    }
    if (images.back) {
      const stored = await this.images.storeIdImage(existing.customer_code, 'back', images.back);
      patch.id_back_path = stored.path;
      patch.id_back_thumb_path = stored.thumbPath;
    }

    await this.customers.update(id, patch);
    return this.get(id);
  }

  /* ---------------------------------------------------------------- */
  /* Check-out & delete                                               */
  /* ---------------------------------------------------------------- */

  /**
   * Keeps the record; frees the room.
   * `at` allows checking a guest out at the time they actually left rather than
   * the moment someone remembered to press the button.
   */
  async checkOut(id: number, at?: string): Promise<Customer> {
    const existing = await this.get(id);
    if (existing.status === CUSTOMER_STATUS.CHECKED_OUT) {
      throw new AppError('VALIDATION', 'This customer has already been checked out.');
    }
    const when = at ?? nowIso();
    if (new Date(when).getTime() < new Date(existing.check_in_date).getTime()) {
      throw new AppError('VALIDATION', 'Check-out cannot be before check-in.');
    }
    const changes = await this.customers.checkOut(id, when);
    if (changes === 0) {
      throw new AppError('DB_QUERY', 'The check-out could not be saved. Please try again.');
    }
    return this.get(id);
  }

  /**
   * Permanently removes the record and its ID photos. The row goes first so a
   * filesystem hiccup can never leave a record pointing at deleted photos.
   */
  async remove(id: number): Promise<void> {
    const existing = await this.get(id);
    const changes = await this.customers.delete(id);
    if (changes === 0) {
      throw new AppError('DB_QUERY', 'The customer record could not be deleted.');
    }
    await this.images.removeCustomerImages(existing.customer_code, [
      existing.id_front_path,
      existing.id_back_path,
      existing.id_front_thumb_path,
      existing.id_back_thumb_path,
    ]);
  }
}
