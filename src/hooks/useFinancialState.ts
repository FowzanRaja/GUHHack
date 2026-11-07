import { useCallback, useEffect, useState } from 'react';
import type { FinancialState } from '../types';
import { demoState, emptyState } from '../lib/demo';

const STORAGE_KEY = 'cora-smart-pots:v1';

function loadState(): FinancialState {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return emptyState();
    const parsed = JSON.parse(saved) as FinancialState;
    return parsed.version === 1 ? parsed : emptyState();
  } catch {
    return emptyState();
  }
}

export function useFinancialState() {
  const [state, setState] = useState<FinancialState>(loadState);
  const [announcement, setAnnouncement] = useState('');

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state]);

  const update = useCallback((updater: FinancialState | ((current: FinancialState) => FinancialState), message?: string) => {
    setState((current) => {
      const next = typeof updater === 'function' ? updater(current) : updater;
      return { ...next, lastUpdated: new Date().toISOString() };
    });
    if (message) setAnnouncement(message);
  }, []);

  const loadDemo = useCallback(() => {
    update(demoState(), 'Demo plan loaded. All dashboard figures and calendar events have been recalculated.');
  }, [update]);

  const reset = useCallback(() => {
    update(emptyState(), 'The local prototype data has been reset.');
  }, [update]);

  return { state, update, loadDemo, reset, announcement };
}
