/**
 * The check-in form, reused for editing.
 *
 * Nothing here talks to SQLite: it collects validated values plus already
 * compressed images and hands them to the service layer.
 *
 * Three things make it more than a plain form:
 *  - a returning guest (`reuseFrom`) prefills the details and supplies the ID
 *    photos, so nothing has to be collected twice
 *  - the check-in time is editable, defaulting to now, for arrivals recorded late
 *  - the check-out time is editable once a guest has been checked out, because
 *    the button often gets pressed well after they actually left
 */

import { useEffect, useState } from 'react';
import { DateTimeField, NumberField, TextAreaField, TextField } from '../../components/Field';
import { IdPhotoField } from '../../components/IdPhotoField';
import { RoomSelect } from '../../components/RoomSelect';
import { ErrorState, Notice, Spinner } from '../../components/Feedback';
import { useServices } from '../../context/ServicesContext';
import { useAsyncData } from '../../hooks/useAsyncData';
import { isoToLocalInput, nowLocalInput } from '../../utils/date';
import { CURRENCY_SYMBOL, minorToInput } from '../../utils/money';
import {
  hasErrors,
  validateCustomerForm,
  type CustomerField,
  type CustomerFormValues,
  type FieldErrors,
} from '../../utils/validation';
import { CUSTOMER_STATUS, type Customer, type PreparedImage } from '../../types';

export interface SubmitPayload {
  values: CustomerFormValues;
  front: PreparedImage | null;
  back: PreparedImage | null;
}

function emptyValues(): CustomerFormValues {
  return {
    name: '',
    address: '',
    phone: '',
    room_number: '',
    number_of_persons: '1',
    amount: '',
    check_in_at: nowLocalInput(),
    check_out_at: '',
  };
}

function valuesFrom(customer: Customer): CustomerFormValues {
  return {
    name: customer.name,
    address: customer.address,
    phone: customer.phone,
    room_number: customer.room_number,
    number_of_persons: String(customer.number_of_persons),
    amount: minorToInput(customer.amount_minor),
    check_in_at: isoToLocalInput(customer.check_in_date),
    check_out_at: isoToLocalInput(customer.check_out_date),
  };
}

