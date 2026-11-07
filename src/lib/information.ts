import { addDays, format } from 'date-fns';
import type { AssistantAction, FinancialState } from '../types';
import { calculatePlan, expenseAmountForMonth, expenseEventsForRange, incomeEventsForRange, projectGoal } from './engine';
import { formatMoney } from './money';
import { parseDate } from './dates';

type InformationAction = Extract<AssistantAction, { type: 'information_request' }>;

export function answerInformationRequest(state: FinancialState, action: InformationAction, now = new Date()): string {
  const plan = calculatePlan(state, now);
  switch (action.topic) {
    case 'monthly_costs': {
      const fixed = state.expenses
        .filter((expense) => expense.schedule.kind !== 'monthly_allowance')
        .reduce((sum, expense) => sum + expenseAmountForMonth(expense, now), 0);
      const allowances = state.expenses
        .filter((expense) => expense.schedule.kind === 'monthly_allowance')
        .reduce((sum, expense) => sum + expense.amount, 0);
      if (!fixed && !allowances) return 'You have not added any regular costs yet.';
      if (allowances) {
        return `Your fixed regular payments total ${formatMoney(fixed)} this month. You also have ${formatMoney(allowances)} in ongoing spending allowances, making ${formatMoney(fixed + allowances)} of planned regular spending altogether.`;
      }
      return `Your regular costs total ${formatMoney(fixed)} this month, based on the payments currently stored in your plan.`;
    }
    case 'next_payday': {
      const next = incomeEventsForRange(state, now, addDays(now, 400)).sort((a, b) => a.date.localeCompare(b.date))[0];
      return next
        ? `Your next known income is ${formatMoney(next.amount)} from ${next.name} on ${format(parseDate(next.date), 'd MMMM yyyy')}.`
        : 'There is no upcoming income date in the plan yet.';
    }
    case 'savings':
      return state.goals.length
        ? `This month’s plan puts ${formatMoney(plan.savingsAllocated)} towards savings. You have ${state.goals.length} active goal${state.goals.length === 1 ? '' : 's'}, with ${formatMoney(state.goals.reduce((sum, goal) => sum + goal.currentAmount, 0))} recorded as saved so far.`
        : `This month’s plan puts ${formatMoney(plan.savingsAllocated)} into savings. You have not added a named savings goal yet.`;
    case 'personal_spending':
      return `After known commitments and planned savings, ${formatMoney(plan.flexibleSpending)} is allocated to flexible personal spending this month.${plan.shortfall ? ` There is also a ${formatMoney(plan.shortfall)} shortfall in protected needs.` : ''}`;
    case 'upcoming_bills': {
      const bills = expenseEventsForRange(state, now, addDays(now, 7));
      if (!bills.length) return 'There are no dated bill payments due in the next seven days. Monthly spending allowances are still included in your budget without being assigned a made-up payment date.';
      return `In the next seven days: ${bills.map((bill) => `${bill.name} — ${formatMoney(bill.amount)} on ${format(parseDate(bill.date), 'd MMMM')}`).join('; ')}.`;
    }
    case 'goal_progress': {
      const goal = (action.goalId ? state.goals.find((item) => item.id === action.goalId) : undefined) ?? state.goals[0];
      if (!goal) return 'You do not have a savings goal in the plan yet.';
      const projection = projectGoal(state, goal, now);
      if (!projection.validDeadline) return `${goal.name} has an invalid target date. Please edit the goal before relying on its projection.`;
      if (!projection.eligibleIncomeCount && projection.remaining) return `${goal.name} has ${formatMoney(projection.remaining)} left, but there is no eligible payday before its current deadline.`;
      return `${goal.name} has ${formatMoney(goal.currentAmount)} saved of ${formatMoney(goal.targetAmount)}. The plan suggests ${formatMoney(projection.contributionPerIncome)} on each of ${projection.eligibleIncomeCount} eligible payday${projection.eligibleIncomeCount === 1 ? '' : 's'} before the deadline.`;
    }
  }
}

export function boundedHistory<T>(history: T[], limit = 24): T[] {
  return history.slice(-limit);
}
