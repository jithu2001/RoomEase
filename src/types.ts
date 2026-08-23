/** Shared domain types. Kept free of any UI or platform imports. */

export const CUSTOMER_STATUS = {
  CHECKED_IN: 'CHECKED_IN',
  CHECKED_OUT: 'CHECKED_OUT',
} as const;

export type CustomerStatus = (typeof CUSTOMER_STATUS)[keyof typeof CUSTOMER_STATUS];

/** A row of the `customers` table. */
export interface Customer {
  id: number;
  customer_code: string;
  name: string;
  address: string;
  phone: string;
  room_number: string;
  number_of_persons: number;
  id_front_path: string;
  id_back_path: string;
  /** ISO 8601 local-offset timestamp, e.g. 2026-08-18T10:35:00.000+05:30 */
  check_in_date: string;
  check_out_date: string | null;
  status: CustomerStatus;
  created_at: string;
  updated_at: string;
  /** Added in migration 2. Nullable: older records may not have thumbnails. */
  id_front_thumb_path: string | null;
  id_back_thumb_path: string | null;
  /**
   * Added in migration 4. Optional booking amount in minor units (paise).
   * Null means "not recorded", which is different from zero.
   */
  amount_minor: number | null;
}

/**
 * Another person sharing the room, recorded optionally.
 *
 * Added in migration 5. Everything except the name is optional: a companion's
 * phone and ID proof are often not collected.
 */
export interface BookingGuest {
  id: number;
  customer_id: number;
  name: string;
  phone: string | null;
  id_front_path: string | null;
  id_back_path: string | null;
  id_front_thumb_path: string | null;
  id_back_thumb_path: string | null;
  created_at: string;
  updated_at: string;
}

/** Form values for an additional guest. */
export interface BookingGuestInput {
  name: string;
  phone: string;
}

/** How many companions a booking has room for, and how many are recorded. */
export interface GuestCapacity {
  /** number_of_persons on the booking. */
  persons: number;
  /** Companions already recorded (excludes the primary guest). */
  recorded: number;
  /** persons - 1: the primary guest is the booking itself. */
  allowed: number;
  canAddMore: boolean;
}

/** One returning-guest match: the latest stay for a phone number. */
export interface GuestMatch {
  /** Id of that latest stay, used as the source for copied ID photos. */
  customer_id: number;
  customer_code: string;
  name: string;
  address: string;
  phone: string;
  /** How many stays this phone number has on record. */
  stay_count: number;
  /** Check-in timestamp of the most recent stay. */
  last_stay: string;
  has_id_photos: boolean;
}

/** Fields collected by the check-in / edit form. */
export interface CustomerInput {
  name: string;
  address: string;
  phone: string;
  room_number: string;
  number_of_persons: number;
  /** Optional booking amount in minor units, or null when not recorded. */
  amount_minor: number | null;
  /** Explicit check-in timestamp; defaults to now when omitted. */
  check_in_date?: string;
  /** Only meaningful for an already checked-out booking. */
  check_out_date?: string;
}

/** A compressed image ready to be persisted, produced by the image utils. */
export interface PreparedImage {
  /** Full-size (compressed) JPEG bytes. */
  full: Uint8Array;
  /** Small preview JPEG bytes used by lists and detail cards. */
  thumb: Uint8Array;
  /** Data URL of the full image, used for the in-form preview. */
  previewDataUrl: string;
  width: number;
  height: number;
  bytes: number;
}

export interface Room {
  id: number;
  room_number: string;
  created_at: string;
}

export interface RoomStatus {
  room_number: string;
  occupied: boolean;
  /** Present when occupied. */
  customer_code?: string;
  customer_name?: string;
}

export interface HotelSettings {
  hotel_name: string;
  hotel_address: string;
  hotel_phone: string;
  /** SHA-256 hex of the app PIN, or '' when PIN lock is disabled. */
  pin_hash: string;
  /** ISO timestamp of the last successful backup export, or ''. */
  last_backup_at: string;
}

export type CustomerFilter = 'ALL' | 'CHECKED_IN' | 'CHECKED_OUT';

export interface CustomerQuery {
  search?: string;
  filter?: CustomerFilter;
  limit?: number;
  offset?: number;
}

export interface DashboardStats {
  currently_staying: number;
  active_guests: number;
  occupied_rooms: number;
  available_rooms: number;
  total_rooms: number;
  todays_check_ins: number;
  todays_check_outs: number;
}
