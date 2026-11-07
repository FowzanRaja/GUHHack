import { describe, expect, it } from 'vitest';
import { endOfMonth } from 'date-fns';
import { previewAssistantAction } from './actions';
import { calculateAvailableToday, calendarEvents, calculatePlan, dailyForecast, goalContributionSchedule, projectGoal } from './engine';
import { migrateState } from '../hooks/useFinancialState';
import { demoState, emptyState } from './demo';
import { isoDate, monthlyOccurrence, scheduleDates } from './dates';
import { poundsToPennies } from './money';
import { answerInformationRequest } from './information';

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

describe('available after Pots', () => {
  const now = new Date(2026, 10, 7, 12);
  const dayOf = (state: ReturnType<typeof demoState>, date: string) =>
    dailyForecast(state, now, new Date(2026, 11, 31)).find((day) => day.date === date)!;

  it('reserves only unpaid bills before the next payday and savings earmarked so far', () => {
    const state = demoState(now);
    const today = dayOf(state, '2026-11-07');
    expect(today.closingBalance).toBe(poundsToPennies(1120));
    expect(today.availableAfterPots).toMatchObject({ status: 'available', billsReserved: poundsToPennies(30), savingsEarmarked: 0, amount: poundsToPennies(1090) });

    const payday = dayOf(state, '2026-11-25');
    expect(payday.closingBalance).toBe(poundsToPennies(2890));
    // December bills before the 25 December payday: 650 + 200 + 100 + 30.
    // Savings earmarked on 25 November: £75 emergency + £166.67 holiday. Neither leaves the account.
    expect(payday.availableAfterPots).toMatchObject({ status: 'available', billsReserved: poundsToPennies(980), savingsEarmarked: 24167, amount: 289000 - 98000 - 24167 });

    const afterRent = dayOf(state, '2026-12-01');
    expect(afterRent.closingBalance).toBe(poundsToPennies(2240));
    // Rent has been paid, so it is no longer reserved; the same savings earmark is not counted twice.
    expect(afterRent.availableAfterPots).toMatchObject({ billsReserved: poundsToPennies(330), savingsEarmarked: 24167, amount: 224000 - 33000 - 24167 });
  });

  it('matches the Overview available-to-spend figure for today', () => {
    const state = demoState(now);
    const today = calculateAvailableToday(state, now);
    expect(today).toMatchObject({ status: 'available', amount: poundsToPennies(1090), reserved: poundsToPennies(30) });
  });

  it('updates planned savings and earmarks when the emergency buffer is changed or paused', () => {
    const state = demoState(now);
    expect(calculatePlan(state, now).savingsAllocated).toBe(24167);
    const fifty = { ...state, emergencyFundContribution: poundsToPennies(50), emergencyFundOrigin: 'customer' as const };
    expect(calculatePlan(fifty, now).savingsAllocated).toBe(21667);
    expect(dayOf(fifty, '2026-11-25').availableAfterPots).toMatchObject({ savingsEarmarked: 21667 });
    const paused = { ...state, emergencyFundPaused: true };
    const pausedPlan = calculatePlan(paused, now);
    expect(pausedPlan.savingsAllocated).toBe(16667);
    expect(pausedPlan.pots.some((pot) => pot.id === 'emergency')).toBe(false);
    expect(pausedPlan.pots.some((pot) => pot.goalId === 'goal-holiday')).toBe(true);
    expect(pausedPlan.totalAllocated).toBe(poundsToPennies(1800));
    expect(dayOf(paused, '2026-11-25').closingBalance).toBe(poundsToPennies(2890));
  });

  it('is unavailable rather than guessed when Pots have no payment dates', () => {
    const state = demoState(now);
    state.manualPots = [{ id: 'pot', name: 'Gifts', allocation: poundsToPennies(20), priority: 'flexible', colour: '#0f766e' }];
    expect(dayOf(state, '2026-11-25').availableAfterPots?.status).toBe('unavailable');
  });
});

describe('emergency buffer transparency', () => {
  const now = new Date(2026, 10, 7, 12);

  it('marks an existing saved contribution for review instead of deleting it', () => {
    const saved = JSON.parse(JSON.stringify(demoState(now)));
    delete saved.emergencyFundOrigin;
    delete saved.emergencyFundPaused;
    const restored = migrateState(saved);
    expect(restored.emergencyFundContribution).toBe(poundsToPennies(75));
    expect(restored.emergencyFundOrigin).toBe('existing');
    expect(restored.emergencyFundPaused).toBe(false);
    expect(emptyState().emergencyFundContribution).toBeNull();
  });

  it('explains the planned savings breakdown and where the buffer came from', () => {
    const answer = answerInformationRequest(demoState(now), { type: 'information_request', summary: 'Savings', topic: 'savings' }, now);
    expect(answer).toContain('£241.67 (£75.00 emergency buffer + £166.67 for Holiday)');
    expect(answer).toContain('not money already saved');
    expect(answer).toContain('was already in your plan');
  });
});
