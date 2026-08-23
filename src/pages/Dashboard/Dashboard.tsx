/** Home screen: today's numbers, who is staying, and a backup nudge. */

import { Link } from 'react-router-dom';
import { Screen } from '../../components/Layout';
import { EmptyState, ErrorState, InlineLoading, Notice } from '../../components/Feedback';
import { useServices } from '../../context/ServicesContext';
import { useAsyncData } from '../../hooks/useAsyncData';
import { formatDateTime, formatTime, nightsBetween } from '../../utils/date';

const BACKUP_REMINDER_DAYS = 7;

export function Dashboard() {
  const { customers, hotel, dataVersion } = useServices();

  const state = useAsyncData(
    async () => ({
      stats: await customers.dashboard(),
      staying: (await customers.listActive()).slice(0, 6),
    }),
    [customers, dataVersion],
    'dashboard',
  );

  const daysSinceBackup = hotel.last_backup_at
    ? nightsBetween(hotel.last_backup_at)
    : null;
  const backupOverdue = daysSinceBackup === null || daysSinceBackup >= BACKUP_REMINDER_DAYS;

  return (
    <Screen title={hotel.hotel_name || 'Hotel Dashboard'} subtitle="Dashboard">
      {state.loading && !state.data ? <InlineLoading label="Loading today's numbers…" /> : null}
      {state.error ? <ErrorState message={state.error} onRetry={state.reload} /> : null}

      {state.data ? (
        <>
          <div className="stat-grid">
            <div className="stat">
              <div className="value">{state.data.stats.currently_staying}</div>
              <div className="label">Currently Staying</div>
            </div>
            <div className="stat accent">
              <div className="value">{state.data.stats.available_rooms}</div>
              <div className="label">Available Rooms</div>
            </div>
            <div className="stat">
              <div className="value">{state.data.stats.todays_check_ins}</div>
              <div className="label">Today's Check-ins</div>
            </div>
            <div className="stat warn">
              <div className="value">{state.data.stats.todays_check_outs}</div>
              <div className="label">Today's Check-outs</div>
            </div>
          </div>

          <div className="card tight spread">
            <div>
              <div className="strong">{state.data.stats.active_guests} total active guests</div>
              <div className="small muted">
                {state.data.stats.occupied_rooms} of {state.data.stats.total_rooms} rooms occupied
              </div>
            </div>
            <Link className="btn small" to="/check-in">
              New Check-In
            </Link>
          </div>

          {backupOverdue ? (
            <Notice kind="warn">
              {hotel.last_backup_at
                ? `Last backup you exported: ${formatDateTime(hotel.last_backup_at)}. `
                : 'You have not exported a backup yet. '}
              Customer data lives only on this device, so{' '}
              <Link to="/settings">export a backup</Link> and copy the file to a computer or SD
              card.
            </Notice>
          ) : null}

          <Link className="card row" to="/reports" style={{ marginBottom: '0.75rem' }}>
            <span className="grow">
              <span className="primary-line">Guest report</span>
              <span className="meta">Printable register for any date, as PDF</span>
            </span>
            <span className="chev" aria-hidden="true">
              ›
            </span>
          </Link>

          <div className="section-title">
            <span>Currently Staying</span>
            <Link className="small" to="/customers">
              View all
            </Link>
          </div>

          {state.data.staying.length === 0 ? (
            <div className="card">
              <EmptyState
                glyph="🛏️"
                title="No guests are staying right now"
                message="Every room is free. Start a check-in when the next guest arrives."
                action={
                  <Link className="btn" to="/check-in">
                    New Check-In
                  </Link>
                }
              />
            </div>
          ) : (
            <div className="card flush">
              <div className="row-list">
                {state.data.staying.map((customer) => (
                  <Link key={customer.id} className="row" to={`/customers/${customer.id}`}>
                    <span className="room-pill">{customer.room_number}</span>
                    <span className="grow">
                      <span className="primary-line">
                        <span className="name">{customer.name}</span>
                      </span>
                      <span className="meta">
                        Since {formatTime(customer.check_in_date)} ·{' '}
                        {customer.number_of_persons}{' '}
                        {customer.number_of_persons === 1 ? 'person' : 'persons'}
                      </span>
                    </span>
                    <span className="chev" aria-hidden="true">
                      ›
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </>
      ) : null}
    </Screen>
  );
}
