/** Optional app PIN. Only a salted SHA-256 digest is stored, never the PIN. */

import { useState } from 'react';
import { TextField } from '../../components/Field';
import { useToast } from '../../components/ToastProvider';
import { useServices } from '../../context/ServicesContext';
import { validatePin } from '../../utils/validation';

export function PinSettings() {
  const { settings, hotel, reloadHotel } = useServices();
  const toast = useToast();
  const enabled = Boolean(hotel.pin_hash);

  const [mode, setMode] = useState<'idle' | 'set' | 'remove'>('idle');
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setMode('idle');
    setPin('');
    setConfirmPin('');
    setError(undefined);
  };

  const savePin = async () => {
    const problem = validatePin(pin);
    if (problem) return setError(problem);
    if (pin !== confirmPin) return setError('The two PINs do not match');

    setSaving(true);
    try {
      await settings.setPin(pin);
      await reloadHotel();
      reset();
      toast.success(enabled ? 'App PIN changed' : 'App PIN enabled');
    } catch (e) {
      toast.error(e);
    } finally {
      setSaving(false);
    }
  };

  const removePin = async () => {
    setSaving(true);
    try {
      await settings.clearPin(pin);
      await reloadHotel();
      reset();
      toast.success('App PIN removed');
    } catch {
      // clearPin only fails on a wrong PIN; nothing else to report.
      setError('That PIN is incorrect');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="section-title">App Lock</div>
      <div className="card">
        <p className="small muted">
          {enabled
            ? 'A PIN is required each time the app is opened.'
            : 'Add a PIN so customer details and ID photos are not visible to anyone who picks up the phone.'}
        </p>

        {mode === 'idle' ? (
          <div className="btn-row">
            <button type="button" className="btn secondary" onClick={() => setMode('set')}>
              {enabled ? 'Change PIN' : 'Enable PIN'}
            </button>
            {enabled ? (
              <button type="button" className="btn secondary" onClick={() => setMode('remove')}>
                Remove PIN
              </button>
            ) : null}
          </div>
        ) : null}

        {mode === 'set' ? (
          <>
            <TextField
              id="new-pin"
              label="New PIN (4–8 digits)"
              type="password"
              inputMode="numeric"
              value={pin}
              error={error}
              maxLength={8}
              onChange={(v) => {
                setPin(v.replace(/\D/g, ''));
                setError(undefined);
              }}
            />
            <TextField
              id="confirm-pin"
              label="Confirm PIN"
              type="password"
              inputMode="numeric"
              value={confirmPin}
              maxLength={8}
              onChange={(v) => setConfirmPin(v.replace(/\D/g, ''))}
            />
            <div className="btn-row">
              <button type="button" className="btn secondary" onClick={reset} disabled={saving}>
                Cancel
              </button>
              <button type="button" className="btn" onClick={savePin} disabled={saving}>
                {saving ? 'Saving…' : 'Save PIN'}
              </button>
            </div>
          </>
        ) : null}

        {mode === 'remove' ? (
          <>
            <TextField
              id="current-pin"
              label="Enter the current PIN"
              type="password"
              inputMode="numeric"
              value={pin}
              error={error}
              maxLength={8}
              onChange={(v) => {
                setPin(v.replace(/\D/g, ''));
                setError(undefined);
              }}
            />
            <div className="btn-row">
              <button type="button" className="btn secondary" onClick={reset} disabled={saving}>
                Cancel
              </button>
              <button type="button" className="btn danger" onClick={removePin} disabled={saving}>
                Remove PIN
              </button>
            </div>
          </>
        ) : null}
      </div>
    </>
  );
}
