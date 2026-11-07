import {
  addDays,
  addMonths,
  compareAsc,
  endOfMonth,
  format,
  isAfter,
  isBefore,
  startOfDay,
  startOfMonth,
} from 'date-fns';
import type {
  AvailableAfterPots,
  ExpenseCategory,
  Expense,
  FinancialEvent,
  FinancialPlan,
  FinancialState,
  PlannedPot,
  PlanNotice,
  PotReserveItem,
  SavingsGoal,
} from '../types';
import { isoDate, parseDate, scheduleDates, tryParseDate } from './dates';
import { clampMoney, formatMoney } from './money';

const CATEGORY_META: Record<ExpenseCategory, { name: string; colour: string; description: string }> = {
  bills: { name: 'Bills', colour: '#4e2070', description: 'Rent and regular household commitments' },
  food: { name: 'Food & essentials', colour: '#7c3aed', description: 'Everyday food and household basics' },
  transport: { name: 'Transport', colour: '#2563eb', description: 'Travel and getting around' },
  subscriptions: { name: 'Subscriptions', colour: '#db2777', description: 'Regular memberships and services' },
  personal: { name: 'Personal spending', colour: '#ea580c', description: 'Flexible money for you' },
  other: { name: 'Other commitments', colour: '#64748b', description: 'Other planned costs' },
};

export interface GoalProjection {
  contributionPerIncome: number;
  eligibleIncomeCount: number;
  remaining: number;
  affordable: boolean;
  projectedDate?: string;
  validDeadline: boolean;
}

export interface GoalContributionEntry {
  goalId: string;
  date: string;
  incomeEventId: string;
  income: number;
  desiredContribution: number;
  contribution: number;
  remainingAfterContribution: number;
}

export interface PaydayAllocation {
  date: string;
  incomeEventId: string;
  income: number;
  committedBeforeGoals: number;
  remainingAfterGoals: number;
}

export interface GoalContributionSchedule {
  entries: GoalContributionEntry[];
  paydays: PaydayAllocation[];
  onTrack: Record<string, boolean>;
}

export interface GoalPaydayBreakdown {
  target: number;
  saved: number;
  remaining: number;
  nextPayday?: string;
  expectedIncome: number;
  recommendedContribution: number;
  remainingIncomeAfterPriorities: number;
  onTrack: boolean;
  eligiblePaydays: number;
}

function overrideFor(state: FinancialState, sourceId: string, date: string) {
  return state.incomeOverrides.find((item) => item.sourceId === sourceId && item.originalDate === date);
}

export function incomeEventsForRange(state: FinancialState, from: Date, to: Date): FinancialEvent[] {
  const events: FinancialEvent[] = [];
  for (const source of state.incomes) {
    for (const date of scheduleDates(source.schedule, from, to)) {
      const originalDate = isoDate(date);
      const override = overrideFor(state, source.id, originalDate);
      if (override?.newDate) {
        const moved = parseDate(override.newDate);
        if (!isBefore(moved, startOfDay(from)) && !isAfter(moved, startOfDay(to))) {
          events.push({
            id: `income-${source.id}-${originalDate}-moved`,
            date: override.newDate,
            type: 'income',
            name: source.name,
            amount: override.amount,
            balanceImpact: override.amount,
            sourceId: source.id,
            detail: `Moved from ${format(date, 'd MMMM')}`,
          });
        }
      } else {
        const amount = override?.amount ?? source.amount;
        events.push({
          id: `income-${source.id}-${originalDate}`,
          date: originalDate,
          type: 'income',
          name: source.name,
          amount,
          balanceImpact: amount,
          sourceId: source.id,
          detail: override?.note,
        });
      }
    }

    // A delayed occurrence may move into this range from just before it.
    for (const override of state.incomeOverrides.filter((item) => item.sourceId === source.id && item.newDate)) {
      const moved = parseDate(override.newDate!);
      const originalWasInRange = !isBefore(parseDate(override.originalDate), startOfDay(from)) && !isAfter(parseDate(override.originalDate), startOfDay(to));
      if (!originalWasInRange && !isBefore(moved, startOfDay(from)) && !isAfter(moved, startOfDay(to))) {
        events.push({
          id: `income-${source.id}-${override.originalDate}-moved`,
          date: override.newDate!,
          type: 'income',
          name: source.name,
          amount: override.amount,
          balanceImpact: override.amount,
          sourceId: source.id,
          detail: `Moved from ${format(parseDate(override.originalDate), 'd MMMM')}`,
        });
      }
    }
  }
  return dedupeEvents(events);
}

