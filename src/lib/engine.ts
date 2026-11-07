import {
  addDays,
  compareAsc,
  endOfMonth,
  format,
  isAfter,
  isBefore,
  startOfDay,
  startOfMonth,
} from 'date-fns';
import type {
  ExpenseCategory,
  Expense,
  FinancialEvent,
  FinancialPlan,
  FinancialState,
  PlannedPot,
  PlanNotice,
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
  const contributionPerIncome = incomeEvents.length ? Math.ceil(remaining / incomeEvents.length) : remaining;
  return {
    contributionPerIncome,
    eligibleIncomeCount: incomeEvents.length,
    remaining,
    affordable: incomeEvents.length > 0,
    projectedDate: incomeEvents.at(-1)?.date,
    validDeadline: true,
  };
}

function requestedForMonth(state: FinancialState, goal: SavingsGoal, monthStart: Date, monthEnd: Date): number {
  const projection = projectGoal(state, goal, monthStart);
  const deadline = tryParseDate(goal.targetDate);
  if (!projection.eligibleIncomeCount || !deadline) return 0;
  const end = isBefore(deadline, monthEnd) ? deadline : monthEnd;
  const eligibleThisMonth = incomeEventsForRange(state, monthStart, end).length;
  return Math.min(projection.remaining, projection.contributionPerIncome * eligibleThisMonth);
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

  const emergencyRequested = available > protectedTotal ? clampMoney(state.emergencyFundContribution ?? 0) : 0;
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
        description: 'A small cushion for unexpected costs',
      }
    : undefined;

  const goalPots = state.goals.map((goal) => {
    const requested = state.allocationOverrides[`goal-${goal.id}`] ?? requestedForMonth(state, goal, monthStart, monthEnd);
    const allocation = Math.min(requested, Math.max(0, remaining));
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
  } else if (goalPots.some((pot) => pot.allocation < pot.requested)) {
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
      message: 'Known commitments are covered and every pound has a clear purpose.',
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

export function calendarEvents(state: FinancialState, from: Date, to: Date): FinancialEvent[] {
  const incomes = incomeEventsForRange(state, from, to);
  const expenses = expenseEventsForRange(state, from, to);
  const goalEvents: FinancialEvent[] = [];
  const allocationEvents: FinancialEvent[] = [];
  const monthPlans = new Map<string, FinancialPlan>();

  for (const income of incomes) {
    const monthKey = income.date.slice(0, 7);
    const plan = monthPlans.get(monthKey) ?? calculatePlan(state, parseDate(income.date));
    monthPlans.set(monthKey, plan);
    const monthIncome = Math.max(plan.expectedIncome, 1);
    const share = income.amount / monthIncome;
    allocationEvents.push({
      id: `allocation-${income.id}`,
      date: income.date,
      type: 'allocation',
      name: 'Pots planned',
      amount: Math.round(plan.totalAllocated * share),
      balanceImpact: 0,
      detail: 'Earmarked only — this does not spend the money',
    });
    for (const goal of state.goals) {
      const targetDate = tryParseDate(goal.targetDate);
      if (!targetDate || isAfter(parseDate(income.date), targetDate)) continue;
      const projection = projectGoal(state, goal, parseDate(income.date));
      if (!projection.remaining || !projection.eligibleIncomeCount) continue;
      goalEvents.push({
        id: `goal-${goal.id}-${income.id}`,
        date: income.date,
        type: 'goal',
        name: `${goal.name} contribution`,
        amount: Math.min(projection.contributionPerIncome, projection.remaining),
        balanceImpact: 0,
        sourceId: goal.id,
        detail: 'Planned transfer into a savings Pot',
      });
    }
  }

  const order: Record<FinancialEvent['type'], number> = { income: 0, allocation: 1, goal: 2, expense: 3, warning: 4 };
  const events = [...incomes, ...allocationEvents, ...goalEvents, ...expenses].sort(
    (a, b) => compareAsc(parseDate(a.date), parseDate(b.date)) || order[a.type] - order[b.type],
  );
  let runningBalance: number | undefined = state.currentBalance ?? undefined;
  const output: FinancialEvent[] = [];
  for (const event of events) {
    if (runningBalance !== undefined) runningBalance += event.balanceImpact;
    output.push({ ...event, runningBalance });
    if (runningBalance !== undefined && runningBalance < 0 && event.balanceImpact < 0) {
      output.push({
        id: `warning-${event.id}`,
        date: event.date,
        type: 'warning',
        name: 'Potential shortfall',
        amount: Math.abs(runningBalance),
        balanceImpact: 0,
        runningBalance,
        detail: 'Based on known payments and the balance entered today',
      });
    }
  }
  return output;
}

export function forecastNextDays(state: FinancialState, days = 45, from = new Date()): FinancialEvent[] {
  return calendarEvents(state, startOfDay(from), addDays(startOfDay(from), days));
}
