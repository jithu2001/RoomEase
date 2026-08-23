/**
 * The "Other Guests" card on a booking, listing the people sharing the room.
 *
 * Recording companions is optional, so this stays quiet: it shows how many of
 * the booked persons have details on file and offers to add the rest.
 */

import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { InlineLoading } from './Feedback';
import { useConfirm } from './ConfirmProvider';
import { useToast } from './ToastProvider';
import { useServices } from '../context/ServicesContext';
import { useAsyncData } from '../hooks/useAsyncData';
import type { BookingGuest, Customer } from '../types';

function GuestRow({
  guest,
  customerId,
  onRemove,
}: {
  guest: BookingGuest;
  customerId: number;
  onRemove: (guest: BookingGuest) => void;
}) {
  const { images } = useServices();
  const [thumb, setThumb] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const src = await images.previewSrc(guest.id_front_thumb_path, guest.id_front_path);
      if (!cancelled) setThumb(src);
    })();
    return () => {
      cancelled = true;
    };
  }, [images, guest.id_front_thumb_path, guest.id_front_path]);

  const hasId = Boolean(guest.id_front_path || guest.id_back_path);

  return (
    <div className="row">
      {thumb ? (
        <img
          src={thumb}
          alt={`ID of ${guest.name}`}
          style={{
            width: 44,
            height: 44,
            objectFit: 'cover',
            borderRadius: 8,
            flexShrink: 0,
            background: '#101820',
          }}
        />
      ) : (
        <span className="room-pill" aria-hidden="true">
          {guest.name.trim().charAt(0).toUpperCase() || '?'}
        </span>
      )}
      <span className="grow">
        <span className="primary-line">
          <span className="name">{guest.name}</span>
        </span>
        <span className="meta">
          {guest.phone ? `${guest.phone} · ` : ''}
          {hasId ? 'ID on file' : 'No ID recorded'}
        </span>
      </span>
      <Link
        className="btn secondary small"
        to={`/customers/${customerId}/guests/${guest.id}/edit`}
        aria-label={`Edit ${guest.name}`}
      >
        Edit
      </Link>
      <button
        type="button"
        className="btn secondary small"
        onClick={() => onRemove(guest)}
        aria-label={`Remove ${guest.name}`}
      >
        ✕
      </button>
    </div>
  );
}

export function GuestsSection({ customer }: { customer: Customer }) {
  const { guests, invalidateData, dataVersion } = useServices();
  const confirm = useConfirm();
  const toast = useToast();

  const state = useAsyncData(
    async () => ({
      list: await guests.list(customer.id),
      capacity: await guests.capacity(customer.id),
    }),
    [guests, customer.id, dataVersion],
    'guestsSection',
  );

  const remove = useCallback(
    async (guest: BookingGuest) => {
      const ok = await confirm({
        title: `Remove ${guest.name}?`,
        message:
          'This removes their details and any ID photos from this booking. The booking itself is not affected.',
        confirmLabel: 'Remove',
        danger: true,
      });
      if (!ok) return;
      try {
        await guests.remove(guest.id);
        state.reload();
        invalidateData();
        toast.success(`${guest.name} removed`);
      } catch (e) {
        toast.error(e);
      }
    },
    [confirm, guests, invalidateData, state, toast],
  );

  const capacity = state.data?.capacity;
  const list = state.data?.list ?? [];

  // A one-person booking has no companions to record, so stay out of the way.
  if (capacity && capacity.allowed === 0 && list.length === 0) return null;

  return (
    <div className="card">
      <div className="section-title">
        <span>Other Guests</span>
        {capacity ? (
          <span className="small faint">
            {capacity.recorded} of {capacity.allowed} recorded
          </span>
        ) : null}
      </div>

      {state.loading && !state.data ? <InlineLoading label="Loading guests…" /> : null}

      {state.data && list.length === 0 ? (
        <p className="small muted">
          This room is booked for {capacity?.persons} people. Recording the other{' '}
          {capacity?.allowed === 1 ? 'guest' : `${capacity?.allowed} guests`} is optional.
        </p>
      ) : null}

      {list.length > 0 ? (
        <div className="row-list" style={{ margin: '0 -0.9rem' }}>
          {list.map((guest) => (
            <GuestRow key={guest.id} guest={guest} customerId={customer.id} onRemove={remove} />
          ))}
        </div>
      ) : null}

      {capacity?.canAddMore ? (
        <Link className="btn secondary block mt" to={`/customers/${customer.id}/guests/new`}>
          + Add Guest
        </Link>
      ) : capacity && list.length > 0 ? (
        <p className="field-hint mb0">
          All {capacity.allowed} other {capacity.allowed === 1 ? 'guest is' : 'guests are'}{' '}
          recorded. Increase the number of persons on this booking to add more.
        </p>
      ) : null}
    </div>
  );
}