export function expenseEventsForRange(state: FinancialState, from: Date, to: Date): FinancialEvent[] {
  return state.expenses.flatMap((expense) =>
    scheduleDates(expense.schedule, from, to).map((date) => ({
      id: `expense-${expense.id}-${isoDate(date)}`,
      date: isoDate(date),
      type: 'expense' as const,
      name: expense.name,
      amount: expense.amount,
      balanceImpact: -expense.amount,
      sourceId: expense.id,
      detail: expense.essential ? 'Essential commitment' : 'Planned spending',
    })),
  );
}

function dedupeEvents(events: FinancialEvent[]): FinancialEvent[] {
  return [...new Map(events.map((event) => [event.id, event])).values()];
}

export function projectGoal(state: FinancialState, goal: SavingsGoal, asOf = new Date()): GoalProjection {
  const remaining = clampMoney(goal.targetAmount - goal.currentAmount);
  const deadline = tryParseDate(goal.targetDate);
  const start = startOfDay(asOf);
  if (!deadline) {
    return { contributionPerIncome: 0, eligibleIncomeCount: 0, remaining, affordable: false, validDeadline: false };
  }
  if (remaining === 0) {
    return { contributionPerIncome: 0, eligibleIncomeCount: 0, remaining: 0, affordable: true, projectedDate: isoDate(start), validDeadline: true };
  }
  if (isBefore(deadline, start)) {
    return { contributionPerIncome: remaining, eligibleIncomeCount: 0, remaining, affordable: false, validDeadline: true };
  }
  const incomeEvents = incomeEventsForRange(state, start, deadline).filter((event) => event.amount > 0);
  const schedule = goalContributionSchedule(state, start);
  const entries = schedule.entries.filter((entry) => entry.goalId === goal.id);
  const funded = entries.reduce((sum, entry) => sum + entry.contribution, 0);
  return {
    contributionPerIncome: entries[0]?.contribution ?? 0,
    eligibleIncomeCount: incomeEvents.length,
    remaining,
    affordable: funded >= remaining,
    projectedDate: schedule.onTrack[goal.id] ? [...entries].reverse().find((entry) => entry.remainingAfterContribution === 0)?.date : undefined,
    validDeadline: true,
  };
}

function distributeAmount(total: number, incomes: FinancialEvent[]): number[] {
  const incomeTotal = incomes.reduce((sum, income) => sum + income.amount, 0);
  if (total <= 0 || incomeTotal <= 0) return incomes.map(() => 0);
  let assigned = 0;
  return incomes.map((income, index) => {
    const share = index === incomes.length - 1 ? total - assigned : Math.floor((total * income.amount) / incomeTotal);
    assigned += share;
    return share;
  });
}

/** The emergency contribution the customer has in their plan. Paused contributions plan nothing. */
export function plannedEmergencyContribution(state: FinancialState): number {
  return state.emergencyFundPaused ? 0 : clampMoney(state.emergencyFundContribution ?? 0);
}

function protectedCommitmentsForMonth(state: FinancialState, referenceDate: Date): number {
  const categories = new Map<ExpenseCategory, { amount: number; protected: boolean }>();
  for (const expense of state.expenses) {
    const amount = expenseAmountForMonth(expense, referenceDate);
    const current = categories.get(expense.category) ?? { amount: 0, protected: false };
    categories.set(expense.category, { amount: current.amount + amount, protected: current.protected || expense.essential });
  }
  const categoryTotal = [...categories.entries()].reduce((sum, [category, request]) => {
    const override = state.allocationOverrides[`category-${category}`];
    const amount = override === undefined ? request.amount : request.protected ? Math.max(request.amount, override) : override;
    return sum + amount;
  }, 0);
  const manualProtected = state.manualPots
    .filter((pot) => pot.priority === 'essential' || pot.priority === 'everyday')
    .reduce((sum, pot) => sum + pot.allocation, 0);
  return categoryTotal + manualProtected;
}

