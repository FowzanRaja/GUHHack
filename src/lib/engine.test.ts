import { describe, expect, it } from 'vitest';
import { endOfMonth } from 'date-fns';
import { previewAssistantAction } from './actions';
import { calendarEvents, calculatePlan, dailyForecast, goalContributionSchedule, projectGoal } from './engine';
import { migrateState } from '../hooks/useFinancialState';
import { demoState, emptyState } from './demo';
import { isoDate, monthlyOccurrence, scheduleDates } from './dates';
import { poundsToPennies } from './money';

describe('financial scheduling', () => {
  it('uses the last day of short months for a monthly 31st schedule', () => {
    expect(isoDate(monthlyOccurrence(2027, 1, 31))).toBe('2027-02-28');
    expect(isoDate(monthlyOccurrence(2028, 1, 31))).toBe('2028-02-29');
    expect(scheduleDates({ kind: 'monthly', day: 31 }, new Date(2027, 0, 1), endOfMonth(new Date(2027, 2, 1))).map(isoDate)).toEqual([
      '2027-01-31', '2027-02-28', '2027-03-31',
    ]);
  });

  it('generates weekly, fortnightly and interval occurrences from explicit anchors', () => {
    const from = new Date(2027, 0, 1);
    const to = new Date(2027, 0, 31);
    expect(scheduleDates({ kind: 'weekly', anchorDate: '2027-01-04' }, from, to)).toHaveLength(4);
    expect(scheduleDates({ kind: 'fortnightly', anchorDate: '2027-01-04' }, from, to)).toHaveLength(2);
    expect(scheduleDates({ kind: 'interval', anchorDate: '2027-01-01', everyDays: 10 }, from, to).map(isoDate)).toEqual([
      '2027-01-01', '2027-01-11', '2027-01-21', '2027-01-31',
    ]);
  });
});

describe('plan calculation', () => {
  const now = new Date(2026, 10, 7, 12);

  it('balances the demo plan using actual expenses and does not exceed income', () => {
    const state = demoState(now);
    const plan = calculatePlan(state, now);
    expect(plan.expectedIncome).toBe(poundsToPennies(1800));
    expect(plan.essentialCommitments).toBe(poundsToPennies(680));
    expect(plan.everydayNeeds).toBe(poundsToPennies(300));
    expect(plan.totalAllocated).toBe(poundsToPennies(1800));
    expect(plan.shortfall).toBe(0);
    expect(plan.pots.every((pot) => pot.allocation >= 0)).toBe(true);
  });

  it('calculates goal contributions from real eligible income events', () => {
    const state = demoState(now);
    const projection = projectGoal(state, state.goals[0], now);
    expect(projection.eligibleIncomeCount).toBe(6);
    expect(projection.contributionPerIncome).toBe(16667);
    expect(projection.projectedDate).toBe('2027-04-25');
  });

  it('recalculates all allocations after a confirmed temporary income change', () => {
    const state = demoState(now);
    const preview = previewAssistantAction(state, {
      type: 'temporary_income_change',
      summary: 'Lower pay this month',
      incomeSourceId: 'income-salary',
      amount: poundsToPennies(1200),
    }, now);
    expect(preview.beforePlan.expectedIncome).toBe(poundsToPennies(1800));
    expect(preview.afterPlan.expectedIncome).toBe(poundsToPennies(1200));
    expect(preview.afterPlan.essentialCommitments).toBe(preview.beforePlan.essentialCommitments);
    expect(preview.afterPlan.totalAllocated).toBe(poundsToPennies(1200));
    expect(preview.afterPlan.flexibleSpending).toBeLessThan(preview.beforePlan.flexibleSpending);
    expect(state.incomeOverrides).toHaveLength(0);
    expect(preview.nextState.incomeOverrides).toHaveLength(1);
  });

  it('shows an explicit shortfall without negative or hidden essential Pots', () => {
    const state = emptyState();
    state.incomes = [{ id: 'pay', name: 'Pay', amount: poundsToPennies(500), schedule: { kind: 'monthly', day: 25 } }];
    state.expenses = [{ id: 'rent', name: 'Rent', amount: poundsToPennies(700), schedule: { kind: 'monthly', day: 1 }, category: 'bills', essential: true }];
    const plan = calculatePlan(state, now);
    expect(plan.shortfall).toBe(poundsToPennies(200));
    expect(plan.pots.find((pot) => pot.id === 'category-bills')?.allocation).toBe(poundsToPennies(700));
    expect(plan.pots.every((pot) => pot.allocation >= 0)).toBe(true);
  });

  it('does not double-count Pot allocations as outgoing payments', () => {
    const state = demoState(now);
    const events = calendarEvents(state, new Date(2026, 10, 1), new Date(2026, 10, 30));
    const income = events.filter((event) => event.type === 'income').reduce((sum, event) => sum + event.amount, 0);
    const expenses = events.filter((event) => event.type === 'expense').reduce((sum, event) => sum + event.amount, 0);
    const impacts = events.reduce((sum, event) => sum + event.balanceImpact, 0);
    expect(events.filter((event) => event.type === 'allocation').every((event) => event.balanceImpact === 0)).toBe(true);
    expect(events.filter((event) => event.type === 'goal').every((event) => event.balanceImpact === 0)).toBe(true);
    expect(impacts).toBe(income - expenses);
  });
});

