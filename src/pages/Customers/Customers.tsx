/** Customer list with search, status filters and incremental loading. */

import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Screen } from '../../components/Layout';
import { EmptyState, ErrorState, InlineLoading } from '../../components/Feedback';
import { useServices } from '../../context/ServicesContext';
import { useAsyncData } from '../../hooks/useAsyncData';
import { formatDate } from '../../utils/date';
import { CUSTOMER_STATUS, type CustomerFilter } from '../../types';

const PAGE_SIZE = 25;

const FILTERS: { value: CustomerFilter; label: string }[] = [
  { value: 'ALL', label: 'All' },
  { value: 'CHECKED_IN', label: 'Staying' },
  { value: 'CHECKED_OUT', label: 'Checked Out' },
];

export function Customers() {
  const { customers, dataVersion } = useServices();
  // `?q=` lets other screens (e.g. the room board) deep-link into a search.
  const [params] = useSearchParams();
  const initialQuery = params.get('q') ?? '';
  const [rawSearch, setRawSearch] = useState(initialQuery);
  const [search, setSearch] = useState(initialQuery);
  const [filter, setFilter] = useState<CustomerFilter>('ALL');
  const [limit, setLimit] = useState(PAGE_SIZE);

  // Debounce so each keystroke does not hit SQLite.
  useEffect(() => {
    const timer = window.setTimeout(() => setSearch(rawSearch.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [rawSearch]);

  useEffect(() => setLimit(PAGE_SIZE), [search, filter]);

  const state = useAsyncData(
    () => customers.search({ search, filter, limit, offset: 0 }),
    [customers, search, filter, limit, dataVersion],
    'customerList',
  );

  const page = state.data;
  const isFiltered = search.length > 0 || filter !== 'ALL';

  return (
    <Screen title="Customers" subtitle={page ? `${page.total} records` : undefined}>
      <div className="search-bar">
        <input
          type="search"
          value={rawSearch}
          placeholder="Search name, phone, room or code"
          aria-label="Search customers"
          autoComplete="off"
          onChange={(e) => setRawSearch(e.target.value)}
        />
        {rawSearch ? (
          <button type="button" className="clear" aria-label="Clear search" onClick={() => setRawSearch('')}>
            ✕
          </button>
        ) : null}
      </div>

      <div className="filter-tabs" role="tablist">
        {FILTERS.map((option) => (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={filter === option.value}
            className={filter === option.value ? 'active' : ''}
            onClick={() => setFilter(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>

      {state.error ? <ErrorState message={state.error} onRetry={state.reload} /> : null}
      {state.loading && !page ? <InlineLoading label="Loading customers…" /> : null}

      {page && page.items.length === 0 && !state.loading ? (
        <div className="card">
          <EmptyState
            glyph={isFiltered ? '🔍' : '👥'}
            title={isFiltered ? 'No customers found' : 'No customers yet'}
            message={
              isFiltered
                ? 'Try a different name, phone number, room or customer code.'
                : 'Check in your first guest to see them here.'
            }
            action={
              isFiltered ? (
                <button
                  type="button"
                  className="btn secondary"
                  onClick={() => {
                    setRawSearch('');
                    setFilter('ALL');
                  }}
                >
                  Clear search
                </button>
              ) : (
                <Link className="btn" to="/check-in">
                  New Check-In
                </Link>
              )
            }
          />
        </div>
      ) : null}

      {page && page.items.length > 0 ? (
        <>
          <div className="card flush">
            <div className="row-list">
              {page.items.map((customer) => (
                <Link key={customer.id} className="row" to={`/customers/${customer.id}`}>
                  <span className="room-pill">{customer.room_number}</span>
                  <span className="grow">
                    <span className="primary-line">
                      <span className="name">{customer.name}</span>
                    </span>
                    <span className="meta">
                      {customer.phone} · {customer.number_of_persons}{' '}
                      {customer.number_of_persons === 1 ? 'person' : 'persons'} ·{' '}
                      {formatDate(customer.check_in_date)}
                    </span>
                  </span>
                  <span
                    className={`badge ${customer.status === CUSTOMER_STATUS.CHECKED_IN ? 'in' : 'out'}`}
                  >
                    {customer.status === CUSTOMER_STATUS.CHECKED_IN ? 'In' : 'Out'}
                  </span>
                  <span className="chev" aria-hidden="true">
                    ›
                  </span>
                </Link>
              ))}
            </div>
          </div>

          {page.hasMore ? (
            <button
              type="button"
              className="btn secondary block"
              disabled={state.loading}
              onClick={() => setLimit((l) => l + PAGE_SIZE)}
            >
              {state.loading ? 'Loading…' : `Load more (${page.total - page.items.length} left)`}
            </button>
          ) : (
            <p className="small faint center">
              Showing all {page.items.length} of {page.total} records
            </p>
          )}
        </>
      ) : null}
    </Screen>
  );
}