export function CustomerForm({
  mode,
  customer,
  reuseFrom,
  onClearReuse,
  submitLabel,
  onSubmit,
}: {
  mode: 'create' | 'edit';
  customer?: Customer;
  /** A previous stay by the same guest, whose details and photos are reused. */
  reuseFrom?: Customer | null;
  onClearReuse?: () => void;
  submitLabel: string;
  onSubmit: (payload: SubmitPayload) => Promise<void>;
}) {
  const { rooms, images, dataVersion } = useServices();

  const [values, setValues] = useState<CustomerFormValues>(
    customer ? valuesFrom(customer) : emptyValues(),
  );
  const [front, setFront] = useState<PreparedImage | null>(null);
  const [back, setBack] = useState<PreparedImage | null>(null);
  const [errors, setErrors] = useState<FieldErrors<CustomerField>>({});
  const [submitting, setSubmitting] = useState(false);
  const [existingFront, setExistingFront] = useState<string | null>(null);
  const [existingBack, setExistingBack] = useState<string | null>(null);

  const roomState = useAsyncData(() => rooms.listStatus(), [rooms, dataVersion], 'rooms');
  const roomList = roomState.data ?? [];

  // Picking a returning guest fills in the identity fields but leaves the
  // stay-specific ones (room, persons, amount, time) for staff to set.
  useEffect(() => {
    if (!reuseFrom) return;
    setValues((current) => ({
      ...current,
      name: reuseFrom.name,
      address: reuseFrom.address,
      phone: reuseFrom.phone,
    }));
    setErrors({});
  }, [reuseFrom]);

  // Show the photos already on file — either this record's (edit) or the
  // returning guest's previous stay (create).
  const photoSource = reuseFrom ?? customer ?? null;
  useEffect(() => {
    if (!photoSource) {
      setExistingFront(null);
      setExistingBack(null);
      return;
    }
    let cancelled = false;
    (async () => {
      const [f, b] = await Promise.all([
        images.previewSrc(photoSource.id_front_thumb_path, photoSource.id_front_path),
        images.previewSrc(photoSource.id_back_thumb_path, photoSource.id_back_path),
      ]);
      if (!cancelled) {
        setExistingFront(f);
        setExistingBack(b);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [photoSource, images]);

  const set = <K extends keyof CustomerFormValues>(key: K, value: CustomerFormValues[K]) => {
    setValues((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
  };

  // A stored photo counts as present: editing or reusing needs no new capture.
  const hasStoredPhotos = mode === 'edit' ? Boolean(customer?.id_front_path) : Boolean(reuseFrom);
  const hasIdFront = Boolean(front) || hasStoredPhotos;
  const hasIdBack = Boolean(back) || hasStoredPhotos;
  const canEditCheckOut = mode === 'edit' && customer?.status === CUSTOMER_STATUS.CHECKED_OUT;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (submitting) return;

    const found = validateCustomerForm(values, { hasIdFront, hasIdBack });
    setErrors(found);
    if (hasErrors(found)) {
      document.querySelector('.field.invalid')?.scrollIntoView({ block: 'center' });
      return;
    }

    setSubmitting(true);
    try {
      await onSubmit({ values, front, back });
    } finally {
      setSubmitting(false);
    }
  };

  if (roomState.error) {
    return <ErrorState message={roomState.error} onRetry={roomState.reload} />;
  }

  const noRooms = !roomState.loading && roomList.length === 0;
  const nothingFree =
    !roomState.loading &&
    roomList.length > 0 &&
    roomList.every((r) => r.occupied && r.room_number !== customer?.room_number);

  return (
    <form onSubmit={handleSubmit} noValidate>
      {noRooms ? (
        <Notice kind="warn">
          No rooms are configured yet. Add your room numbers on the Rooms screen before checking a
          guest in.
        </Notice>
      ) : null}
      {nothingFree ? (
        <Notice kind="warn">
          Every room is occupied. Check a guest out to free a room, or add another room.
        </Notice>
      ) : null}

      {reuseFrom ? (
        <Notice kind="info">
          <div className="spread">
            <span>
              Reusing details from <strong>{reuseFrom.name}</strong> (
              <span className="mono">{reuseFrom.customer_code}</span>). Their ID photos will be
              copied to this booking.
            </span>
            {onClearReuse ? (
              <button type="button" className="btn secondary small" onClick={onClearReuse}>
                Clear
              </button>
            ) : null}
          </div>
        </Notice>
      ) : null}

      <div className="card">
        <div className="section-title mb0">Customer Information</div>
        <TextField
          id="name"
          label="Customer Name"
          required
          value={values.name}
          error={errors.name}
          placeholder="Full name as on ID"
          autoComplete="name"
          maxLength={80}
          onChange={(v) => set('name', v)}
        />
        <TextAreaField
          id="address"
          label="Full Address"
          required
          value={values.address}
          error={errors.address}
          placeholder="House / street, city, state, PIN"
          maxLength={250}
          onChange={(v) => set('address', v)}
        />
        <TextField
          id="phone"
          label="Phone Number"
          required
          type="tel"
          inputMode="tel"
          value={values.phone}
          error={errors.phone}
          placeholder="e.g. 9847012345"
          maxLength={20}
          onChange={(v) => set('phone', v)}
        />
      </div>

      <div className="card">
        <div className="section-title mb0">This Stay</div>
        <NumberField
          id="persons"
          label="Number of Persons"
          required
          value={String(values.number_of_persons)}
          error={errors.number_of_persons}
          hint="Total people staying in this room"
          onChange={(v) => set('number_of_persons', v)}
        />
        <DateTimeField
          id="check-in-at"
          label="Check-in Date & Time"
          required
          value={values.check_in_at}
          error={errors.check_in_date}
          hint="Defaults to now — change it if the guest arrived earlier"
          onChange={(v) => set('check_in_at', v)}
        />
        {canEditCheckOut ? (
          <DateTimeField
            id="check-out-at"
            label="Check-out Date & Time"
            value={values.check_out_at}
            error={errors.check_out_date}
            hint="Correct this if the check-out was recorded late"
            onChange={(v) => set('check_out_at', v)}
          />
        ) : null}
        <TextField
          id="amount"
          label="Amount"
          value={values.amount}
          error={errors.amount}
          inputMode="numeric"
          placeholder={`e.g. 1500`}
          maxLength={14}
          hint={`Optional, in ${CURRENCY_SYMBOL}. Leave blank if not collected yet.`}
          onChange={(v) => set('amount', v)}
        />
      </div>

      <div className="card">
        <RoomSelect
          rooms={roomList}
          value={values.room_number}
          error={errors.room_number}
          loading={roomState.loading}
          keepRoom={customer?.room_number}
          onChange={(room) => set('room_number', room)}
        />
      </div>

      <div className="card">
        <div className="section-title">ID Proof</div>
        <IdPhotoField
          label="ID Front"
          value={front}
          existingSrc={existingFront}
          error={errors.id_front}
          disabled={submitting}
          onChange={setFront}
        />
        <IdPhotoField
          label="ID Back"
          value={back}
          existingSrc={existingBack}
          error={errors.id_back}
          disabled={submitting}
          onChange={setBack}
        />
        <p className="field-hint mb0">
          {reuseFrom
            ? 'These are the photos already on file. Take a new one only if the ID has changed.'
            : 'Photos are resized to about 800×600 and stored only on this device.'}
        </p>
      </div>

      <button type="submit" className="btn block mt" disabled={submitting}>
        {submitting ? (
          <>
            <Spinner small onBrand /> Saving…
          </>
        ) : (
          submitLabel
        )}
      </button>
    </form>
  );
}