/** Emergency buffer that fits after protected needs in a month (same rule as calculatePlan). */
function emergencyForMonth(state: FinancialState, referenceDate: Date, income: number): number {
  const protectedTotal = protectedCommitmentsForMonth(state, referenceDate);
  return income > protectedTotal ? Math.min(plannedEmergencyContribution(state), income - protectedTotal) : 0;
}

function commitmentsBeforeGoals(state: FinancialState, referenceDate: Date, income: number): number {
  return protectedCommitmentsForMonth(state, referenceDate) + emergencyForMonth(state, referenceDate, income);
}

export interface EmergencyEarmark {
  date: string;
  incomeEventId: string;
  amount: number;
}

/** Splits each month's emergency buffer across that month's paydays, in proportion to each payment. */
export function emergencyEarmarkSchedule(state: FinancialState, from: Date, to: Date): EmergencyEarmark[] {
  if (!plannedEmergencyContribution(state)) return [];
  const earmarks: EmergencyEarmark[] = [];
  for (let month = startOfMonth(from); !isAfter(month, startOfDay(to)); month = addMonths(month, 1)) {
    const monthIncome = incomeEventsForRange(state, month, endOfMonth(month))
      .filter((event) => event.amount > 0)
      .sort((a, b) => a.date.localeCompare(b.date));
    if (!monthIncome.length) continue;
    const total = monthIncome.reduce((sum, income) => sum + income.amount, 0);
    const shares = distributeAmount(emergencyForMonth(state, month, total), monthIncome);
    monthIncome.forEach((income, index) => {
      if (shares[index] > 0 && income.date >= isoDate(from) && income.date <= isoDate(to)) {
        earmarks.push({ date: income.date, incomeEventId: income.id, amount: shares[index] });
      }
    });
  }
  return earmarks;
}

export function goalContributionSchedule(state: FinancialState, asOf = new Date()): GoalContributionSchedule {
  const start = startOfDay(asOf);
  const validGoals = state.goals.filter((goal) => {
    const deadline = tryParseDate(goal.targetDate);
    return deadline && !isBefore(deadline, start) && goal.targetAmount > goal.currentAmount;
  });
  const onTrack = Object.fromEntries(state.goals.map((goal) => [goal.id, goal.targetAmount <= goal.currentAmount]));
  if (!validGoals.length) return { entries: [], paydays: [], onTrack };
  const deadlines = validGoals.map((goal) => tryParseDate(goal.targetDate)!).sort(compareAsc);
  const finalDeadline = deadlines.at(-1)!;
  const allIncome = incomeEventsForRange(state, start, finalDeadline).filter((event) => event.amount > 0);
  const remaining = new Map(validGoals.map((goal) => [goal.id, clampMoney(goal.targetAmount - goal.currentAmount)]));
  const entries: GoalContributionEntry[] = [];
  const paydays: PaydayAllocation[] = [];

  for (let month = startOfMonth(start); !isAfter(month, startOfMonth(finalDeadline)); month = addMonths(month, 1)) {
    const monthEnd = endOfMonth(month);
    const monthIncome = allIncome.filter((income) => income.date.slice(0, 7) === format(month, 'yyyy-MM'));
    if (!monthIncome.length) continue;
    const totalIncome = monthIncome.reduce((sum, income) => sum + income.amount, 0);
    const committed = Math.min(totalIncome, commitmentsBeforeGoals(state, month, totalIncome));
    const committedShares = distributeAmount(committed, monthIncome);

    monthIncome.forEach((income, incomeIndex) => {
      let goalBudget = Math.max(0, income.amount - committedShares[incomeIndex]);
      const committedBeforeGoals = income.amount - goalBudget;
      for (const goal of validGoals) {
        const deadline = tryParseDate(goal.targetDate)!;
        const stillNeeded = remaining.get(goal.id) ?? 0;
        if (!stillNeeded || income.date > goal.targetDate) continue;
        const eligible = allIncome.filter((event) => event.date >= income.date && event.date <= goal.targetDate).length;
        if (!eligible) continue;
        const monthlyOverride = state.allocationOverrides[`goal-${goal.id}`];
        const eligibleThisMonth = monthIncome.filter((event) => event.date >= income.date && event.date <= goal.targetDate).length;
        const desired = monthlyOverride === undefined
          ? Math.ceil(stillNeeded / eligible)
          : Math.min(stillNeeded, Math.ceil(monthlyOverride / Math.max(eligibleThisMonth, 1)));
        const contribution = Math.min(desired, goalBudget, stillNeeded);
        goalBudget -= contribution;
        const after = stillNeeded - contribution;
        remaining.set(goal.id, after);
        entries.push({
          goalId: goal.id,
          date: income.date,
          incomeEventId: income.id,
          income: income.amount,
          desiredContribution: desired,
          contribution,
          remainingAfterContribution: after,
        });
      }
      paydays.push({ date: income.date, incomeEventId: income.id, income: income.amount, committedBeforeGoals, remainingAfterGoals: goalBudget });
    });
    if (monthEnd >= finalDeadline) break;
  }

  for (const goal of state.goals) onTrack[goal.id] = (remaining.get(goal.id) ?? clampMoney(goal.targetAmount - goal.currentAmount)) === 0;
  return { entries, paydays, onTrack };
}

