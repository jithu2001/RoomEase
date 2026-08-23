/**
 * Promise-based confirmation dialog, used for every destructive action.
 * `const ok = await confirm({...})` keeps call sites readable.
 */

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

export interface ConfirmOptions {
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  /** When set, the user must type this exact text before confirming. */
  requirePhrase?: string;
}

type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const [phrase, setPhrase] = useState('');
  const resolver = useRef<((value: boolean) => void) | null>(null);

  const confirm = useCallback<ConfirmFn>((next) => {
    setPhrase('');
    setOptions(next);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const settle = useCallback((value: boolean) => {
    setOptions(null);
    setPhrase('');
    resolver.current?.(value);
    resolver.current = null;
  }, []);

  const api = useMemo(() => confirm, [confirm]);
  const phraseOk = !options?.requirePhrase || phrase.trim() === options.requirePhrase;

  return (
    <ConfirmContext.Provider value={api}>
      {children}
      {options ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label={options.title}>
          <div className="modal">
            <h2>{options.title}</h2>
            <div className="muted small">{options.message}</div>
            {options.requirePhrase ? (
              <div className="field mt">
                <label htmlFor="confirm-phrase">
                  Type <span className="mono strong">{options.requirePhrase}</span> to continue
                </label>
                <input
                  id="confirm-phrase"
                  value={phrase}
                  autoComplete="off"
                  autoCapitalize="characters"
                  onChange={(e) => setPhrase(e.target.value)}
                />
              </div>
            ) : null}
            <div className="btn-row">
              <button type="button" className="btn secondary" onClick={() => settle(false)}>
                {options.cancelLabel ?? 'Cancel'}
              </button>
              <button
                type="button"
                className={`btn${options.danger ? ' danger' : ''}`}
                disabled={!phraseOk}
                onClick={() => settle(true)}
              >
                {options.confirmLabel ?? 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): ConfirmFn {
  const confirm = useContext(ConfirmContext);
  if (!confirm) throw new Error('useConfirm must be used inside <ConfirmProvider>');
  return confirm;
}