describe('continuous daily balances', () => {
  function cashFlowState() {
    const state = emptyState();
    state.currentBalance = poundsToPennies(1000);
    state.balanceAsOf = '2026-11-30';
    state.incomes = [{ id: 'salary', name: 'Salary', amount: poundsToPennies(1800), schedule: { kind: 'monthly', day: 25 } }];
    state.expenses = [{ id: 'rent', name: 'Rent', amount: poundsToPennies(650), category: 'bills' as const, essential: true, schedule: { kind: 'monthly' as const, day: 1 } }];
    return state;
  }

  it('carries one running balance through November, December and January', () => {
    const days = dailyForecast(cashFlowState(), new Date(2026, 10, 30), new Date(2027, 0, 2));
    const closing = new Map(days.map((day) => [day.date, day.closingBalance]));
    expect(closing.get('2026-11-30')).toBe(poundsToPennies(1000));
    expect(closing.get('2026-12-01')).toBe(poundsToPennies(350));
    expect(closing.get('2026-12-24')).toBe(poundsToPennies(350));
    expect(closing.get('2026-12-25')).toBe(poundsToPennies(2150));
    expect(closing.get('2027-01-01')).toBe(poundsToPennies(1500));
    expect(closing.get('2027-01-02')).toBe(poundsToPennies(1500));
  });

  it('applies a temporary income override once and resumes the recurring amount next month', () => {
    const state = cashFlowState();
    state.incomeOverrides = [{ id: 'lower-december', sourceId: 'salary', originalDate: '2026-12-25', amount: poundsToPennies(1200) }];
    const days = dailyForecast(state, new Date(2026, 10, 30), new Date(2027, 0, 25));
    const closing = new Map(days.map((day) => [day.date, day.closingBalance]));
    expect(closing.get('2026-12-25')).toBe(poundsToPennies(1550));
    expect(closing.get('2027-01-01')).toBe(poundsToPennies(900));
    expect(closing.get('2027-01-25')).toBe(poundsToPennies(2700));
  });

  it('keeps dates before the known balance unavailable and carries across days with no events', () => {
    const days = dailyForecast(cashFlowState(), new Date(2026, 10, 28), new Date(2026, 11, 3));
    const byDate = new Map(days.map((day) => [day.date, day]));
    expect(byDate.get('2026-11-29')?.closingBalance).toBeUndefined();
    expect(byDate.get('2026-12-02')?.closingBalance).toBe(poundsToPennies(350));
    expect(byDate.get('2026-12-03')?.closingBalance).toBe(poundsToPennies(350));
  });
});