export function goalPaydayBreakdown(state: FinancialState, goal: SavingsGoal, asOf = new Date()): GoalPaydayBreakdown {
  const start = startOfDay(asOf);
  const remaining = clampMoney(goal.targetAmount - goal.currentAmount);
  const deadline = tryParseDate(goal.targetDate);
  const searchEnd = deadline && isAfter(deadline, start) ? deadline : addDays(start, 400);
  const nextIncome = incomeEventsForRange(state, start, searchEnd).filter((event) => event.amount > 0).sort((a, b) => a.date.localeCompare(b.date))[0];
  const schedule = goalContributionSchedule(state, start);
  const contribution = nextIncome ? schedule.entries.find((entry) => entry.goalId === goal.id && entry.incomeEventId === nextIncome.id) : undefined;
  const payday = nextIncome ? schedule.paydays.find((item) => item.incomeEventId === nextIncome.id) : undefined;
  const eligiblePaydays = deadline ? incomeEventsForRange(state, start, deadline).filter((event) => event.amount > 0).length : 0;
  return {
    target: goal.targetAmount,
    saved: goal.currentAmount,
    remaining,
    nextPayday: nextIncome?.date,
    expectedIncome: nextIncome?.amount ?? 0,
    recommendedContribution: contribution?.contribution ?? 0,
    remainingIncomeAfterPriorities: payday?.remainingAfterGoals ?? 0,
    onTrack: schedule.onTrack[goal.id] ?? remaining === 0,
    eligiblePaydays,
  };
}

export function expenseAmountForMonth(expense: Expense, referenceDate = new Date()): number {
  if (expense.schedule.kind === 'monthly_allowance') return expense.amount;
  return expense.amount * scheduleDates(expense.schedule, startOfMonth(referenceDate), endOfMonth(referenceDate)).length;
}

