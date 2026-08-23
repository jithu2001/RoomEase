/**
 * The printable guest register for one date.
 *
 * This is the actual document: Android's print framework renders this very DOM,
 * so what is on screen is what comes out as PDF. `@media print` in index.css
 * hides the app chrome and keeps a booking from splitting across a page break.
 *
 * ID photos are referenced by their normal bridge URLs, not inlined as data
 * URLs — that is what keeps a report with a dozen photos cheap on a budget
 * phone.
 *
 * There is deliberately no amount anywhere in here.
 */

import { useEffect, useState } from 'react';
import { useServices } from '../context/ServicesContext';
import { formatDateTime } from '../utils/date';
import type { DayReport, ReportBooking, ReportGuest } from '../services/reportService';

/** Resolves one stored path to something an <img> can load. */
function useImageSrc(path: string | null): string | null {
  const { images } = useServices();
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    if (!path) {
      setSrc(null);
      return;
    }
    let cancelled = false;
    (async () => {
      const resolved = await images.displaySrc(path);
      if (!cancelled) setSrc(resolved);
    })();
    return () => {
      cancelled = true;
    };
  }, [images, path]);

  return src;
}

function IdImage({ path, label }: { path: string | null; label: string }) {
  const src = useImageSrc(path);
  return (
    <figure className="report-id">
      {src ? (
        <img src={src} alt={label} />
      ) : (
        <div className="report-id-missing">{path ? 'Photo unavailable' : 'Not collected'}</div>
      )}
      <figcaption>{label}</figcaption>
    </figure>
  );
}

function GuestBlock({ guest, index }: { guest: ReportGuest; index: number }) {
  const hasPhotos = Boolean(guest.id_front_path || guest.id_back_path);
  return (
    <div className="report-guest">
      <div className="report-guest-head">
        <span className="report-guest-no">{index + 2}</span>
        <span className="report-guest-name">{guest.name}</span>
        <span className="report-guest-phone">{guest.phone ?? 'No phone recorded'}</span>
      </div>
      {hasPhotos ? (
        <div className="report-ids">
          <IdImage path={guest.id_front_path} label="ID front" />
          <IdImage path={guest.id_back_path} label="ID back" />
        </div>
      ) : (
        <div className="report-note">No ID proof collected for this guest.</div>
      )}
    </div>
  );
}

function BookingBlock({ booking }: { booking: ReportBooking }) {
  const status = booking.departed_on_date
    ? 'Checked out this day'
    : booking.arrived_on_date
      ? 'Arrived this day'
      : 'Continuing stay';

  return (
    <article className="report-booking">
      <header className="report-booking-head">
        <span className="report-room">Room {booking.room_number}</span>
        <span className="report-code">{booking.customer_code}</span>
        <span className="report-status">{status}</span>
      </header>

      <table className="report-fields">
        <tbody>
          <tr>
            <th>Name</th>
            <td>{booking.name}</td>
          </tr>
          <tr>
            <th>Address</th>
            <td>{booking.address}</td>
          </tr>
          <tr>
            <th>Phone</th>
            <td>{booking.phone}</td>
          </tr>
          <tr>
            <th>Number of persons</th>
            <td>{booking.number_of_persons}</td>
          </tr>
          <tr>
            <th>Checked in</th>
            <td>{formatDateTime(booking.check_in_date)}</td>
          </tr>
          <tr>
            <th>Checked out</th>
            <td>
              {booking.check_out_date ? formatDateTime(booking.check_out_date) : 'Still staying'}
            </td>
          </tr>
        </tbody>
      </table>

      <div className="report-subhead">ID proof — {booking.name}</div>
      <div className="report-ids">
        <IdImage path={booking.id_front_path} label="ID front" />
        <IdImage path={booking.id_back_path} label="ID back" />
      </div>

      {booking.guests.length > 0 ? (
        <>
          <div className="report-subhead">
            Other guests in this room ({booking.guests.length} recorded of{' '}
            {Math.max(0, booking.number_of_persons - 1)})
          </div>
          {booking.guests.map((guest, index) => (
            <GuestBlock key={`${booking.customer_code}-${index}`} guest={guest} index={index} />
          ))}
        </>
      ) : booking.number_of_persons > 1 ? (
        <div className="report-note">
          No details recorded for the other {booking.number_of_persons - 1}{' '}
          {booking.number_of_persons - 1 === 1 ? 'person' : 'people'} in this room.
        </div>
      ) : null}
    </article>
  );
}

export function ReportDocument({ report }: { report: DayReport }) {
  return (
    <div className="report-doc">
      <header className="report-head">
        <h1>{report.hotel_name}</h1>
        {report.hotel_address ? <p className="report-sub">{report.hotel_address}</p> : null}
        {report.hotel_phone ? <p className="report-sub">Phone: {report.hotel_phone}</p> : null}
        <h2>Guest Report — {report.day_label}</h2>
        <p className="report-sub">
          {report.totals.bookings} {report.totals.bookings === 1 ? 'booking' : 'bookings'} ·{' '}
          {report.totals.rooms} {report.totals.rooms === 1 ? 'room' : 'rooms'} ·{' '}
          {report.totals.people} {report.totals.people === 1 ? 'person' : 'people'} ·{' '}
          {report.totals.arrivals} arrived · {report.totals.departures} departed
        </p>
      </header>

      {report.bookings.map((booking) => (
        <BookingBlock key={booking.customer_code} booking={booking} />
      ))}

      <footer className="report-foot">
        Generated {formatDateTime(report.generated_at)} · {report.hotel_name}
      </footer>
    </div>
  );
}
