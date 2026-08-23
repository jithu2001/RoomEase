/** New check-in screen, with returning-guest lookup. */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Screen } from '../../components/Layout';
import { ReturningGuestSearch } from '../../components/ReturningGuestSearch';
import { useToast } from '../../components/ToastProvider';
import { useServices } from '../../context/ServicesContext';
import { useAsyncData } from '../../hooks/useAsyncData';
import { AppError, toUserMessage } from '../../utils/errors';
import type { Customer, GuestMatch } from '../../types';
import { CustomerForm, type SubmitPayload } from './CustomerForm';

export function CheckIn() {
  const { customers, invalidateData, dataVersion } = useServices();
  const navigate = useNavigate();
  const toast = useToast();

  /** The previous stay whose details and photos this booking reuses. */
  const [reuseFrom, setReuseFrom] = useState<Customer | null>(null);

  const codeState = useAsyncData(() => customers.nextCode(), [customers, dataVersion], 'nextCode');

  const selectGuest = async (match: GuestMatch) => {
    try {
      const previous = await customers.get(match.customer_id);
      setReuseFrom(previous);
      toast.success(
        match.has_id_photos
          ? `Using ${previous.name}'s saved details and ID photos`
          : `Using ${previous.name}'s saved details — their ID photos are missing, please take new ones`,
      );
    } catch (e) {
      toast.error(e);
    }
  };

  const handleSubmit = async ({ values, front, back }: SubmitPayload) => {
    // The form has already validated this; belt and braces before we write.
    if (!reuseFrom && (!front || !back)) {
      toast.error(new AppError('VALIDATION', 'Both ID photos are required.'));
      return;
    }
    try {
      const customer = await customers.checkIn(values, {
        front: front ?? undefined,
        back: back ?? undefined,
        reuseFromCustomerId: reuseFrom?.id,
      });
      invalidateData();
      toast.success(`${customer.name} checked in to room ${customer.room_number}`);
      navigate(`/customers/${customer.id}`, { replace: true });
    } catch (e) {
      // A missing source photo is recoverable: drop the reuse so the staff
      // member is asked for fresh photos instead of hitting the same wall.
      if (e instanceof AppError && e.code === 'MISSING_FILE') {
        setReuseFrom(null);
        toast.error(toUserMessage(e));
        return;
      }
      toast.error(e);
    }
  };

  return (
    <Screen
      title="New Check-In"
      subtitle={codeState.data ? `Customer code ${codeState.data}` : undefined}
    >
      {reuseFrom ? null : <ReturningGuestSearch onSelect={selectGuest} />}
      <CustomerForm
        mode="create"
        submitLabel="Save Check-In"
        reuseFrom={reuseFrom}
        onClearReuse={() => setReuseFrom(null)}
        onSubmit={handleSubmit}
      />
    </Screen>
  );
}