export function calculatePlan(state: FinancialState, referenceDate = new Date()): FinancialPlan {
  const monthStart = startOfMonth(referenceDate);
  const monthEnd = endOfMonth(referenceDate);
  const expectedIncome = incomeEventsForRange(state, monthStart, monthEnd).reduce((sum, event) => sum + event.amount, 0);
  const available = expectedIncome > 0 ? expectedIncome : clampMoney(state.currentBalance ?? 0);
  const expenses = state.expenses.flatMap((expense) => {
    const monthlyAmount = expenseAmountForMonth(expense, referenceDate);
    return monthlyAmount ? [{ ...expense, monthlyAmount }] : [];
  });

  const categoryRequests = new Map<ExpenseCategory, { amount: number; protected: boolean }>();
  for (const expense of expenses) {
    const current = categoryRequests.get(expense.category) ?? { amount: 0, protected: false };
    categoryRequests.set(expense.category, {
      amount: current.amount + expense.monthlyAmount,
      protected: current.protected || expense.essential,
    });
  }

  const essentialPots: PlannedPot[] = [];
  const everydayPots: PlannedPot[] = [];
  for (const [category, request] of categoryRequests) {
    const meta = CATEGORY_META[category];
    const priority = request.protected ? 'essential' : category === 'personal' || category === 'subscriptions' ? 'flexible' : 'everyday';
    const override = state.allocationOverrides[`category-${category}`];
    const requested = override === undefined ? request.amount : request.protected ? Math.max(request.amount, override) : override;
    const pot: PlannedPot = {
      id: `category-${category}`,
      name: meta.name,
      allocation: requested,
      requested,
      priority,
      colour: meta.colour,
      description: meta.description,
      protected: request.protected,
    };
    (priority === 'essential' ? essentialPots : everydayPots).push(pot);
  }

  const manualEssential = state.manualPots.filter((pot) => pot.priority === 'essential').map(toPlannedPot);
  const manualEveryday = state.manualPots.filter((pot) => pot.priority === 'everyday').map(toPlannedPot);
  const protectedPots = [...essentialPots, ...manualEssential, ...everydayPots, ...manualEveryday];
  const protectedTotal = protectedPots.reduce((sum, pot) => sum + pot.requested, 0);
  let remaining = available - protectedTotal;

  const emergencyRequested = available > protectedTotal ? plannedEmergencyContribution(state) : 0;
  const emergencyAllocation = Math.min(emergencyRequested, Math.max(0, remaining));
  remaining -= emergencyAllocation;
  const emergencyPot: PlannedPot | undefined = emergencyRequested
    ? {
        id: 'emergency',
        name: 'Emergency buffer',
        allocation: emergencyAllocation,
        requested: emergencyRequested,
        priority: 'savings',
        colour: '#059669',
        description: emergencyAllocation < emergencyRequested ? `Only ${formatMoney(emergencyAllocation)} of ${formatMoney(emergencyRequested)} fits this month` : 'Planned contribution for unexpected costs',
      }
    : undefined;

  const goalSchedule = goalContributionSchedule(state, referenceDate);
  const goalPots = state.goals.map((goal) => {
    const monthEntries = goalSchedule.entries.filter((entry) => entry.goalId === goal.id && entry.date >= isoDate(monthStart) && entry.date <= isoDate(monthEnd));
    const requested = monthEntries.reduce((sum, entry) => sum + entry.desiredContribution, 0);
    const allocation = monthEntries.reduce((sum, entry) => sum + entry.contribution, 0);
    remaining -= allocation;
    const validTarget = tryParseDate(goal.targetDate);
    return {
      id: `goal-${goal.id}`,
      goalId: goal.id,
      name: goal.name,
      allocation,
      requested,
      priority: 'savings' as const,
      colour: goal.colour,
      description: validTarget ? `Towards ${format(validTarget, 'd MMM yyyy')}` : 'Target date needs correcting',
    };
  });

  const manualSavings = state.manualPots.filter((pot) => pot.priority === 'savings').map((pot) => {
    const planned = toPlannedPot(pot);
    planned.allocation = Math.min(planned.requested, Math.max(0, remaining));
    remaining -= planned.allocation;
    return planned;
  });
  const manualFlexible = state.manualPots.filter((pot) => pot.priority === 'flexible').map((pot) => {
    const planned = toPlannedPot(pot);
    planned.allocation = Math.min(planned.requested, Math.max(0, remaining));
    remaining -= planned.allocation;
    return planned;
  });

  const personalOverride = state.allocationOverrides.personal;
  const personalAllocation = personalOverride === undefined ? Math.max(0, remaining) : Math.min(personalOverride, Math.max(0, remaining));
  remaining -= personalAllocation;
  const personalPot: PlannedPot | undefined = personalAllocation > 0
    ? {
        id: 'personal',
        name: 'Personal spending',
        allocation: personalAllocation,
        requested: personalAllocation,
        priority: 'flexible',
        colour: '#e11d48',
        description: 'Money left after your priorities',
      }
    : undefined;

  const pots = [
    ...protectedPots,
    ...(emergencyPot ? [emergencyPot] : []),
    ...goalPots,
    ...manualSavings,
    ...manualFlexible,
    ...(personalPot ? [personalPot] : []),
  ].filter((pot) => pot.allocation > 0 || pot.requested > 0);
  const essentialCommitments = [...essentialPots, ...manualEssential].reduce((sum, pot) => sum + pot.requested, 0);
  const everydayNeeds = [...everydayPots, ...manualEveryday].reduce((sum, pot) => sum + pot.requested, 0);
  const savingsAllocated = pots.filter((pot) => pot.priority === 'savings').reduce((sum, pot) => sum + pot.allocation, 0);
  const flexibleSpending = pots.filter((pot) => pot.priority === 'flexible').reduce((sum, pot) => sum + pot.allocation, 0);
  const totalAllocated = pots.reduce((sum, pot) => sum + pot.allocation, 0);
  const shortfall = Math.max(0, protectedTotal - available);
  const notices: PlanNotice[] = [];

  if (shortfall > 0) {
    notices.push({
      id: 'shortfall',
      tone: 'danger',
      title: 'Your essentials need more than is available',
      message: `There is a shortfall of ${formatMoney(shortfall)} across bills and everyday needs. No essential commitment has been hidden or reduced.`,
    });
  } else if (state.goals.some((goal) => !goalSchedule.onTrack[goal.id] && goal.targetAmount > goal.currentAmount)) {
    notices.push({
      id: 'goal-pressure',
      tone: 'warning',
      title: 'A savings goal needs attention',
      message: 'Your essentials are covered, but the full suggested goal contribution does not currently fit.',
    });
  } else if (available > 0) {
    notices.push({
      id: 'covered',
      tone: 'positive',
      title: 'Your plan is balanced',
      message: 'Your bills, needs and planned savings fit within your expected income.',
    });
  } else {
    notices.push({
      id: 'start',
      tone: 'info',
      title: 'Add an income to build your plan',
      message: 'You can enter details manually or ask Cora to organise them for you.',
    });
  }

  return {
    month: format(monthStart, 'yyyy-MM'),
    expectedIncome,
    essentialCommitments,
    everydayNeeds,
    savingsAllocated,
    flexibleSpending,
    totalAllocated,
    unallocated: Math.max(0, remaining),
    shortfall,
    pots,
    notices,
  };
}

