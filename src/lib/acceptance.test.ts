import { addMonths } from 'date-fns';
import { describe, expect, it } from 'vitest';
import { guardGoalDates, parseContextualDate, resolvePendingClarification } from '../../server/conversation';
import { migrateState } from '../hooks/useFinancialState';
import type { FinancialState, PendingAssistantAction } from '../types';
import { previewAssistantAction } from './actions';
import { calendarEvents, calculatePlan, projectGoal } from './engine';
import { demoState, emptyState } from './demo';
import { answerInformationRequest, boundedHistory } from './information';
import { poundsToPennies } from './money';
import { isoDate } from './dates';

const NOW = new Date(2026, 10, 7, 12);

function acceptanceState(): FinancialState {
  const state = emptyState();
  state.currentBalance = poundsToPennies(900);
  state.incomes = [{ id: 'salary', name: 'Salary', amount: poundsToPennies(1800), schedule: { kind: 'monthly', day: 25 } }];
  state.expenses = [
    { id: 'rent', name: 'Rent', amount: poundsToPennies(650), category: 'bills', essential: true, schedule: { kind: 'monthly', day: 1 } },
    { id: 'energy', name: 'Electricity and gas', amount: poundsToPennies(90), category: 'bills', essential: true, schedule: { kind: 'monthly', day: 5 } },
    { id: 'phone', name: 'Phone', amount: poundsToPennies(30), category: 'bills', essential: true, schedule: { kind: 'monthly', day: 10 } },
    { id: 'internet', name: 'Internet', amount: poundsToPennies(35), category: 'bills', essential: true, schedule: { kind: 'monthly', day: 15 } },
    { id: 'groceries', name: 'Groceries', amount: poundsToPennies(200), category: 'food', essential: false, schedule: { kind: 'monthly_allowance' } },
    { id: 'transport', name: 'Transport', amount: poundsToPennies(100), category: 'transport', essential: false, schedule: { kind: 'monthly_allowance' } },
    { id: 'subscriptions', name: 'Subscriptions', amount: poundsToPennies(25), category: 'subscriptions', essential: false, schedule: { kind: 'monthly', day: 20 } },
  ];
  state.goals = [{ id: 'holiday', name: 'Holiday', targetAmount: poundsToPennies(1000), currentAmount: 0, targetDate: isoDate(addMonths(NOW, 6)), colour: '#d2387c' }];
  state.emergencyFundContribution = poundsToPennies(150);
  return state;
}

describe('acceptance budget consistency', () => {
  it('reconciles fixed costs, undated allowances, savings and personal spending to £1,800', () => {
    const state = acceptanceState();
    const plan = calculatePlan(state, NOW);
    expect(plan.expectedIncome).toBe(poundsToPennies(1800));
    expect(plan.pots.find((pot) => pot.id === 'category-bills')?.allocation).toBe(poundsToPennies(805));
    expect(plan.pots.find((pot) => pot.id === 'category-subscriptions')?.allocation).toBe(poundsToPennies(25));
    expect(plan.pots.find((pot) => pot.id === 'category-food')?.allocation).toBe(poundsToPennies(200));
    expect(plan.pots.find((pot) => pot.id === 'category-transport')?.allocation).toBe(poundsToPennies(100));
    expect(plan.pots.find((pot) => pot.id === 'emergency')?.allocation).toBe(poundsToPennies(150));
    expect(plan.pots.find((pot) => pot.goalId === 'holiday')?.allocation).toBe(16667);
    expect(plan.pots.find((pot) => pot.id === 'personal')?.allocation).toBe(35333);
    expect(plan.totalAllocated).toBe(poundsToPennies(1800));
    expect(plan.shortfall).toBe(0);
  });

  it('keeps undated allowances out of dated cash-flow impacts', () => {
    const state = acceptanceState();
    const events = calendarEvents(state, new Date(2026, 10, 1), new Date(2026, 10, 30));
    expect(events.some((event) => event.sourceId === 'groceries' || event.sourceId === 'transport')).toBe(false);
    expect(events.filter((event) => event.type === 'expense').reduce((sum, event) => sum + event.amount, 0)).toBe(poundsToPennies(830));
    expect(events.reduce((sum, event) => sum + event.balanceImpact, 0)).toBe(poundsToPennies(970));
  });

  it('answers informational cost questions from engine data without changing state', () => {
    const state = acceptanceState();
    const before = structuredClone(state);
    const answer = answerInformationRequest(state, { type: 'information_request', summary: 'Monthly costs', topic: 'monthly_costs' }, NOW);
    expect(answer).toContain('£830.00');
    expect(answer).toContain('£300.00');
    expect(answer).toContain('£1,130.00');
    expect(state).toEqual(before);
  });

  it('creates a complete profile proposal without presenting it as an income windfall', () => {
    const old = demoState(NOW);
    old.incomes[0].amount = poundsToPennies(800);
    const proposed = acceptanceState();
    const preview = previewAssistantAction(old, {
      type: 'financial_profile', summary: 'Replace the profile', profileMode: 'replace',
      incomes: proposed.incomes.map(({ name, amount, schedule }) => ({ name, amount, schedule })),
      expenses: proposed.expenses.map(({ name, amount, category, essential, schedule }) => ({ name, amount, category, essential, schedule })),
      goals: proposed.goals.map(({ name, targetAmount, currentAmount, targetDate }) => ({ name, targetAmount, currentAmount, targetDate })),
      emergencyFundContribution: poundsToPennies(150),
    }, NOW);
    expect(preview.canApply).toBe(true);
    expect(preview.showBeforeAfter).toBe(false);
    expect(preview.explanation).not.toContain('more income');
    expect(preview.nextState.expenses).toHaveLength(7);
    expect(preview.nextState.goals).toHaveLength(1);
    expect(preview.afterPlan.totalAllocated).toBe(poundsToPennies(1800));
  });
});

