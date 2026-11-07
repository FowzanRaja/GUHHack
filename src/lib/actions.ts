import { addDays, format } from 'date-fns';
import type { AssistantAction, FinancialPlan, FinancialState, IncomeSource } from '../types';
import { nextScheduleDate, isoDate, parseDate, tryParseDate } from './dates';
import { calculatePlan, projectGoal } from './engine';
import { makeId } from './id';
import { formatMoney } from './money';

export interface ActionPreview {
  action: AssistantAction;
  title: string;
  explanation: string;
  changes: string[];
  nextState: FinancialState;
  beforePlan: FinancialPlan;
  afterPlan: FinancialPlan;
  canApply: boolean;
  showBeforeAfter: boolean;
}

function touch(state: FinancialState): FinancialState {
  return { ...state, lastUpdated: new Date().toISOString() };
}

function sourceFor(state: FinancialState, id?: string): IncomeSource | undefined {
  return (id ? state.incomes.find((source) => source.id === id) : undefined) ?? state.incomes[0];
}

function targetIncomeDate(source: IncomeSource, requestedDate: string | undefined, now: Date): string | undefined {
  if (requestedDate) return requestedDate;
  const date = nextScheduleDate(source.schedule, now);
  return date ? isoDate(date) : undefined;
}

export function previewAssistantAction(state: FinancialState, action: AssistantAction, now = new Date()): ActionPreview {
  const beforePlan = calculatePlan(state, now);
  let nextState = structuredClone(state);
  let title = 'Review Cora’s suggestion';
  let explanation = action.summary;
  let changes: string[] = [];
  let canApply = true;
  let showBeforeAfter = true;

  switch (action.type) {
    case 'financial_profile': {
      const incomes = action.incomes.map((income) => ({ ...income, id: makeId('income') }));
      const expenses = action.expenses.map((expense) => ({ ...expense, id: makeId('expense') }));
      const goals = action.goals?.map((goal) => ({
        ...goal,
        id: makeId('goal'),
        currentAmount: goal.currentAmount ?? 0,
        colour: '#d2387c',
      }));
      if (action.profileMode === 'merge') {
        nextState.incomes = mergeByName(state.incomes, incomes);
        nextState.expenses = mergeByName(state.expenses, expenses);
        if (goals) nextState.goals = mergeByName(state.goals, goals);
      } else {
        nextState.incomes = incomes;
        nextState.expenses = expenses;
        if (goals) nextState.goals = goals;
        nextState.incomeOverrides = [];
        nextState.allocationOverrides = {};
        nextState.manualPots = [];
      }
      if (action.currentBalance !== undefined) {
        nextState.currentBalance = action.currentBalance;
        nextState.balanceAsOf = isoDate(now);
      }
      if (action.emergencyFundContribution !== undefined) {
        // Applying the proposal is the customer's approval of Cora's recommendation.
        nextState.emergencyFundContribution = action.emergencyFundContribution;
        nextState.emergencyFundOrigin = 'cora';
        nextState.emergencyFundPaused = false;
      }
      title = action.profileMode === 'merge' ? 'Add these details to your plan' : 'Here’s the plan Cora understood';
      explanation = action.profileMode === 'replace'
        ? 'This will replace the income and regular costs in the current profile after you confirm. Existing goals are preserved unless they are included in the proposed profile.'
        : 'This is the plan Cora will create from the details you provided. Nothing is saved until you confirm.';
      showBeforeAfter = false;
      changes = [
        ...(action.incomes.length || action.profileMode !== 'merge' ? [`${action.incomes.length} income source${action.incomes.length === 1 ? '' : 's'}`] : []),
        ...(action.expenses.length || action.profileMode !== 'merge' ? [`${action.expenses.length} regular cost${action.expenses.length === 1 ? '' : 's'}`] : []),
        ...(action.goals ? [`${action.goals.length} savings goal${action.goals.length === 1 ? '' : 's'}`] : []),
        ...(action.emergencyFundContribution !== undefined ? [`Recommended by Cora: ${formatMoney(action.emergencyFundContribution)} a month into an emergency buffer (only added if you apply)`] : []),
        ...(action.missingInformation?.map((item) => `Optional detail: ${item}`) ?? []),
      ];
      break;
    }
    case 'temporary_income_change': {
      const source = sourceFor(state, action.incomeSourceId);
      if (!source) return unavailable(state, action, now, 'Add an income source before changing a payment.');
      const date = targetIncomeDate(source, action.date, now);
      if (!date) return unavailable(state, action, now, 'Cora could not identify an upcoming payment date.');
      nextState.incomeOverrides = [
        ...state.incomeOverrides.filter((item) => !(item.sourceId === source.id && item.originalDate === date)),
        {
          id: makeId('override'),
          sourceId: source.id,
          originalDate: date,
          amount: action.amount,
          note: 'Temporary income change',
        },
      ];
      title = `Adjust ${format(parseDate(date), 'd MMMM')} income`;
      changes = [`${source.name}: ${formatMoney(source.amount)} → ${formatMoney(action.amount)}`, 'Only this payment will change'];
      break;
    }
    case 'permanent_income_change': {
      const source = sourceFor(state, action.incomeSourceId);
      if (!source) return unavailable(state, action, now, 'Add an income source before changing it.');
      nextState.incomes = state.incomes.map((item) => (item.id === source.id ? { ...item, amount: action.amount } : item));
      title = `Update ${source.name}`;
      changes = [`Regular amount: ${formatMoney(source.amount)} → ${formatMoney(action.amount)}`];
      break;
    }
    case 'expense_change': {
      const existing = (action.expenseId ? state.expenses.find((item) => item.id === action.expenseId) : undefined)
        ?? state.expenses.find((item) => action.name && item.name.toLowerCase().includes(action.name.toLowerCase()));
      if (existing && action.permanent) {
        nextState.expenses = state.expenses.map((item) => (item.id === existing.id ? { ...item, amount: action.amount } : item));
        title = `Update ${existing.name}`;
        changes = [`Regular cost: ${formatMoney(existing.amount)} → ${formatMoney(action.amount)}`];
      } else {
        const date = action.date ?? isoDate(now);
        const name = action.name ?? existing?.name ?? 'Unexpected expense';
        nextState.expenses = [
          ...state.expenses,
          {
            id: makeId('expense'),
            name,
            amount: action.amount,
            category: action.category ?? existing?.category ?? 'other',
            essential: action.essential ?? existing?.essential ?? true,
            schedule: action.permanent && !action.date ? { kind: 'monthly_allowance' } : { kind: 'once', date },
          },
        ];
        title = `Add ${name}`;
        changes = action.permanent && !action.date
          ? [`${formatMoney(action.amount)} monthly allowance`, 'No payment date has been invented']
          : [`${formatMoney(action.amount)} on ${format(parseDate(date), 'd MMMM yyyy')}`, 'This is treated as a one-off cost'];
      }
      break;
    }
    case 'new_goal': {
      const targetDate = tryParseDate(action.targetDate);
      if (!targetDate || targetDate < new Date(now.getFullYear(), now.getMonth(), now.getDate())) {
        return unavailable(state, action, now, 'That target date is invalid or has already passed. Please choose an upcoming date.');
      }
      nextState.goals = [
        ...state.goals,
        {
          id: makeId('goal'),
          name: action.name,
          targetAmount: action.targetAmount,
          currentAmount: action.currentAmount ?? 0,
          targetDate: action.targetDate,
          colour: '#d2387c',
        },
      ];
      title = `Create ${action.name} goal`;
      changes = [
        `Target: ${formatMoney(action.targetAmount)}`,
        `By ${format(parseDate(action.targetDate), 'd MMMM yyyy')}`,
      ];
      break;
    }
    case 'update_goal': {
      const goal = state.goals.find((item) => item.id === action.goalId);
      if (!goal) return unavailable(state, action, now, 'Cora could not match the goal you want to update.');
      if (action.targetDate) {
        const targetDate = tryParseDate(action.targetDate);
        if (!targetDate || targetDate < new Date(now.getFullYear(), now.getMonth(), now.getDate())) {
          return unavailable(state, action, now, 'That target date is invalid or has already passed. Please choose an upcoming date.');
        }
      }
      const updated = {
        ...goal,
        ...(action.name !== undefined ? { name: action.name } : {}),
        ...(action.targetAmount !== undefined ? { targetAmount: action.targetAmount } : {}),
        ...(action.currentAmount !== undefined ? { currentAmount: action.currentAmount } : {}),
        ...(action.targetDate !== undefined ? { targetDate: action.targetDate } : {}),
      };
      updated.currentAmount = Math.min(updated.currentAmount, updated.targetAmount);
      nextState.goals = state.goals.map((item) => item.id === goal.id ? updated : item);
      title = `Update ${goal.name}`;
      changes = [
        ...(action.targetDate ? [`Deadline: ${format(parseDate(goal.targetDate), 'd MMM yyyy')} → ${format(parseDate(action.targetDate), 'd MMM yyyy')}`] : []),
        ...(action.targetAmount !== undefined ? [`Target: ${formatMoney(goal.targetAmount)} → ${formatMoney(action.targetAmount)}`] : []),
        ...(action.name ? [`Name: ${goal.name} → ${action.name}`] : []),
      ];
      break;
    }
    case 'goal_contribution': {
      const goal = state.goals.find((item) => item.id === action.goalId);
      if (!goal) return unavailable(state, action, now, 'Cora could not match the goal you want to add money to.');
      const contribution = Math.min(action.amount, Math.max(0, goal.targetAmount - goal.currentAmount));
      nextState.goals = state.goals.map((item) => item.id === goal.id ? { ...item, currentAmount: item.currentAmount + contribution } : item);
      title = `Add to ${goal.name}`;
      changes = [`Add ${formatMoney(contribution)} to saved progress`, `New progress: ${formatMoney(goal.currentAmount + contribution)} of ${formatMoney(goal.targetAmount)}`];
      break;
    }
    case 'pot_transfer': {
      const currentPlan = calculatePlan(state, now);
      const from = currentPlan.pots.find((pot) => pot.id === action.fromPotId);
      const to = currentPlan.pots.find((pot) => pot.id === action.toPotId);
      if (!from || !to) return unavailable(state, action, now, 'Cora could not match both Pot names.');
      if (from.protected && from.allocation - action.amount < from.requested) {
        return unavailable(state, action, now, 'That transfer would leave a protected commitment underfunded.');
      }
      const amount = Math.min(action.amount, from.allocation);
      nextState.allocationOverrides = {
        ...state.allocationOverrides,
        [from.id]: from.allocation - amount,
        [to.id]: to.allocation + amount,
      };
      title = 'Move money between Pots';
      changes = [`${formatMoney(amount)} from ${from.name}`, `${formatMoney(amount)} into ${to.name}`];
      break;
    }
    case 'income_delay': {
      const source = sourceFor(state, action.incomeSourceId);
      if (!source) return unavailable(state, action, now, 'Add an income source before moving a payment.');
      const originalDate = targetIncomeDate(source, action.originalDate, now);
      if (!originalDate) return unavailable(state, action, now, 'Cora could not identify the affected payment.');
      const newDate = isoDate(addDays(parseDate(originalDate), action.daysLate));
      nextState.incomeOverrides = [
        ...state.incomeOverrides.filter((item) => !(item.sourceId === source.id && item.originalDate === originalDate)),
        {
          id: makeId('override'),
          sourceId: source.id,
          originalDate,
          newDate,
          amount: source.amount,
          note: `Paid ${action.daysLate} days late`,
        },
      ];
      title = `Move ${source.name} by ${action.daysLate} days`;
      changes = [
        `${format(parseDate(originalDate), 'd MMMM')} → ${format(parseDate(newDate), 'd MMMM')}`,
        'The calendar forecast will be recalculated',
      ];
      break;
    }
    case 'affordability_question': {
      canApply = false;
      const amount = action.amount ?? 0;
      const flexible = beforePlan.flexibleSpending + beforePlan.unallocated;
      title = 'Affordability check';
      explanation = amount <= flexible
        ? `${formatMoney(amount)} fits within the flexible part of this month’s plan, leaving ${formatMoney(flexible - amount)}. Your known essentials would stay covered.`
        : `Adding ${formatMoney(amount)} would be ${formatMoney(amount - flexible)} more than the flexible money currently available. Consider a smaller amount or a later payday.`;
      changes = ['No changes have been made'];
      break;
    }
    case 'scenario': {
      canApply = false;
      const reduction = action.incomeReduction ?? 0;
      const source = state.incomes[0];
      if (source && reduction > 0) {
        const simulated = previewAssistantAction(
          state,
          { type: 'temporary_income_change', summary: action.summary, incomeSourceId: source.id, amount: Math.max(0, source.amount - reduction) },
          now,
        );
        nextState = state;
        title = 'What-if result';
        explanation = simulated.afterPlan.shortfall > 0
          ? `With ${formatMoney(reduction)} less income, known essentials would have a ${formatMoney(simulated.afterPlan.shortfall)} shortfall.`
          : `With ${formatMoney(reduction)} less income, essentials remain covered. Savings and flexible spending would reduce by ${formatMoney(Math.max(0, beforePlan.savingsAllocated + beforePlan.flexibleSpending - simulated.afterPlan.savingsAllocated - simulated.afterPlan.flexibleSpending))}.`;
      }
      changes = ['This is a forecast only; your plan has not changed'];
      break;
    }
    case 'information_request':
      canApply = false;
      showBeforeAfter = false;
      title = 'Plan information';
      changes = [];
      break;
    case 'clarification':
      canApply = false;
      showBeforeAfter = false;
      title = 'Cora needs one detail';
      explanation = action.question;
      changes = ['Nothing has changed'];
      break;
    case 'explanation':
      canApply = false;
      showBeforeAfter = false;
      title = 'Cora’s answer';
      explanation = action.answer;
      changes = ['Nothing has changed'];
      break;
  }

  nextState = touch(nextState);
  const afterPlan = calculatePlan(nextState, now);
  if (canApply && action.type === 'new_goal') {
    const goal = nextState.goals.at(-1)!;
    const projection = projectGoal(nextState, goal, now);
    explanation = projection.eligibleIncomeCount
      ? `There are ${projection.eligibleIncomeCount} eligible payday${projection.eligibleIncomeCount === 1 ? '' : 's'} before the deadline, so the calculated contribution is ${formatMoney(projection.contributionPerIncome)} each time. Nothing will be taken from your balance until you confirm this plan.`
      : `There is no known payday before this deadline. The goal can be saved, but it needs another funding date or a later target to produce a workable contribution.`;
  }
  if (canApply && action.type === 'update_goal') {
    const goal = nextState.goals.find((item) => item.id === action.goalId)!;
    const projection = projectGoal(nextState, goal, now);
    explanation = projection.eligibleIncomeCount
      ? `With the proposed deadline, ${formatMoney(projection.contributionPerIncome)} is needed on each of ${projection.eligibleIncomeCount} eligible payday${projection.eligibleIncomeCount === 1 ? '' : 's'}.`
      : 'The proposed deadline has no eligible payday before it, so the goal would need another funding date or a later target.';
  }
  if (canApply && action.type !== 'financial_profile' && beforePlan.expectedIncome !== afterPlan.expectedIncome) {
    const difference = afterPlan.expectedIncome - beforePlan.expectedIncome;
    explanation = difference < 0
      ? `Income is ${formatMoney(Math.abs(difference))} lower for this plan. Essential commitments are protected first; savings and flexible spending adjust around them.`
      : `${formatMoney(difference)} more income is available in this plan. Your priorities have been recalculated without changing known bills.`;
  }
  return { action, title, explanation, changes, nextState, beforePlan, afterPlan, canApply, showBeforeAfter };
}

function mergeByName<T extends { name: string }>(current: T[], incoming: T[]): T[] {
  const merged = [...current];
  for (const item of incoming) {
    const index = merged.findIndex((existing) => existing.name.trim().toLowerCase() === item.name.trim().toLowerCase());
    if (index >= 0) merged[index] = { ...item, ...('id' in merged[index] ? { id: (merged[index] as T & { id: string }).id } : {}) };
    else merged.push(item);
  }
  return merged;
}

function unavailable(state: FinancialState, action: AssistantAction, now: Date, message: string): ActionPreview {
  const plan = calculatePlan(state, now);
  return {
    action,
    title: 'One more detail is needed',
    explanation: message,
    changes: ['Nothing has changed'],
    nextState: state,
    beforePlan: plan,
    afterPlan: plan,
    canApply: false,
    showBeforeAfter: false,
  };
}