function toPlannedPot(pot: FinancialState['manualPots'][number]): PlannedPot {
  return {
    id: pot.id,
    name: pot.name,
    allocation: pot.allocation,
    requested: pot.allocation,
    priority: pot.priority,
    colour: pot.colour,
    description: 'A pot you added to your plan',
    protected: pot.priority === 'essential',
  };
}

function calendarEventsForRange(state: FinancialState, from: Date, to: Date): FinancialEvent[] {
  const incomes = incomeEventsForRange(state, from, to);
  const expenses = expenseEventsForRange(state, from, to);
  const planningStart = state.balanceAsOf && tryParseDate(state.balanceAsOf) ? addDays(parseDate(state.balanceAsOf), 1) : startOfDay(new Date());
  const schedule = goalContributionSchedule(state, planningStart);
  const goalEvents: FinancialEvent[] = schedule.entries
    .filter((entry) => entry.contribution > 0 && entry.date >= isoDate(from) && entry.date <= isoDate(to))
    .map((entry) => {
      const goal = state.goals.find((item) => item.id === entry.goalId)!;
      return {
        id: `goal-${entry.goalId}-${entry.incomeEventId}`,
        date: entry.date,
        type: 'goal' as const,
        name: `${goal.name} planned contribution`,
        amount: entry.contribution,
        balanceImpact: 0,
        sourceId: goal.id,
        detail: 'Recommended earmark from this payday — not recorded as saved yet',
      };
    });
  const emergencyEvents: FinancialEvent[] = emergencyEarmarkSchedule(state, from, to)
    .filter((entry) => entry.date >= isoDate(planningStart))
    .map((entry) => ({
      id: `emergency-${entry.incomeEventId}`,
      date: entry.date,
      type: 'goal' as const,
      name: 'Emergency buffer planned contribution',
      amount: entry.amount,
      balanceImpact: 0,
      sourceId: 'emergency',
      detail: 'Earmarked from this payday — the money stays in your account',
    }));

  const order: Record<FinancialEvent['type'], number> = { income: 0, allocation: 1, goal: 2, expense: 3, warning: 4 };
  return [...incomes, ...emergencyEvents, ...goalEvents, ...expenses].sort(
    (a, b) => compareAsc(parseDate(a.date), parseDate(b.date)) || order[a.type] - order[b.type],
  );
}

/**
 * Dated calendar events with a single continuous balance anchored to balanceAsOf.
 * currentBalance is the known closing balance on that date, so scheduled events
 * on or before it are never applied a second time.
 */
