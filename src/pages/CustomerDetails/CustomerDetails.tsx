/** Full record for one customer, with ID photos and the three actions. */

import { useNavigate, useParams } from 'react-router-dom';
import { Screen } from '../../components/Layout';
import { ErrorState, InlineLoading } from '../../components/Feedback';
import { GuestsSection } from '../../components/GuestsSection';
import { IdPhotoViewer } from '../../components/IdPhotoViewer';
import { useConfirm } from '../../components/ConfirmProvider';
import { useToast } from '../../components/ToastProvider';
import { useServices } from '../../context/ServicesContext';
import { useAsyncData } from '../../hooks/useAsyncData';
import { formatDateTime, nightsBetween } from '../../utils/date';
import { formatMinor } from '../../utils/money';
import { CUSTOMER_STATUS } from '../../types';

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="detail-row">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

export function CustomerDetails() {
  const { id } = useParams();
  const customerId = Number(id);
  const { customers, invalidateData, dataVersion } = useServices();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const toast = useToast();

  const state = useAsyncData(
    () => customers.get(customerId),
    [customers, customerId, dataVersion],
    'customerDetails',
  );
  const customer = state.data;

  const handleCheckOut = async () => {
    if (!customer) return;
    const ok = await confirm({
      title: 'Check out this customer?',
      message: (
        <>
          Are you sure you want to check out <strong>{customer.name}</strong> from room{' '}
          <strong>{customer.room_number}</strong>? The record is kept and the room becomes
          available again.
        </>
      ),
      confirmLabel: 'Check Out',
    });
    if (!ok) return;
    try {
      const updated = await customers.checkOut(customer.id);
      state.setData(updated);
      invalidateData();
      toast.success(`Room ${updated.room_number} is now available`);
    } catch (e) {
      toast.error(e);
    }
  };

  const handleDelete = async () => {
    if (!customer) return;
    const ok = await confirm({
      title: 'Delete customer?',
      message:
        'This will permanently remove the customer record and associated ID photos from this device. This cannot be undone.',
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!ok) return;
    try {
      await customers.remove(customer.id);
      invalidateData();
      toast.success('Customer record deleted');
      navigate('/customers', { replace: true });
    } catch (e) {
      toast.error(e);
    }
  };

  return (
    <Screen
      title={customer?.name ?? 'Customer'}
      subtitle={customer?.customer_code}
      back="/customers"
    >
      {state.loading && !customer ? <InlineLoading label="Loading record…" /> : null}
      {state.error ? (
        <ErrorState message={state.error} onRetry={state.reload} />
      ) : null}

      {customer ? (
        <>
          <div className="card">
            <div className="spread">
              <span className="room-pill">Room {customer.room_number}</span>
              <span
                className={`badge ${customer.status === CUSTOMER_STATUS.CHECKED_IN ? 'in' : 'out'}`}
              >
                {customer.status === CUSTOMER_STATUS.CHECKED_IN ? 'Checked In' : 'Checked Out'}
              </span>
            </div>
            <dl className="mt">
              <Row label="Customer Code" value={<span className="mono">{customer.customer_code}</span>} />
              <Row label="Name" value={customer.name} />
              <Row label="Address" value={customer.address} />
              <Row label="Phone" value={<a href={`tel:${customer.phone}`}>{customer.phone}</a>} />
              <Row label="Number of Persons" value={customer.number_of_persons} />
              <Row label="Amount" value={formatMinor(customer.amount_minor)} />
              <Row label="Checked In" value={formatDateTime(customer.check_in_date)} />
              <Row
                label="Checked Out"
                value={
                  customer.check_out_date ? formatDateTime(customer.check_out_date) : 'Still staying'
                }
              />
              <Row
                label="Nights"
                value={nightsBetween(customer.check_in_date, customer.check_out_date)}
              />
            </dl>
          </div>

          <GuestsSection customer={customer} />

          <div className="card">
            <div className="section-title">ID Proof</div>
            <IdPhotoViewer customer={customer} />
            <p className="field-hint mb0">Tap a photo to open it full screen.</p>
          </div>

          <div className="btn-row mt">
            <button
              type="button"
              className="btn secondary"
              onClick={() => navigate(`/customers/${customer.id}/edit`)}
            >
              Edit
            </button>
            {customer.status === CUSTOMER_STATUS.CHECKED_IN ? (
              <button type="button" className="btn" onClick={handleCheckOut}>
                Check Out
              </button>
            ) : null}
          </div>
          <button type="button" className="btn danger block mt" onClick={handleDelete}>
            Delete Customer
          </button>
        </>
      ) : null}
    </Screen>
  );
}
