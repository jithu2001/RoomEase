/** Room configuration and live status board. */

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Screen } from '../../components/Layout';
import { EmptyState, ErrorState, InlineLoading } from '../../components/Feedback';
import { useConfirm } from '../../components/ConfirmProvider';
import { useToast } from '../../components/ToastProvider';
import { useServices } from '../../context/ServicesContext';
import { useAsyncData } from '../../hooks/useAsyncData';
import { validateNewRoomNumber } from '../../utils/validation';

export function Rooms() {
  const { rooms, invalidateData, dataVersion } = useServices();
  const confirm = useConfirm();
  const toast = useToast();
  const [newRoom, setNewRoom] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);

  const state = useAsyncData(() => rooms.listStatus(), [rooms, dataVersion], 'roomStatus');
  const list = state.data ?? [];
  const available = list.filter((r) => !r.occupied);
  const occupied = list.filter((r) => r.occupied);

  const addRoom = async (event: React.FormEvent) => {
    event.preventDefault();
    const problem = validateNewRoomNumber(newRoom, list.map((r) => r.room_number));
    setError(problem);
    if (problem) return;

    setSaving(true);
    try {
      await rooms.add(newRoom);
      setNewRoom('');
      state.reload();
      invalidateData();
      toast.success(`Room ${newRoom.trim()} added`);
    } catch (e) {
      toast.error(e);
    } finally {
      setSaving(false);
    }
  };

  const removeRoom = async (roomNumber: string) => {
    const ok = await confirm({
      title: `Remove room ${roomNumber}?`,
      message:
        'The room will no longer be available for new check-ins. Past customer records that used this room are kept.',
      confirmLabel: 'Remove',
      danger: true,
    });
    if (!ok) return;
    try {
      await rooms.remove(roomNumber);
      state.reload();
      invalidateData();
      toast.success(`Room ${roomNumber} removed`);
    } catch (e) {
      toast.error(e);
    }
  };

  return (
    <Screen title="Rooms" subtitle={list.length ? `${available.length} of ${list.length} free` : undefined}>
      {state.error ? <ErrorState message={state.error} onRetry={state.reload} /> : null}
      {state.loading && !state.data ? <InlineLoading label="Loading rooms…" /> : null}

      {state.data ? (
        <>
          <form className="card" onSubmit={addRoom}>
            <div className="section-title mb0">Add a room</div>
            <div className={`field${error ? ' invalid' : ''}`}>
              <label htmlFor="new-room">Room number</label>
              <input
                id="new-room"
                value={newRoom}
                placeholder="e.g. 106"
                autoComplete="off"
                maxLength={10}
                onChange={(e) => {
                  setNewRoom(e.target.value);
                  setError(undefined);
                }}
              />
              {error ? (
                <span className="field-error" role="alert">
                  {error}
                </span>
              ) : null}
            </div>
            <button type="submit" className="btn block" disabled={saving || !newRoom.trim()}>
              {saving ? 'Adding…' : 'Add Room'}
            </button>
          </form>

          {list.length === 0 ? (
            <div className="card">
              <EmptyState
                glyph="🚪"
                title="No rooms configured"
                message="Add the room numbers your hotel uses. You need at least one room before you can check a guest in."
              />
            </div>
          ) : (
            <>
              <div className="section-title">
                <span>Available ({available.length})</span>
              </div>
              {available.length === 0 ? (
                <p className="small faint">Every room is currently occupied.</p>
              ) : (
                <div className="card flush">
                  <div className="row-list">
                    {available.map((room) => (
                      <div key={room.room_number} className="row" style={{ cursor: 'default' }}>
                        <span className="room-pill">{room.room_number}</span>
                        <span className="grow">
                          <span className="meta">Free — ready for a new check-in</span>
                        </span>
                        <button
                          type="button"
                          className="btn secondary small"
                          onClick={() => removeRoom(room.room_number)}
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="section-title">
                <span>Occupied ({occupied.length})</span>
              </div>
              {occupied.length === 0 ? (
                <p className="small faint">No rooms are occupied right now.</p>
              ) : (
                <div className="card flush">
                  <div className="row-list">
                    {occupied.map((room) => (
                      <Link
                        key={room.room_number}
                        className="row"
                        to={`/customers?q=${encodeURIComponent(room.room_number)}`}
                      >
                        <span className="room-pill">{room.room_number}</span>
                        <span className="grow">
                          <span className="primary-line">
                            <span className="name">{room.customer_name}</span>
                          </span>
                          <span className="meta mono">{room.customer_code}</span>
                        </span>
                        <span className="badge in">In</span>
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </>
      ) : null}
    </Screen>
  );
}
