/**
 * One ID side: Take Photo / Choose Photo, preview, retake.
 * Compression happens here, before anything is handed to the form.
 */

import { useState } from 'react';
import { FieldGroup } from './Field';
import { Spinner } from './Feedback';
import { useToast } from './ToastProvider';
import { captureIdImage, type CaptureSource } from '../services/imageService';
import { formatBytes } from '../utils/imageCompression';
import type { PreparedImage } from '../types';

export function IdPhotoField({
  label,
  value,
  existingSrc,
  onChange,
  error,
  disabled,
  required = true,
}: {
  label: string;
  /** A newly captured + compressed image, if any. */
  value: PreparedImage | null;
  /** Already-stored image shown while editing, until a new one is captured. */
  existingSrc?: string | null;
  onChange: (image: PreparedImage | null) => void;
  error?: string;
  disabled?: boolean;
  /** Companion ID photos are optional, so the asterisk is suppressed. */
  required?: boolean;
}) {
  const toast = useToast();
  const [busy, setBusy] = useState<CaptureSource | null>(null);

  const capture = async (source: CaptureSource) => {
    if (busy) return;
    setBusy(source);
    try {
      const image = await captureIdImage(source);
      if (image) {
        onChange(image);
        toast.success(`${label} captured (${formatBytes(image.bytes)})`);
      }
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(null);
    }
  };

  const previewSrc = value?.previewDataUrl ?? existingSrc ?? null;
  const isNew = Boolean(value);

  return (
    <FieldGroup label={label} required={required} error={error}>
      <div className="picker-box">
        {previewSrc ? (
          <img className="picker-preview" src={previewSrc} alt={`${label} preview`} />
        ) : (
          <div className="picker-empty">
            No photo yet.
            <br />
            Take or choose the {label.toLowerCase()} photo.
          </div>
        )}

        {isNew && value ? (
          <div className="picker-caption">
            Compressed to {value.width}×{value.height} · {formatBytes(value.bytes)}
          </div>
        ) : null}
        {!isNew && previewSrc ? <div className="picker-caption">Saved photo</div> : null}

        <div className="btn-row">
          <button
            type="button"
            className="btn secondary small"
            disabled={disabled || busy !== null}
            onClick={() => capture('camera')}
          >
            {busy === 'camera' ? <Spinner small /> : '📷'}{' '}
            {previewSrc ? 'Retake' : 'Take Photo'}
          </button>
          <button
            type="button"
            className="btn secondary small"
            disabled={disabled || busy !== null}
            onClick={() => capture('gallery')}
          >
            {busy === 'gallery' ? <Spinner small /> : '🖼️'}{' '}
            {previewSrc ? 'Reselect' : 'Choose Photo'}
          </button>
        </div>

        {isNew ? (
          <button
            type="button"
            className="btn ghost small mt"
            disabled={disabled}
            onClick={() => onChange(null)}
          >
            Discard this photo
          </button>
        ) : null}
      </div>
    </FieldGroup>
  );
}
