import { addDays, format } from 'date-fns';
import type { AssistantAction, FinancialState } from '../types';
import { calculatePlan, expenseAmountForMonth, expenseEventsForRange, goalPaydayBreakdown, incomeEventsForRange } from './engine';
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
      const source = next?.sourceId ? state.incomes.find((income) => income.id === next.sourceId) : undefined;
      const temporary = source && source.amount !== next?.amount;
      return next
        ? `Your next known income is ${formatMoney(next.amount)} from ${next.name} on ${format(parseDate(next.date), 'd MMMM yyyy')}.${temporary ? ` This is a temporary adjustment; the regular amount remains ${formatMoney(source.amount)}.` : ''}`
        : 'There is no upcoming income date in the plan yet.';
    }
    case 'savings': {
      const parts = plan.pots
        .filter((pot) => pot.priority === 'savings' && pot.allocation > 0)
        .map((pot) => `${formatMoney(pot.allocation)} ${pot.id === 'emergency' ? 'emergency buffer' : `for ${pot.name}`}`);
      const breakdown = parts.length ? ` (${parts.join(' + ')})` : '';
      const saved = state.goals.reduce((sum, goal) => sum + goal.currentAmount, 0);
      const goalsText = state.goals.length
        ? ` You have ${state.goals.length} active goal${state.goals.length === 1 ? '' : 's'}, with ${formatMoney(saved)} recorded as already saved.`
        : ' You have not added a named savings goal yet.';
      return `Your planned savings this month are ${formatMoney(plan.savingsAllocated)}${breakdown}. These are planned contributions, not money already saved.${goalsText}${emergencyExplanation(state, plan)}`;
    }
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
      const breakdown = goalPaydayBreakdown(state, goal, now);
      if (!tryDate(goal.targetDate)) return `${goal.name} has an invalid target date. Please edit the goal before relying on its projection.`;
      if (!breakdown.eligiblePaydays && breakdown.remaining) return `${goal.name} has ${formatMoney(breakdown.remaining)} left, but there is no eligible payday before its current deadline.`;
      return `${goal.name} has ${formatMoney(goal.currentAmount)} saved of ${formatMoney(goal.targetAmount)}, leaving ${formatMoney(breakdown.remaining)}. The affordable recommendation for the next eligible payday is ${formatMoney(breakdown.recommendedContribution)}.${breakdown.onTrack ? ' The current schedule is on track.' : ' At the current affordable rate, the deadline needs adjusting.'}`;
    }
  }
}

function emergencyExplanation(state: FinancialState, plan: ReturnType<typeof calculatePlan>): string {
  const amount = state.emergencyFundContribution ?? 0;
  if (!amount) return ' There is no emergency buffer in your plan. I can suggest one, but nothing is added unless you confirm.';
  if (state.emergencyFundPaused) return ` Your ${formatMoney(amount)} emergency buffer is paused, so nothing is planned for it.`;
  const origin = state.emergencyFundOrigin === 'customer'
    ? 'is an amount you chose'
    : state.emergencyFundOrigin === 'cora'
      ? 'is an amount I recommended and you approved'
      : 'was already in your plan, so please review it — you can change or pause it in Your details';
  const needs = plan.essentialCommitments + plan.everydayNeeds;
  return ` The ${formatMoney(amount)} monthly emergency buffer ${origin}. It is only planned after your ${formatMoney(needs)} of bills and everyday needs are covered, and before goal contributions.`;
}

function tryDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(`${value}T12:00:00`).getTime());
}

export function boundedHistory<T>(history: T[], limit = 24): T[] {
  return history.slice(-limit);
}
