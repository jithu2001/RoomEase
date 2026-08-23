/** Form primitives that keep the error message next to its field. */

import type { ReactNode } from 'react';

interface BaseProps {
  id: string;
  label: string;
  error?: string;
  hint?: string;
  required?: boolean;
}

function Wrapper({
  id,
  label,
  error,
  hint,
  required,
  children,
}: BaseProps & { children: ReactNode }) {
  return (
    <div className={`field${error ? ' invalid' : ''}`}>
      <label htmlFor={id}>
        {label}
        {required ? <span className="req"> *</span> : null}
      </label>
      {children}
      {error ? (
        <span className="field-error" role="alert">
          {error}
        </span>
      ) : null}
      {!error && hint ? <span className="field-hint">{hint}</span> : null}
    </div>
  );
}

export function TextField({
  value,
  onChange,
  type = 'text',
  placeholder,
  autoComplete = 'off',
  inputMode,
  maxLength,
  ...base
}: BaseProps & {
  value: string;
  onChange: (value: string) => void;
  type?: 'text' | 'tel' | 'password';
  placeholder?: string;
  autoComplete?: string;
  inputMode?: 'text' | 'tel' | 'numeric';
  maxLength?: number;
}) {
  return (
    <Wrapper {...base}>
      <input
        id={base.id}
        type={type}
        value={value}
        placeholder={placeholder}
        autoComplete={autoComplete}
        inputMode={inputMode}
        maxLength={maxLength}
        aria-invalid={Boolean(base.error)}
        onChange={(e) => onChange(e.target.value)}
      />
    </Wrapper>
  );
}

export function TextAreaField({
  value,
  onChange,
  placeholder,
  rows = 3,
  maxLength,
  ...base
}: BaseProps & {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
  maxLength?: number;
}) {
  return (
    <Wrapper {...base}>
      <textarea
        id={base.id}
        value={value}
        rows={rows}
        placeholder={placeholder}
        maxLength={maxLength}
        aria-invalid={Boolean(base.error)}
        onChange={(e) => onChange(e.target.value)}
      />
    </Wrapper>
  );
}

export function NumberField({
  value,
  onChange,
  min = 1,
  max = 20,
  ...base
}: BaseProps & {
  value: string;
  onChange: (value: string) => void;
  min?: number;
  max?: number;
}) {
  return (
    <Wrapper {...base}>
      <input
        id={base.id}
        type="number"
        inputMode="numeric"
        value={value}
        min={min}
        max={max}
        step={1}
        aria-invalid={Boolean(base.error)}
        onChange={(e) => onChange(e.target.value)}
      />
    </Wrapper>
  );
}

/** Wrapper for non-input controls (room grid, photo pickers). */
export function FieldGroup({
  label,
  error,
  hint,
  required,
  children,
}: Omit<BaseProps, 'id'> & { children: ReactNode }) {
  return (
    <div className={`field${error ? ' invalid' : ''}`}>
      <label>
        {label}
        {required ? <span className="req"> *</span> : null}
      </label>
      {children}
      {error ? (
        <span className="field-error" role="alert">
          {error}
        </span>
      ) : null}
      {!error && hint ? <span className="field-hint">{hint}</span> : null}
    </div>
  );
}

/**
 * Local date + time picker.
 *
 * Uses the platform `datetime-local` control so Android shows its native
 * date/time wheels — far less error-prone on a phone than typed text.
 */
export function DateTimeField({
  value,
  onChange,
  max,
  ...base
}: BaseProps & {
  /** `YYYY-MM-DDTHH:mm` in local time. */
  value: string;
  onChange: (value: string) => void;
  max?: string;
}) {
  return (
    <Wrapper {...base}>
      <input
        id={base.id}
        type="datetime-local"
        value={value}
        max={max}
        aria-invalid={Boolean(base.error)}
        onChange={(e) => onChange(e.target.value)}
      />
    </Wrapper>
  );
}