describe('conversation continuity and goal dates', () => {
  const pending: PendingAssistantAction = {
    intent: 'new_goal',
    known: { name: 'Savings goal', targetAmount: poundsToPennies(100), targetMonth: '2026-12' },
    missing: ['targetDate'],
    question: 'What date next month would you like to reach your goal?',
    createdAt: NOW.toISOString(),
  };

  it('resolves “7th Dec” as the deadline for the pending £100 goal', () => {
    expect(parseContextualDate('7th Dec.', NOW)).toBe('2026-12-07');
    const resolved = resolvePendingClarification(pending, '7th Dec.', NOW);
    expect(resolved?.action).toMatchObject({ type: 'new_goal', targetAmount: 10000, targetDate: '2026-12-07' });
  });

  it('uses the pending target month for a day-only reply', () => {
    expect(parseContextualDate('7th', NOW, '2026-12')).toBe('2026-12-07');
  });

  it('does not consume an unrelated topic as the pending date', () => {
    expect(resolvePendingClarification(pending, 'How much are my bills?', NOW)).toBeUndefined();
  });

  it('preserves bounded conversation and pending state through storage migration', () => {
    const state = emptyState();
    state.conversation = {
      history: boundedHistory(Array.from({ length: 30 }, (_, index) => ({ id: String(index), role: index % 2 ? 'user' as const : 'assistant' as const, text: `Message ${index}`, timestamp: NOW.toISOString() }))),
      pending,
      proposal: { type: 'new_goal', summary: 'Goal ready to confirm', name: 'Savings goal', targetAmount: 10000, targetDate: '2026-12-07' },
    };
    const restored = migrateState(JSON.parse(JSON.stringify(state)));
    expect(restored.conversation.history).toHaveLength(24);
    expect(restored.conversation.pending).toEqual(pending);
    expect(restored.conversation.proposal).toEqual(state.conversation.proposal);
  });

  it('turns a model-proposed past goal deadline into clarification', () => {
    const guarded = guardGoalDates({ message: 'Create it', action: { type: 'new_goal', summary: 'Goal', name: 'Family holiday', targetAmount: 100000, targetDate: '2006-02-24' } }, NOW);
    expect(guarded.action.type).toBe('clarification');
    if (guarded.action.type === 'clarification') expect(guarded.action.pending?.known.targetAmount).toBe(100000);
  });

  it('preserves a stored past goal but marks it non-actionable until edited', () => {
    const state = acceptanceState();
    state.goals[0].targetDate = '2006-02-24';
    const projection = projectGoal(state, state.goals[0], NOW);
    expect(state.goals).toHaveLength(1);
    expect(projection.eligibleIncomeCount).toBe(0);
    expect(projection.affordable).toBe(false);
  });
});

describe('demo reset data', () => {
  it('replaces modifications with one clean, original demo dataset', () => {
    const modified = demoState(NOW);
    modified.incomes[0].amount = poundsToPennies(1300);
    modified.goals.push({ id: 'extra', name: 'Extra', targetAmount: 10000, currentAmount: 0, targetDate: '2026-12-07', colour: '#000' });
    modified.conversation.history.push({ id: 'extra-message', role: 'user', text: 'changed', timestamp: NOW.toISOString() });
    const reset = demoState(NOW);
    expect(reset.incomes).toHaveLength(1);
    expect(reset.incomes[0].amount).toBe(poundsToPennies(1800));
    expect(reset.expenses).toHaveLength(4);
    expect(reset.goals).toHaveLength(1);
    expect(reset.conversation.history).toHaveLength(1);
    expect(reset.incomeOverrides).toHaveLength(0);
  });
});