export function calendarEvents(state: FinancialState, from: Date, to: Date): FinancialEvent[] {
  const visible = calendarEventsForRange(state, from, to);
  if (state.currentBalance === null || !state.balanceAsOf) return visible;
  const anchor = tryParseDate(state.balanceAsOf);
  if (!anchor) return visible;

  const forecastFrom = addDays(anchor, 1);
  const forecastEvents = isAfter(forecastFrom, startOfDay(to)) ? [] : calendarEventsForRange(state, forecastFrom, to);
  let runningBalance = state.currentBalance;
  const balances = new Map<string, number>();
  const warnings: FinancialEvent[] = [];
  for (const event of forecastEvents) {
    runningBalance += event.balanceImpact;
    balances.set(event.id, runningBalance);
    if (runningBalance < 0 && event.balanceImpact < 0) {
      warnings.push({
        id: `warning-${event.id}`,
        date: event.date,
        type: 'warning',
        name: 'Potential shortfall',
        amount: Math.abs(runningBalance),
        balanceImpact: 0,
        runningBalance,
        detail: 'Based on the last known balance and dated payments only',
      });
    }
  }

  const withBalances = visible.map((event) => ({
    ...event,
    runningBalance: event.date === state.balanceAsOf ? state.currentBalance! : balances.get(event.id),
  }));
  const visibleWarnings = warnings.filter((warning) => warning.date >= isoDate(from) && warning.date <= isoDate(to));
  const order: Record<FinancialEvent['type'], number> = { income: 0, allocation: 1, goal: 2, expense: 3, warning: 4 };
  return [...withBalances, ...visibleWarnings].sort(
    (a, b) => compareAsc(parseDate(a.date), parseDate(b.date)) || order[a.type] - order[b.type],
  );
}

export function dailyForecast(state: FinancialState, from: Date, to: Date): import('../types').DailyForecast[] {
  const start = startOfDay(from);
  const end = startOfDay(to);
  if (isAfter(start, end)) return [];
  const visibleEvents = calendarEvents(state, start, end);
  const visibleByDate = new Map<string, FinancialEvent[]>();
  for (const event of visibleEvents) {
    const current = visibleByDate.get(event.date) ?? [];
    current.push(event);
    visibleByDate.set(event.date, current);
  }

  const anchor = state.balanceAsOf ? tryParseDate(state.balanceAsOf) : undefined;
  let running = state.currentBalance ?? undefined;
  const closings = new Map<string, { opening: number; closing: number }>();
  let savingsEvents: FinancialEvent[] = [];
  if (anchor && running !== undefined && isAfter(end, anchor)) {
    const allEvents = calendarEvents(state, addDays(anchor, 1), end);
    savingsEvents = allEvents.filter((event) => event.type === 'goal');
    const byDate = new Map<string, FinancialEvent[]>();
    for (const event of allEvents.filter((item) => item.type !== 'warning')) {
      const current = byDate.get(event.date) ?? [];
      current.push(event);
      byDate.set(event.date, current);
    }
    for (let day = addDays(anchor, 1); !isAfter(day, end); day = addDays(day, 1)) {
      const date = isoDate(day);
      const opening = running;
      for (const event of byDate.get(date) ?? []) running += event.balanceImpact;
      closings.set(date, { opening, closing: running });
    }
  }

  const days: import('../types').DailyForecast[] = [];
  for (let day = start; !isAfter(day, end); day = addDays(day, 1)) {
    const date = isoDate(day);
    const events = visibleByDate.get(date) ?? [];
    const known = anchor && date === state.balanceAsOf
      ? { opening: state.currentBalance!, closing: state.currentBalance! }
      : closings.get(date);
    days.push({
      date,
      openingBalance: known?.opening,
      closingBalance: known?.closing,
      availableAfterPots: known ? potReserveFor(state, date, known.closing, savingsEvents) : undefined,
      income: events.filter((event) => event.type === 'income').reduce((sum, event) => sum + event.amount, 0),
      expenses: events.filter((event) => event.type === 'expense').reduce((sum, event) => sum + event.amount, 0),
      events,
    });
  }
  return days;
}

/** Days ahead searched for the next payday when working out what is still earmarked. */
const NEXT_PAYDAY_SEARCH_DAYS = 400;

