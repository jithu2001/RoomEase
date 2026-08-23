/** Edit an existing booking. Reuses the check-in form. */

import { useNavigate, useParams } from 'react-router-dom';
import { Screen } from '../../components/Layout';
import { ErrorState, InlineLoading } from '../../components/Feedback';
import { useToast } from '../../components/ToastProvider';
import { useServices } from '../../context/ServicesContext';
import { useAsyncData } from '../../hooks/useAsyncData';
import { CustomerForm, type SubmitPayload } from '../CheckIn/CustomerForm';

export function EditCustomer() {
  const { id } = useParams();
  const customerId = Number(id);
  const { customers, invalidateData } = useServices();
  const navigate = useNavigate();
  const toast = useToast();

  const state = useAsyncData(() => customers.get(customerId), [customers, customerId], 'editLoad');

  const handleSubmit = async ({ values, front, back }: SubmitPayload) => {
    try {
      await customers.update(customerId, values, {
        front: front ?? undefined,
        back: back ?? undefined,
      });
      invalidateData();
      toast.success('Customer details updated');
      navigate(`/customers/${customerId}`, { replace: true });
    } catch (e) {
      toast.error(e);
    }
  };

  return (
    <Screen
      title="Edit Customer"
      subtitle={state.data?.customer_code}
      back={`/customers/${customerId}`}
    >
      {state.loading && !state.data ? <InlineLoading label="Loading record…" /> : null}
      {state.error ? <ErrorState message={state.error} onRetry={state.reload} /> : null}
      {state.data ? (
        <CustomerForm
          mode="edit"
          customer={state.data}
          submitLabel="Save Changes"
          onSubmit={handleSubmit}
        />
      ) : null}
    </Screen>
  );
}
