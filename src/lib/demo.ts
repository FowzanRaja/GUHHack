import { addMonths, format } from 'date-fns';
import type { FinancialState } from '../types';
import { isoDate } from './dates';
import { poundsToPennies } from './money';

export function emptyState(): FinancialState {
  return {
    version: 3,
    customerName: '',
    currentBalance: null,
    balanceAsOf: null,
    incomes: [],
    expenses: [],
    goals: [],
    manualPots: [],
    incomeOverrides: [],
    allocationOverrides: {},
    emergencyFundContribution: null,
    conversation: {
      history: [
        {
          id: 'welcome-empty',
          role: 'assistant',
          text: 'Hi! Tell me about your income, regular bills and what you want to save for. I’ll organise the details for you to review.',
          timestamp: new Date().toISOString(),
        },
      ],
    },
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
    balanceAsOf: isoDate(now),
    emergencyFundContribution: poundsToPennies(75),
    isDemo: true,
    conversation: {
      history: [
        {
          id: 'welcome-demo',
          role: 'assistant',
          text: 'The original demo plan is loaded. Tell me what has changed and I’ll show the impact before anything is saved.',
          timestamp: now.toISOString(),
        },
      ],
    },
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
