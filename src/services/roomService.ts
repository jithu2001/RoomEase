/** Room configuration and availability rules. */

import { AppError } from '../utils/errors';
import { nowIso } from '../utils/date';
import { validateNewRoomNumber } from '../utils/validation';
import type { CustomerRepository } from '../database/repositories/customerRepository';
import type { RoomRepository } from '../database/repositories/roomRepository';
import type { Room, RoomStatus } from '../types';

export class RoomService {
  constructor(
    private readonly rooms: RoomRepository,
    private readonly customers: CustomerRepository,
  ) {}

  async list(): Promise<Room[]> {
    return this.rooms.list();
  }

  /** Every room with its live occupancy, in room-number order. */
  async listStatus(): Promise<RoomStatus[]> {
    const [rooms, occupancy] = await Promise.all([
      this.rooms.list(),
      this.customers.occupancyMap(),
    ]);
    return rooms.map((room) => {
      const guest = occupancy.get(room.room_number);
      return guest
        ? {
            room_number: room.room_number,
            occupied: true,
            customer_code: guest.customer_code,
            customer_name: guest.name,
          }
        : { room_number: room.room_number, occupied: false };
    });
  }

  /**
   * Rooms that can be assigned right now. `keepRoom` is included even when
   * occupied, so editing a booking can keep its current room.
   */
  async listAvailable(keepRoom?: string): Promise<string[]> {
    const status = await this.listStatus();
    return status
      .filter((r) => !r.occupied || (keepRoom !== undefined && r.room_number === keepRoom))
      .map((r) => r.room_number);
  }

  async isAvailable(roomNumber: string, excludeCustomerId?: number): Promise<boolean> {
    const active = await this.customers.activeByRoom(roomNumber);
    return !active || active.id === excludeCustomerId;
  }

  /**
   * Throws when the room is unknown or already taken by another active guest.
   * Called by the customer service before every check-in and room change.
   */
  async assertAssignable(roomNumber: string, excludeCustomerId?: number): Promise<void> {
    if (!(await this.rooms.exists(roomNumber))) {
      throw new AppError(
        'ROOM_UNKNOWN',
        `Room ${roomNumber} is not in the room list. Add it under Rooms first.`,
      );
    }
    const active = await this.customers.activeByRoom(roomNumber);
    if (active && active.id !== excludeCustomerId) {
      throw new AppError(
        'ROOM_OCCUPIED',
        `Room ${roomNumber} is already occupied. Check that guest out first or pick another room.`,
      );
    }
  }

  async add(roomNumber: string): Promise<Room> {
    const trimmed = roomNumber.trim();
    const existing = await this.rooms.listNumbers();
    const error = validateNewRoomNumber(trimmed, existing);
    if (error) {
      throw new AppError(error.includes('already exists') ? 'DUPLICATE_ROOM' : 'VALIDATION', error);
    }
    await this.rooms.insert(trimmed, nowIso());
    const created = (await this.rooms.list()).find((r) => r.room_number === trimmed);
    if (!created) throw new AppError('DB_QUERY', 'The room could not be saved.');
    return created;
  }

  /** Refuses to remove a room that currently has a guest in it. */
  async remove(roomNumber: string): Promise<void> {
    const active = await this.customers.activeByRoom(roomNumber);
    if (active) {
      throw new AppError(
        'ROOM_IN_USE',
        `Room ${roomNumber} has a guest staying in it. Check them out before removing the room.`,
      );
    }
    const changes = await this.rooms.deleteByNumber(roomNumber);
    if (changes === 0) {
      throw new AppError('NOT_FOUND', `Room ${roomNumber} was not found.`);
    }
  }
}
