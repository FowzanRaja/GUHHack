import { addMonths, format } from 'date-fns';
import type { FinancialState } from '../types';
import { isoDate } from './dates';
import { poundsToPennies } from './money';

export function emptyState(): FinancialState {
  return {
    version: 1,
    customerName: '',
    currentBalance: 0,
    incomes: [],
    expenses: [],
    goals: [],
    manualPots: [],
    incomeOverrides: [],
    allocationOverrides: {},
    simplifiedMode: false,
    isDemo: false,
    lastUpdated: new Date().toISOString(),
  };
}

export function demoState(now = new Date()): FinancialState {
  return {
    ...emptyState(),
    customerName: 'Alex',
    currentBalance: poundsToPennies(1120),
    isDemo: true,
    incomes: [
      {
        id: 'income-salary',
        name: 'Salary',
        amount: poundsToPennies(1800),
        schedule: { kind: 'monthly', day: 25 },
      },
    ],
    expenses: [
      {
        id: 'expense-rent',
        name: 'Rent',
        amount: poundsToPennies(650),
        category: 'bills',
        essential: true,
        schedule: { kind: 'monthly', day: 1 },
      },
      {
        id: 'expense-phone',
        name: 'Phone bill',
        amount: poundsToPennies(30),
        category: 'bills',
        essential: true,
        schedule: { kind: 'monthly', day: 10 },
      },
      {
        id: 'expense-food',
        name: 'Food budget',
        amount: poundsToPennies(200),
        category: 'food',
        essential: false,
        schedule: { kind: 'monthly', day: 2 },
      },
      {
        id: 'expense-transport',
        name: 'Transport budget',
        amount: poundsToPennies(100),
        category: 'transport',
        essential: false,
        schedule: { kind: 'monthly', day: 3 },
      },
    ],
    goals: [
      {
        id: 'goal-holiday',
        name: 'Holiday',
        targetAmount: poundsToPennies(1000),
        currentAmount: 0,
        targetDate: isoDate(addMonths(now, 6)),
        colour: '#d2387c',
      },
    ],
    lastUpdated: new Date().toISOString(),
  };
}

export function describeScheduleDay(day: number): string {
  const suffix = day === 1 || day === 21 || day === 31 ? 'st' : day === 2 || day === 22 ? 'nd' : day === 3 || day === 23 ? 'rd' : 'th';
  return `${day}${suffix} of each month`;
}

export function demoLabel(state: FinancialState): string {
  return state.isDemo ? `Demo loaded ${format(new Date(state.lastUpdated), 'd MMM, HH:mm')}` : 'Your local plan';
}
