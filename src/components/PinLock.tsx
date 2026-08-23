/** Lock screen shown when an app PIN is configured. */

import { useState } from 'react';
import { Spinner } from './Feedback';
import { useServices } from '../context/ServicesContext';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'];

export function PinLock({ onUnlock }: { onUnlock: () => void }) {
  const { settings, hotel } = useServices();
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  const submit = async (value: string) => {
    setChecking(true);
    try {
      if (await settings.verifyPin(value)) {
        onUnlock();
      } else {
        setError('Incorrect PIN');
        setPin('');
      }
    } catch {
      setError('The PIN could not be checked. Please try again.');
      setPin('');
    } finally {
      setChecking(false);
    }
  };

  const press = (key: string) => {
    setError(null);
    if (key === '⌫') return setPin((p) => p.slice(0, -1));
    if (!key || pin.length >= 8) return;
    const next = pin + key;
    setPin(next);
  };

  return (
    <div className="center-screen">
      <div style={{ fontSize: '2rem' }} aria-hidden="true">
        🔒
      </div>
      <h2>{hotel.hotel_name || 'Hotel Manager'}</h2>
      <p className="muted small mb0">Enter your app PIN</p>

      <div className="pin-dots" aria-hidden="true">
        {Array.from({ length: Math.max(4, pin.length) }, (_, i) => (
          <span key={i} className={i < pin.length ? 'filled' : ''} />
        ))}
      </div>

      {error ? (
        <p className="small" style={{ color: 'var(--danger)' }} role="alert">
          {error}
        </p>
      ) : null}

      <div className="keypad">
        {KEYS.map((key, index) =>
          key ? (
            <button key={key} type="button" onClick={() => press(key)} disabled={checking}>
              {key}
            </button>
          ) : (
            <span key={`gap-${index}`} />
          ),
        )}
      </div>

      <button
        type="button"
        className="btn block mt"
        style={{ maxWidth: 280 }}
        disabled={pin.length < 4 || checking}
        onClick={() => submit(pin)}
      >
        {checking ? <Spinner small onBrand /> : 'Unlock'}
      </button>
    </div>
  );
}
