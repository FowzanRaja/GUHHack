import { z } from 'zod';

const money = z.number().int().nonnegative().max(100_000_000_000);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const schedule = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('once'), date: isoDate }),
  z.object({ kind: z.literal('monthly'), day: z.number().int().min(1).max(31) }),
  z.object({ kind: z.literal('monthly_allowance') }),
  z.object({ kind: z.literal('weekly'), anchorDate: isoDate }),
  z.object({ kind: z.literal('fortnightly'), anchorDate: isoDate }),
  z.object({ kind: z.literal('interval'), anchorDate: isoDate, everyDays: z.number().int().min(1).max(365) }),
]);
const category = z.enum(['bills', 'food', 'transport', 'subscriptions', 'personal', 'other']);
const goalInput = z.object({ name: z.string().min(1).max(80), targetAmount: money, currentAmount: money.optional(), targetDate: isoDate });

export const pendingActionSchema = z.object({
  intent: z.enum(['new_goal', 'update_goal', 'financial_profile', 'expense_change', 'income_change']),
  known: z.object({
    name: z.string().max(80).optional(), targetAmount: money.optional(), currentAmount: money.optional(), targetDate: isoDate.optional(),
    targetMonth: z.string().regex(/^\d{4}-\d{2}$/).optional(), goalId: z.string().max(100).optional(), amount: money.optional(),
    date: isoDate.optional(), permanent: z.boolean().optional(),
  }),
  missing: z.array(z.enum(['name', 'targetAmount', 'targetDate', 'goalId', 'amount', 'date'])).max(6),
  question: z.string().min(1).max(500),
  createdAt: z.string().min(1).max(40),
});

export const actionSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('financial_profile'), summary: z.string().min(1).max(500), profileMode: z.enum(['create', 'replace', 'merge']),
    incomes: z.array(z.object({ name: z.string().min(1).max(80), amount: money, schedule })).max(20),
    expenses: z.array(z.object({ name: z.string().min(1).max(80), amount: money, category, essential: z.boolean(), schedule })).max(50),
    goals: z.array(goalInput).max(20).optional(), currentBalance: money.optional(), emergencyFundContribution: money.optional(),
    missingInformation: z.array(z.string().max(150)).max(8).optional(),
  }),
  z.object({ type: z.literal('temporary_income_change'), summary: z.string().min(1).max(500), incomeSourceId: z.string().max(100).optional(), amount: money, date: isoDate.optional() }),
  z.object({ type: z.literal('permanent_income_change'), summary: z.string().min(1).max(500), incomeSourceId: z.string().max(100).optional(), amount: money }),
  z.object({ type: z.literal('expense_change'), summary: z.string().min(1).max(500), expenseId: z.string().max(100).optional(), name: z.string().max(80).optional(), amount: money, date: isoDate.optional(), permanent: z.boolean(), category: category.optional(), essential: z.boolean().optional() }),
  z.object({ type: z.literal('new_goal'), summary: z.string().min(1).max(500), ...goalInput.shape }),
  z.object({ type: z.literal('update_goal'), summary: z.string().min(1).max(500), goalId: z.string().min(1).max(100), name: z.string().min(1).max(80).optional(), targetAmount: money.optional(), currentAmount: money.optional(), targetDate: isoDate.optional() }),
  z.object({ type: z.literal('goal_contribution'), summary: z.string().min(1).max(500), goalId: z.string().min(1).max(100), amount: money }),
  z.object({ type: z.literal('pot_transfer'), summary: z.string().min(1).max(500), fromPotId: z.string().min(1).max(100), toPotId: z.string().min(1).max(100), amount: money }),
  z.object({ type: z.literal('income_delay'), summary: z.string().min(1).max(500), incomeSourceId: z.string().max(100).optional(), originalDate: isoDate.optional(), daysLate: z.number().int().min(1).max(90) }),
  z.object({ type: z.literal('affordability_question'), summary: z.string().min(1).max(500), amount: money.optional() }),
  z.object({ type: z.literal('scenario'), summary: z.string().min(1).max(500), incomeReduction: money.optional(), month: z.string().max(40).optional() }),
  z.object({ type: z.literal('information_request'), summary: z.string().min(1).max(500), topic: z.enum(['monthly_costs', 'next_payday', 'savings', 'personal_spending', 'upcoming_bills', 'goal_progress']), goalId: z.string().max(100).optional() }),
  z.object({ type: z.literal('clarification'), summary: z.string().min(1).max(500), question: z.string().min(1).max(500), pending: pendingActionSchema }),
  z.object({ type: z.literal('explanation'), summary: z.string().min(1).max(500), answer: z.string().min(1).max(800) }),
]);

export const assistantResponseSchema = z.object({ message: z.string().min(1).max(800), action: actionSchema });
const historyMessage = z.object({ role: z.enum(['assistant', 'user']), text: z.string().min(1).max(2000), timestamp: z.string().max(40).optional() });

export const assistantRequestSchema = z.object({
  message: z.string().trim().min(1).max(2000), history: z.array(historyMessage).max(24).default([]), pending: pendingActionSchema.optional(),
  state: z.object({
    currentBalance: money.nullable(), incomes: z.array(z.unknown()).max(20), expenses: z.array(z.unknown()).max(50), goals: z.array(z.unknown()).max(30),
    manualPots: z.array(z.unknown()).max(30), incomeOverrides: z.array(z.unknown()).max(100), allocationOverrides: z.record(z.string(), money),
    emergencyFundContribution: money.nullable().optional(),
  }).passthrough(),
});

