import { useCallback, useEffect, useState } from 'react';
import type { FinancialState } from '../types';
import { demoState, emptyState } from '../lib/demo';

const STORAGE_KEY = 'cora-smart-pots:v1';

function loadState(): FinancialState {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return emptyState();
    return migrateState(JSON.parse(saved) as Partial<Omit<FinancialState, 'version'>> & { version?: number });
  } catch {
    return emptyState();
  }
}

export function migrateState(saved: Partial<Omit<FinancialState, 'version'>> & { version?: number }): FinancialState {
  const defaults = emptyState();
  if (saved.version !== 1 && saved.version !== 2 && saved.version !== 3) return defaults;
  const migratedBalanceDate = typeof saved.balanceAsOf === 'string'
    ? saved.balanceAsOf
    : typeof saved.currentBalance === 'number' && typeof saved.lastUpdated === 'string'
      ? saved.lastUpdated.slice(0, 10)
      : null;
  return {
    ...defaults,
    ...saved,
    version: 3,
    currentBalance: typeof saved.currentBalance === 'number' ? saved.currentBalance : null,
    balanceAsOf: migratedBalanceDate,
    emergencyFundContribution: typeof saved.emergencyFundContribution === 'number' ? saved.emergencyFundContribution : null,
    emergencyFundOrigin: saved.emergencyFundOrigin === 'customer' || saved.emergencyFundOrigin === 'cora' || saved.emergencyFundOrigin === 'existing'
      ? saved.emergencyFundOrigin
      : typeof saved.emergencyFundContribution === 'number' ? 'existing' : undefined,
    emergencyFundPaused: saved.emergencyFundPaused === true,
    conversation: saved.conversation && Array.isArray(saved.conversation.history)
      ? { history: saved.conversation.history.slice(-24), pending: saved.conversation.pending, proposal: saved.conversation.proposal }
      : defaults.conversation,
    incomes: Array.isArray(saved.incomes) ? saved.incomes : [],
    expenses: Array.isArray(saved.expenses) ? saved.expenses : [],
    goals: Array.isArray(saved.goals) ? saved.goals : [],
    manualPots: Array.isArray(saved.manualPots) ? saved.manualPots : [],
    incomeOverrides: Array.isArray(saved.incomeOverrides) ? saved.incomeOverrides : [],
    allocationOverrides: saved.allocationOverrides ?? {},
  };
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
