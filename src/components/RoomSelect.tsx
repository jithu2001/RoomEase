/**
 * Room picker with visual availability. Occupied rooms are visible but not
 * selectable, which is faster for staff than hiding them.
 */

import { FieldGroup } from './Field';
import { InlineLoading } from './Feedback';
import type { RoomStatus } from '../types';

export function RoomSelect({
  rooms,
  value,
  onChange,
  error,
  loading,
  /** The room this booking already holds; stays selectable while editing. */
  keepRoom,
}: {
  rooms: RoomStatus[];
  value: string;
  onChange: (room: string) => void;
  error?: string;
  loading?: boolean;
  keepRoom?: string;
}) {
  const available = rooms.filter((r) => !r.occupied || r.room_number === keepRoom);

  return (
    <FieldGroup
      label="Room Number"
      required
      error={error}
      hint={
        rooms.length
          ? `${available.length} of ${rooms.length} rooms available`
          : 'No rooms configured yet — add rooms under Rooms.'
      }
    >
      {loading ? (
        <InlineLoading label="Checking rooms…" />
      ) : (
        <div className="room-grid">
          {rooms.map((room) => {
            const selectable = !room.occupied || room.room_number === keepRoom;
            const selected = value === room.room_number;
            return (
              <button
                key={room.room_number}
                type="button"
                className={`room-option${selected ? ' selected' : ''}${selectable ? '' : ' occupied'}`}
                disabled={!selectable}
                aria-pressed={selected}
                title={
                  room.occupied && room.customer_name
                    ? `Occupied by ${room.customer_name}`
                    : undefined
                }
                onClick={() => onChange(room.room_number)}
              >
                {room.room_number}
                <span className="state">
                  {room.occupied ? (room.room_number === keepRoom ? 'Current' : 'Busy') : 'Free'}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </FieldGroup>
  );
}