const actionTypes = [
  'financial_profile', 'temporary_income_change', 'permanent_income_change', 'expense_change', 'new_goal', 'update_goal',
  'goal_contribution', 'pot_transfer', 'income_delay', 'affordability_question', 'scenario', 'information_request', 'clarification', 'explanation',
];

export const assistantToolSchema = {
  type: 'object', additionalProperties: false, required: ['message', 'action'],
  properties: {
    message: { type: 'string', description: 'A concise, supportive response in UK English. Do not independently quote calculated totals.' },
    action: {
      type: 'object', additionalProperties: false, required: ['type', 'summary'],
      properties: {
        type: { type: 'string', enum: actionTypes }, summary: { type: 'string' }, profileMode: { type: 'string', enum: ['create', 'replace', 'merge'] },
        incomes: { type: 'array', items: { $ref: '#/$defs/income' } }, expenses: { type: 'array', items: { $ref: '#/$defs/expense' } }, goals: { type: 'array', items: { $ref: '#/$defs/goal' } },
        currentBalance: { type: 'integer', minimum: 0 }, emergencyFundContribution: { type: 'integer', minimum: 0 }, missingInformation: { type: 'array', items: { type: 'string' } },
        incomeSourceId: { type: 'string' }, expenseId: { type: 'string' }, goalId: { type: 'string' }, name: { type: 'string' }, amount: { type: 'integer', minimum: 0 },
        date: { type: 'string' }, originalDate: { type: 'string' }, permanent: { type: 'boolean' }, category: { $ref: '#/$defs/category' }, essential: { type: 'boolean' },
        targetAmount: { type: 'integer', minimum: 0 }, currentAmount: { type: 'integer', minimum: 0 }, targetDate: { type: 'string' }, fromPotId: { type: 'string' }, toPotId: { type: 'string' },
        daysLate: { type: 'integer', minimum: 1 }, incomeReduction: { type: 'integer', minimum: 0 }, month: { type: 'string' },
        topic: { type: 'string', enum: ['monthly_costs', 'next_payday', 'savings', 'personal_spending', 'upcoming_bills', 'goal_progress'] },
        question: { type: 'string' }, answer: { type: 'string' }, pending: { $ref: '#/$defs/pending' },
      },
    },
  },
  $defs: {
    category: { type: 'string', enum: ['bills', 'food', 'transport', 'subscriptions', 'personal', 'other'] },
    schedule: { oneOf: [
      { type: 'object', additionalProperties: false, required: ['kind', 'date'], properties: { kind: { const: 'once' }, date: { type: 'string' } } },
      { type: 'object', additionalProperties: false, required: ['kind', 'day'], properties: { kind: { const: 'monthly' }, day: { type: 'integer', minimum: 1, maximum: 31 } } },
      { type: 'object', additionalProperties: false, required: ['kind'], properties: { kind: { const: 'monthly_allowance' } } },
      { type: 'object', additionalProperties: false, required: ['kind', 'anchorDate'], properties: { kind: { enum: ['weekly', 'fortnightly'] }, anchorDate: { type: 'string' } } },
      { type: 'object', additionalProperties: false, required: ['kind', 'anchorDate', 'everyDays'], properties: { kind: { const: 'interval' }, anchorDate: { type: 'string' }, everyDays: { type: 'integer', minimum: 1 } } },
    ] },
    income: { type: 'object', additionalProperties: false, required: ['name', 'amount', 'schedule'], properties: { name: { type: 'string' }, amount: { type: 'integer', minimum: 0 }, schedule: { $ref: '#/$defs/schedule' } } },
    expense: { type: 'object', additionalProperties: false, required: ['name', 'amount', 'category', 'essential', 'schedule'], properties: { name: { type: 'string' }, amount: { type: 'integer', minimum: 0 }, category: { $ref: '#/$defs/category' }, essential: { type: 'boolean' }, schedule: { $ref: '#/$defs/schedule' } } },
    goal: { type: 'object', additionalProperties: false, required: ['name', 'targetAmount', 'targetDate'], properties: { name: { type: 'string' }, targetAmount: { type: 'integer', minimum: 0 }, currentAmount: { type: 'integer', minimum: 0 }, targetDate: { type: 'string' } } },
    pending: {
      type: 'object', additionalProperties: false, required: ['intent', 'known', 'missing', 'question', 'createdAt'],
      properties: {
        intent: { type: 'string', enum: ['new_goal', 'update_goal', 'financial_profile', 'expense_change', 'income_change'] },
        known: { type: 'object', additionalProperties: false, properties: { name: { type: 'string' }, targetAmount: { type: 'integer', minimum: 0 }, currentAmount: { type: 'integer', minimum: 0 }, targetDate: { type: 'string' }, targetMonth: { type: 'string' }, goalId: { type: 'string' }, amount: { type: 'integer', minimum: 0 }, date: { type: 'string' }, permanent: { type: 'boolean' } } },
        missing: { type: 'array', items: { type: 'string' } }, question: { type: 'string' }, createdAt: { type: 'string' },
      },
    },
  },
};
