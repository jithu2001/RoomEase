/**
 * Add or edit one additional guest on a booking.
 *
 * Only the name is required. A companion's phone and ID photos are optional
 * because they are frequently not collected — a family sharing one room usually
 * has one ID between them.
 */

import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Screen } from '../../components/Layout';
import { TextField } from '../../components/Field';
import { ErrorState, InlineLoading, Notice, Spinner } from '../../components/Feedback';
import { IdPhotoField } from '../../components/IdPhotoField';
import { useToast } from '../../components/ToastProvider';
import { useServices } from '../../context/ServicesContext';
import { useAsyncData } from '../../hooks/useAsyncData';
import { hasErrors, validateGuestForm, type GuestField } from '../../utils/validation';
import type { FieldErrors } from '../../utils/validation';
import type { PreparedImage } from '../../types';

export function GuestForm() {
  const params = useParams();
  const customerId = Number(params.id);
  const guestId = params.guestId ? Number(params.guestId) : null;
  const isEdit = guestId !== null;

  const { customers, guests, images, invalidateData } = useServices();
  const navigate = useNavigate();
  const toast = useToast();

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [front, setFront] = useState<PreparedImage | null>(null);
  const [back, setBack] = useState<PreparedImage | null>(null);
  const [errors, setErrors] = useState<FieldErrors<GuestField>>({});
  const [submitting, setSubmitting] = useState(false);
  const [existingFront, setExistingFront] = useState<string | null>(null);
  const [existingBack, setExistingBack] = useState<string | null>(null);

  const context = useAsyncData(
    async () => ({
      customer: await customers.get(customerId),
      capacity: await guests.capacity(customerId),
      guest: isEdit ? await guests.get(guestId) : null,
    }),
    [customers, guests, customerId, guestId, isEdit],
    'guestFormContext',
  );

  // Fill in the fields once the record has loaded (edit mode).
  const loaded = context.data?.guest ?? null;
  useEffect(() => {
    if (!loaded) return;
    setName(loaded.name);
    setPhone(loaded.phone ?? '');
    let cancelled = false;
    (async () => {
      const [f, b] = await Promise.all([
        images.previewSrc(loaded.id_front_thumb_path, loaded.id_front_path),
        images.previewSrc(loaded.id_back_thumb_path, loaded.id_back_path),
      ]);
      if (!cancelled) {
        setExistingFront(f);
        setExistingBack(b);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loaded, images]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (submitting) return;

    const found = validateGuestForm({ name, phone });
    setErrors(found);
    if (hasErrors(found)) return;

    setSubmitting(true);
    try {
      const payload = { front: front ?? undefined, back: back ?? undefined };
      if (isEdit) {
        await guests.update(guestId, { name, phone }, payload);
        toast.success('Guest updated');
      } else {
        await guests.add(customerId, { name, phone }, payload);
        toast.success('Guest added');
      }
      invalidateData();
      navigate(`/customers/${customerId}`, { replace: true });
    } catch (e) {
      toast.error(e);
    } finally {
      setSubmitting(false);
    }
  };

  const capacity = context.data?.capacity;
  const full = !isEdit && capacity ? !capacity.canAddMore : false;

  return (
    <Screen
      title={isEdit ? 'Edit Guest' : 'Add Guest'}
      subtitle={context.data?.customer.customer_code}
      back={`/customers/${customerId}`}
    >
      {context.loading && !context.data ? <InlineLoading label="Loading…" /> : null}
      {context.error ? <ErrorState message={context.error} onRetry={context.reload} /> : null}

      {context.data ? (
        <form onSubmit={handleSubmit} noValidate>
          {full ? (
            <Notice kind="warn">
              This booking is for {capacity?.persons}{' '}
              {capacity?.persons === 1 ? 'person' : 'persons'}, and{' '}
              {capacity?.recorded} other {capacity?.recorded === 1 ? 'guest is' : 'guests are'}{' '}
              already recorded. Increase <strong>Number of Persons</strong> on the booking to add
              another.
            </Notice>
          ) : (
            <Notice kind="info">
              Sharing room <strong>{context.data.customer.room_number}</strong> with{' '}
              <strong>{context.data.customer.name}</strong>.
            </Notice>
          )}

          <div className="card">
            <TextField
              id="guest-name"
              label="Guest Name"
              required
              value={name}
              error={errors.name}
              placeholder="Full name as on ID"
              autoComplete="name"
              maxLength={80}
              onChange={(v) => {
                setName(v);
                setErrors((c) => ({ ...c, name: undefined }));
              }}
            />
            <TextField
              id="guest-phone"
              label="Phone Number"
              type="tel"
              inputMode="tel"
              value={phone}
              error={errors.phone}
              placeholder="Optional"
              maxLength={20}
              hint="Optional — leave blank if they have no separate number"
              onChange={(v) => {
                setPhone(v);
                setErrors((c) => ({ ...c, phone: undefined }));
              }}
            />
          </div>

          <div className="card">
            <div className="section-title">ID Proof (optional)</div>
            <IdPhotoField
              label="ID Front"
              value={front}
              existingSrc={existingFront}
              required={false}
              disabled={submitting}
              onChange={setFront}
            />
            <IdPhotoField
              label="ID Back"
              value={back}
              existingSrc={existingBack}
              required={false}
              disabled={submitting}
              onChange={setBack}
            />
            <p className="field-hint mb0">
              Leave these empty if you are not taking this guest&apos;s ID proof.
            </p>
          </div>

          <button type="submit" className="btn block mt" disabled={submitting || full}>
            {submitting ? (
              <>
                <Spinner small onBrand /> Saving…
              </>
            ) : isEdit ? (
              'Save Guest'
            ) : (
              'Add Guest'
            )}
          </button>
        </form>
      ) : null}
    </Screen>
  );
}
