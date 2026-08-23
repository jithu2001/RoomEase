/**
 * Guest report for a chosen date, printable as a PDF.
 *
 * The document below is the real thing: Android's print framework renders this
 * DOM, so the preview on screen and the saved PDF cannot drift apart.
 */

import { useState } from 'react';
import { Screen } from '../../components/Layout';
import { EmptyState, ErrorState, InlineLoading, Notice, Spinner } from '../../components/Feedback';
import { ReportDocument } from '../../components/ReportDocument';
import { useToast } from '../../components/ToastProvider';
import { useServices } from '../../context/ServicesContext';
import { useAsyncData } from '../../hooks/useAsyncData';
import { toDayKey } from '../../utils/date';
import { canPrint, printCurrentView } from '../../services/pdfPrinter';

export function Reports() {
  const { reports, dataVersion } = useServices();
  const toast = useToast();
  const [day, setDay] = useState(() => toDayKey());
  const [printing, setPrinting] = useState(false);

  const state = useAsyncData(
    () => reports.buildDayReport(day),
    [reports, day, dataVersion],
    'dayReport',
  );

  const report = state.data;
  const hasBookings = (report?.bookings.length ?? 0) > 0;

  const print = async () => {
    if (!report) return;
    setPrinting(true);
    try {
      await printCurrentView(`Guest Report ${report.day}`);
    } catch (e) {
      toast.error(e);
    } finally {
      setPrinting(false);
    }
  };

  return (
    <Screen title="Guest Report" subtitle={report?.day_label}>
      <div className="card no-print">
        <div className="field">
          <label htmlFor="report-day">Report date</label>
          <input
            id="report-day"
            type="date"
            value={day}
            max={toDayKey()}
            onChange={(e) => setDay(e.target.value || toDayKey())}
          />
          <span className="field-hint">
            Everyone whose stay covered this date, including guests who arrived earlier and had not
            yet checked out.
          </span>
        </div>

        <button
          type="button"
          className="btn block"
          disabled={!hasBookings || printing || state.loading}
          onClick={print}
        >
          {printing ? (
            <>
              <Spinner small onBrand /> Opening print…
            </>
          ) : canPrint() ? (
            'Print / Save as PDF'
          ) : (
            'Print (browser)'
          )}
        </button>
        <p className="field-hint mb0">
          Choose <strong>Save as PDF</strong> in the Android print sheet, or send it straight to a
          printer. Payment amounts are never included in this report.
        </p>
      </div>

      {state.loading && !report ? <InlineLoading label="Building report…" /> : null}
      {state.error ? (
        <div className="no-print">
          <ErrorState message={state.error} onRetry={state.reload} />
        </div>
      ) : null}

      {report && !hasBookings ? (
        <div className="card no-print">
          <EmptyState
            glyph="📄"
            title="No guests on this date"
            message={`Nobody was staying on ${report.day_label}. Pick another date.`}
          />
        </div>
      ) : null}

      {report && hasBookings ? (
        <>
          <div className="no-print">
            <Notice kind="info">Preview below — this is exactly what will be printed.</Notice>
          </div>
          <ReportDocument report={report} />
        </>
      ) : null}
    </Screen>
  );
}
