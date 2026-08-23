/**
 * ID photo display for the customer detail screen.
 *
 * Lists show nothing; this screen shows the small thumbnails and only loads the
 * full-size JPEG when the staff member actually taps one open.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Spinner } from './Feedback';
import { useServices } from '../context/ServicesContext';
import type { Customer } from '../types';

interface Slot {
  label: string;
  fullPath: string;
  thumbPath: string | null;
}

export function IdPhotoViewer({ customer }: { customer: Customer }) {
  const { images } = useServices();
  const [thumbs, setThumbs] = useState<Record<string, string | null>>({});
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<Slot | null>(null);
  const [fullSrc, setFullSrc] = useState<string | null>(null);
  const [fullError, setFullError] = useState<string | null>(null);

  // Memoised so the loader effect can depend on it directly instead of on a
  // hand-listed subset of customer fields.
  const slots = useMemo<Slot[]>(
    () => [
      {
        label: 'ID Front',
        fullPath: customer.id_front_path,
        thumbPath: customer.id_front_thumb_path,
      },
      {
        label: 'ID Back',
        fullPath: customer.id_back_path,
        thumbPath: customer.id_back_thumb_path,
      },
    ],
    [
      customer.id_front_path,
      customer.id_front_thumb_path,
      customer.id_back_path,
      customer.id_back_thumb_path,
    ],
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      const next: Record<string, string | null> = {};
      for (const slot of slots) {
        next[slot.label] = await images.previewSrc(slot.thumbPath, slot.fullPath);
      }
      if (!cancelled) {
        setThumbs(next);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // Re-runs whenever a stored path changes, e.g. after replacing a photo.
  }, [images, slots]);

  const openSlot = useCallback(
    async (slot: Slot) => {
      setOpen(slot);
      setFullSrc(null);
      setFullError(null);
      const src = await images.displaySrc(slot.fullPath);
      if (src) setFullSrc(src);
      else setFullError('This photo is no longer stored on this device.');
    },
    [images],
  );

  return (
    <>
      <div className="id-pair">
        {slots.map((slot) => {
          const src = thumbs[slot.label];
          return (
            <div key={slot.label}>
              <div className="id-label">{slot.label}</div>
              <button
                type="button"
                className="id-thumb"
                onClick={() => openSlot(slot)}
                aria-label={`Open ${slot.label} photo`}
              >
                {loading ? (
                  <div className="missing">
                    <Spinner small />
                  </div>
                ) : src ? (
                  <img src={src} alt={`${slot.label} of ${customer.customer_code}`} />
                ) : (
                  <div className="missing">Photo missing on this device</div>
                )}
              </button>
            </div>
          );
        })}
      </div>

      {open ? (
        <div className="image-viewer" role="dialog" aria-modal="true" aria-label={open.label}>
          <header>
            <span className="grow">{open.label}</span>
            <button
              type="button"
              className="icon-button"
              onClick={() => setOpen(null)}
              aria-label="Close photo"
            >
              ✕
            </button>
          </header>
          <div className="canvas">
            {fullError ? (
              <p className="faint">{fullError}</p>
            ) : fullSrc ? (
              <img src={fullSrc} alt={`${open.label} full size`} />
            ) : (
              <Spinner onBrand />
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}
