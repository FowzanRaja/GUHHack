import { useEffect, useState } from 'react';
import { penniesToPounds, poundsToPennies } from '../lib/money';

interface MoneyInputProps {
  id: string;
  label: string;
  value: number;
  onChange: (value: number) => void;
  hint?: string;
  required?: boolean;
}

export function MoneyInput({ id, label, value, onChange, hint, required }: MoneyInputProps) {
  const [draft, setDraft] = useState(String(penniesToPounds(value)));
  useEffect(() => setDraft(String(penniesToPounds(value))), [value]);
  return (
    <label htmlFor={id} className="form-field">
      <span className="form-label">{label}</span>
      <span className="money-input-wrap">
        <span aria-hidden="true">£</span>
        <input
          id={id}
          inputMode="decimal"
          type="number"
          min="0"
          step="0.01"
          value={draft}
          required={required}
          onChange={(event) => {
            setDraft(event.target.value);
            onChange(poundsToPennies(event.target.value));
          }}
          className="money-input focus-ring"
        />
      </span>
      {hint && <span className="form-hint">{hint}</span>}
    </label>
  );
}
