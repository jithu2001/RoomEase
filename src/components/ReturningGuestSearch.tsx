/**
 * Returning-guest lookup for the check-in screen.
 *
 * A guest who has stayed before should never have their details taken again:
 * type the phone number, tap the match, and the form fills itself with their
 * name, address and ID photos.
 *
 * Matches are grouped by phone number and show the most recent stay, so a guest
 * with six visits appears once rather than six times.
 */

import { useEffect, useState } from 'react';
import { InlineLoading } from './Feedback';
import { useServices } from '../context/ServicesContext';
import { formatDate } from '../utils/date';
import { logError } from '../utils/errors';
import type { GuestMatch } from '../types';

const MIN_TERM = 3;
const DEBOUNCE_MS = 250;

export function ReturningGuestSearch({
  onSelect,
  disabled,
}: {
  onSelect: (match: GuestMatch) => void;
  disabled?: boolean;
}) {
  const { customers } = useServices();
  const [term, setTerm] = useState('');
  const [matches, setMatches] = useState<GuestMatch[] | null>(null);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    const trimmed = term.trim();
    if (trimmed.length < MIN_TERM) {
      setMatches(null);
      setSearching(false);
      return;
    }

    let cancelled = false;
    setSearching(true);
    const timer = window.setTimeout(() => {
      customers
        .findReturningGuests(trimmed)
        .then((found) => {
          if (!cancelled) setMatches(found);
        })
        .catch((e) => {
          logError('returningGuestSearch', e);
          if (!cancelled) setMatches([]);
        })
        .finally(() => {
          if (!cancelled) setSearching(false);
        });
    }, DEBOUNCE_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [term, customers]);

  return (
    <div className="card">
      <div className="section-title mb0">Returning guest?</div>
      <p className="field-hint" style={{ marginBottom: '0.5rem' }}>
        Search by phone number to reuse a previous guest's details and ID photos.
      </p>

      <div className="search-bar">
        <input
          type="search"
          value={term}
          placeholder="Phone number or name"
          aria-label="Search previous guests"
          autoComplete="off"
          inputMode="tel"
          disabled={disabled}
          onChange={(e) => setTerm(e.target.value)}
        />
        {term ? (
          <button
            type="button"
            className="clear"
            aria-label="Clear guest search"
            onClick={() => setTerm('')}
          >
            ✕
          </button>
        ) : null}
      </div>

      {searching ? <InlineLoading label="Looking up…" /> : null}

      {!searching && matches && matches.length === 0 ? (
        <p className="small faint mb0">
          No previous guest found. Fill in the details below as a new guest.
        </p>
      ) : null}

      {!searching && matches && matches.length > 0 ? (
        <div className="row-list" style={{ marginTop: '0.25rem' }}>
          {matches.map((match) => (
            <button
              key={match.phone}
              type="button"
              className="row"
              disabled={disabled}
              onClick={() => onSelect(match)}
            >
              <span className="grow">
                <span className="primary-line">
                  <span className="name">{match.name}</span>
                </span>
                <span className="meta">
                  {match.phone} · {match.stay_count}{' '}
                  {match.stay_count === 1 ? 'stay' : 'stays'} · last{' '}
                  {formatDate(match.last_stay)}
                </span>
              </span>
              {match.has_id_photos ? (
                <span className="badge in">ID on file</span>
              ) : (
                <span className="badge out">No ID</span>
              )}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