describe('critical financial regressions', () => {
  const now = new Date(2026, 10, 7, 12);

  it('caps a £900 remaining goal to the £50 affordable after £200 of commitments', () => {
    const state = emptyState();
    state.balanceAsOf = '2026-11-07';
    state.currentBalance = 0;
    state.incomes = [{ id: 'pay', name: 'Pay', amount: poundsToPennies(250), schedule: { kind: 'monthly', day: 25 } }];
    state.expenses = [{ id: 'needs', name: 'Essential needs', amount: poundsToPennies(200), category: 'bills', essential: true, schedule: { kind: 'monthly', day: 10 } }];
    state.goals = [{ id: 'holiday', name: 'Holiday', targetAmount: poundsToPennies(1000), currentAmount: poundsToPennies(100), targetDate: '2026-11-25', colour: '#d2387c' }];
    const plan = calculatePlan(state, now);
    const goalPot = plan.pots.find((pot) => pot.goalId === 'holiday');
    const goalEvent = calendarEvents(state, now, new Date(2026, 10, 30)).find((event) => event.type === 'goal');
    expect(goalPot?.allocation).toBe(poundsToPennies(50));
    expect(goalPot?.requested).toBe(poundsToPennies(900));
    expect(goalEvent?.amount).toBe(poundsToPennies(50));
    expect(projectGoal(state, state.goals[0], now).affordable).toBe(false);
  });

  it('uses the planned £100 goal contribution in the reconciled Pot plan, not the remaining target', () => {
    const state = emptyState();
    state.incomes = [{ id: 'pay', name: 'Pay', amount: poundsToPennies(500), schedule: { kind: 'monthly', day: 25 } }];
    state.expenses = [{ id: 'needs', name: 'Needs', amount: poundsToPennies(400), category: 'bills', essential: true, schedule: { kind: 'monthly', day: 10 } }];
    state.goals = [{ id: 'goal', name: 'Goal', targetAmount: poundsToPennies(900), currentAmount: 0, targetDate: '2026-11-25', colour: '#d2387c' }];
    const plan = calculatePlan(state, now);
    expect(plan.pots.find((pot) => pot.goalId === 'goal')?.allocation).toBe(poundsToPennies(100));
    expect(plan.totalAllocated).toBe(poundsToPennies(500));
  });

  it('moves an edited monthly income from the 25th to the 20th without a duplicate and preserves it through migration', () => {
    const state = emptyState();
    state.incomes = [{ id: 'salary', name: 'Salary', amount: poundsToPennies(1800), schedule: { kind: 'monthly', day: 25 } }];
    state.incomes = state.incomes.map((income) => income.id === 'salary' ? { ...income, schedule: { kind: 'monthly' as const, day: 20 } } : income);
    const restored = migrateState(JSON.parse(JSON.stringify(state)));
    const dates = calendarEvents(restored, new Date(2026, 10, 1), new Date(2026, 10, 30)).filter((event) => event.type === 'income').map((event) => event.date);
    expect(dates).toEqual(['2026-11-20']);
    expect(restored.incomes[0].schedule).toEqual({ kind: 'monthly', day: 20 });
  });

  it('removes only the deleted recurring expense from future events, plan totals and persisted state', () => {
    const state = emptyState();
    state.incomes = [{ id: 'salary', name: 'Salary', amount: poundsToPennies(1000), schedule: { kind: 'monthly', day: 25 } }];
    state.expenses = [
      { id: 'delete-me', name: 'Old cost', amount: poundsToPennies(75), category: 'bills', essential: true, schedule: { kind: 'monthly', day: 12 } },
      { id: 'keep-me', name: 'Rent', amount: poundsToPennies(500), category: 'bills', essential: true, schedule: { kind: 'monthly', day: 1 } },
    ];
    state.expenses = state.expenses.filter((expense) => expense.id !== 'delete-me');
    const restored = migrateState(JSON.parse(JSON.stringify(state)));
    const events = calendarEvents(restored, new Date(2026, 10, 1), new Date(2026, 11, 31));
    expect(events.some((event) => event.sourceId === 'delete-me')).toBe(false);
    expect(events.some((event) => event.sourceId === 'keep-me')).toBe(true);
    expect(calculatePlan(restored, now).essentialCommitments).toBe(poundsToPennies(500));
  });

  it('keeps £1,800 as regular salary while applying £1,200 to one affected payday only', () => {
    const state = emptyState();
    state.incomes = [{ id: 'salary', name: 'Salary', amount: poundsToPennies(1800), schedule: { kind: 'monthly', day: 25 } }];
    state.incomeOverrides = [{ id: 'temporary', sourceId: 'salary', originalDate: '2026-11-25', amount: poundsToPennies(1200), note: 'Temporary adjustment' }];
    const events = calendarEvents(state, new Date(2026, 10, 1), new Date(2026, 11, 31)).filter((event) => event.type === 'income');
    expect(state.incomes[0].amount).toBe(poundsToPennies(1800));
    expect(events.map((event) => [event.date, event.amount])).toEqual([['2026-11-25', poundsToPennies(1200)], ['2026-12-25', poundsToPennies(1800)]]);
    expect(calculatePlan(state, now).expectedIncome).toBe(poundsToPennies(1200));
  });

  it('omits internal allocation bookkeeping while preserving the continuous balance', () => {
    const state = demoState(now);
    const events = calendarEvents(state, new Date(2026, 10, 1), new Date(2026, 11, 31));
    expect(events.some((event) => event.type === 'allocation')).toBe(false);
    const days = dailyForecast(state, now, new Date(2026, 11, 2));
    expect(days.find((day) => day.date === '2026-12-01')?.closingBalance).toBe(poundsToPennies(2240));
  });

  it('keeps overlapping goal recommendations within one shared affordable budget', () => {
    const state = emptyState();
    state.incomes = [{ id: 'pay', name: 'Pay', amount: poundsToPennies(250), schedule: { kind: 'monthly', day: 25 } }];
    state.expenses = [{ id: 'needs', name: 'Needs', amount: poundsToPennies(200), category: 'bills', essential: true, schedule: { kind: 'monthly', day: 10 } }];
    state.goals = [
      { id: 'one', name: 'Goal one', targetAmount: poundsToPennies(500), currentAmount: 0, targetDate: '2026-11-25', colour: '#d2387c' },
      { id: 'two', name: 'Goal two', targetAmount: poundsToPennies(500), currentAmount: 0, targetDate: '2026-11-25', colour: '#2563eb' },
    ];
    const schedule = goalContributionSchedule(state, now);
    expect(schedule.entries.reduce((sum, entry) => sum + entry.contribution, 0)).toBe(poundsToPennies(50));
    expect(schedule.onTrack.one).toBe(false);
    expect(schedule.onTrack.two).toBe(false);
  });
});