export function potReserveUnavailableReason(state: FinancialState): string | undefined {
  if (state.expenses.some((expense) => expense.schedule.kind === 'monthly_allowance')) {
    return 'Ongoing allowances have no payment date, so what is left in them is not tracked.';
  }
  if (state.manualPots.length) {
    return 'Custom Pots have no payment dates, so what is left in them is not tracked.';
  }
  return undefined;
}

/**
 * Money still earmarked in Pots at the end of `date`:
 * - bills: dated payments after `date` and before the next payday (already-paid ones are excluded);
 * - savings: planned emergency and goal contributions earmarked since the known balance date.
 * Earmarks never leave the account, so they are subtracted here only, never from the closing balance.
 */
function potReserveFor(state: FinancialState, date: string, closingBalance: number, savingsEvents: FinancialEvent[]): AvailableAfterPots {
  const blocked = potReserveUnavailableReason(state);
  if (blocked) return { status: 'unavailable', reason: blocked };
  const day = parseDate(date);
  const nextPayday = incomeEventsForRange(state, addDays(day, 1), addDays(day, NEXT_PAYDAY_SEARCH_DAYS))
    .filter((event) => event.amount > 0)
    .sort((a, b) => a.date.localeCompare(b.date))[0];
  if (!nextPayday) return { status: 'unavailable', reason: 'No upcoming payday is scheduled, so Pot reserves cannot be worked out.' };
  const lastBillDay = addDays(parseDate(nextPayday.date), -1);
  const bills = isAfter(addDays(day, 1), lastBillDay) ? [] : expenseEventsForRange(state, addDays(day, 1), lastBillDay);
  const savings = savingsEvents.filter((event) => event.date <= date && event.amount > 0);
  const items: PotReserveItem[] = [
    ...bills.sort((a, b) => a.date.localeCompare(b.date)).map((bill) => ({ name: bill.name, amount: bill.amount, kind: 'bill' as const, date: bill.date })),
    ...mergeSavings(savings),
  ];
  const billsReserved = bills.reduce((sum, bill) => sum + bill.amount, 0);
  const savingsEarmarked = savings.reduce((sum, event) => sum + event.amount, 0);
  const reserved = billsReserved + savingsEarmarked;
  return { status: 'available', amount: closingBalance - reserved, reserved, billsReserved, savingsEarmarked, items, nextPayday: nextPayday.date };
}

function mergeSavings(events: FinancialEvent[]): PotReserveItem[] {
  const totals = new Map<string, PotReserveItem>();
  for (const event of events) {
    const name = event.name.replace(/ planned contribution$/, '');
    const current = totals.get(name) ?? { name, amount: 0, kind: 'savings' as const };
    totals.set(name, { ...current, amount: current.amount + event.amount });
  }
  return [...totals.values()];
}

export type AvailableToday =
  | { status: 'available'; amount: number; balance: number; reserved: number; items: PotReserveItem[]; nextPayday: string; asOf: string }
  | { status: 'unavailable'; reason: string };

export function calculateAvailableToday(state: FinancialState, referenceDate = new Date()): AvailableToday {
  if (state.currentBalance === null || !state.balanceAsOf || !tryParseDate(state.balanceAsOf)) {
    return { status: 'unavailable', reason: 'Add a current balance to calculate this safely.' };
  }
  const today = startOfDay(referenceDate);
  const anchor = parseDate(state.balanceAsOf);
  if (isAfter(anchor, today)) return { status: 'unavailable', reason: 'The known balance date is in the future.' };
  const todayForecast = dailyForecast(state, anchor, today).at(-1);
  const balance = todayForecast?.closingBalance;
  const afterPots = todayForecast?.availableAfterPots;
  if (balance === undefined || !afterPots) return { status: 'unavailable', reason: 'A reliable balance for today is not available.' };
  if (afterPots.status === 'unavailable') return afterPots;
  // Same figure as the calendar's "Available after Pots" for today.
  return { status: 'available', amount: afterPots.amount, balance, reserved: afterPots.reserved, items: afterPots.items, nextPayday: afterPots.nextPayday, asOf: isoDate(today) };
}

export function forecastNextDays(state: FinancialState, days = 45, from = new Date()): FinancialEvent[] {
  return calendarEvents(state, startOfDay(from), addDays(startOfDay(from), days));
}
