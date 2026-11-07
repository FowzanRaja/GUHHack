import { z } from 'zod';

const money = z.number().int().nonnegative().max(100_000_000_000);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const schedule = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('once'), date: isoDate }),
  z.object({ kind: z.literal('monthly'), day: z.number().int().min(1).max(31) }),
  z.object({ kind: z.literal('weekly'), anchorDate: isoDate }),
  z.object({ kind: z.literal('fortnightly'), anchorDate: isoDate }),
  z.object({ kind: z.literal('interval'), anchorDate: isoDate, everyDays: z.number().int().min(1).max(365) }),
]);
const category = z.enum(['bills', 'food', 'transport', 'subscriptions', 'personal', 'other']);

export const actionSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('financial_profile'),
    summary: z.string().min(1).max(500),
    incomes: z.array(z.object({ name: z.string().min(1).max(80), amount: money, schedule })).max(20),
    expenses: z.array(z.object({
      name: z.string().min(1).max(80),
      amount: money,
      category,
      essential: z.boolean(),
      schedule,
    })).max(50),
    currentBalance: money.optional(),
    missingInformation: z.array(z.string().max(150)).max(8).optional(),
  }),
  z.object({
    type: z.literal('temporary_income_change'),
    summary: z.string().min(1).max(500),
    incomeSourceId: z.string().max(100).optional(),
    amount: money,
    date: isoDate.optional(),
  }),
  z.object({
    type: z.literal('permanent_income_change'),
    summary: z.string().min(1).max(500),
    incomeSourceId: z.string().max(100).optional(),
    amount: money,
  }),
  z.object({
    type: z.literal('expense_change'),
    summary: z.string().min(1).max(500),
    expenseId: z.string().max(100).optional(),
    name: z.string().max(80).optional(),
    amount: money,
    date: isoDate.optional(),
    permanent: z.boolean(),
    category: category.optional(),
    essential: z.boolean().optional(),
  }),
  z.object({
    type: z.literal('new_goal'),
    summary: z.string().min(1).max(500),
    name: z.string().min(1).max(80),
    targetAmount: money,
    currentAmount: money.optional(),
    targetDate: isoDate,
  }),
  z.object({
    type: z.literal('pot_transfer'),
    summary: z.string().min(1).max(500),
    fromPotId: z.string().min(1).max(100),
    toPotId: z.string().min(1).max(100),
    amount: money,
  }),
  z.object({
    type: z.literal('income_delay'),
    summary: z.string().min(1).max(500),
    incomeSourceId: z.string().max(100).optional(),
    originalDate: isoDate.optional(),
    daysLate: z.number().int().min(1).max(90),
  }),
  z.object({
    type: z.literal('affordability_question'),
    summary: z.string().min(1).max(500),
    amount: money.optional(),
  }),
  z.object({
    type: z.literal('scenario'),
    summary: z.string().min(1).max(500),
    incomeReduction: money.optional(),
    month: z.string().max(40).optional(),
  }),
  z.object({ type: z.literal('clarification'), summary: z.string().min(1).max(500), question: z.string().min(1).max(500) }),
  z.object({ type: z.literal('explanation'), summary: z.string().min(1).max(500), answer: z.string().min(1).max(800) }),
]);

export const assistantResponseSchema = z.object({
  message: z.string().min(1).max(800),
  action: actionSchema,
});

export const assistantRequestSchema = z.object({
  message: z.string().trim().min(1).max(2000),
  state: z.object({
    currentBalance: money,
    incomes: z.array(z.unknown()).max(20),
    expenses: z.array(z.unknown()).max(50),
    goals: z.array(z.unknown()).max(30),
    manualPots: z.array(z.unknown()).max(30),
    incomeOverrides: z.array(z.unknown()).max(100),
    allocationOverrides: z.record(z.string(), money),
  }).passthrough(),
});

export const assistantToolSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['message', 'action'],
  properties: {
    message: { type: 'string', description: 'A concise, supportive response in UK English.' },
    action: {
      oneOf: [
        {
          type: 'object', additionalProperties: false,
          required: ['type', 'summary', 'incomes', 'expenses'],
          properties: {
            type: { const: 'financial_profile' }, summary: { type: 'string' },
            currentBalance: { type: 'integer', minimum: 0 }, missingInformation: { type: 'array', items: { type: 'string' } },
            incomes: { type: 'array', items: { $ref: '#/$defs/income' } },
            expenses: { type: 'array', items: { $ref: '#/$defs/expense' } },
          },
        },
        {
          type: 'object', additionalProperties: false, required: ['type', 'summary', 'amount'],
          properties: { type: { const: 'temporary_income_change' }, summary: { type: 'string' }, incomeSourceId: { type: 'string' }, amount: { type: 'integer', minimum: 0 }, date: { type: 'string' } },
        },
        {
          type: 'object', additionalProperties: false, required: ['type', 'summary', 'amount'],
          properties: { type: { const: 'permanent_income_change' }, summary: { type: 'string' }, incomeSourceId: { type: 'string' }, amount: { type: 'integer', minimum: 0 } },
        },
        {
          type: 'object', additionalProperties: false, required: ['type', 'summary', 'amount', 'permanent'],
          properties: { type: { const: 'expense_change' }, summary: { type: 'string' }, expenseId: { type: 'string' }, name: { type: 'string' }, amount: { type: 'integer', minimum: 0 }, date: { type: 'string' }, permanent: { type: 'boolean' }, category: { $ref: '#/$defs/category' }, essential: { type: 'boolean' } },
        },
        {
          type: 'object', additionalProperties: false, required: ['type', 'summary', 'name', 'targetAmount', 'targetDate'],
          properties: { type: { const: 'new_goal' }, summary: { type: 'string' }, name: { type: 'string' }, targetAmount: { type: 'integer', minimum: 0 }, currentAmount: { type: 'integer', minimum: 0 }, targetDate: { type: 'string' } },
        },
        {
          type: 'object', additionalProperties: false, required: ['type', 'summary', 'fromPotId', 'toPotId', 'amount'],
          properties: { type: { const: 'pot_transfer' }, summary: { type: 'string' }, fromPotId: { type: 'string' }, toPotId: { type: 'string' }, amount: { type: 'integer', minimum: 0 } },
        },
        {
          type: 'object', additionalProperties: false, required: ['type', 'summary', 'daysLate'],
          properties: { type: { const: 'income_delay' }, summary: { type: 'string' }, incomeSourceId: { type: 'string' }, originalDate: { type: 'string' }, daysLate: { type: 'integer', minimum: 1 } },
        },
        {
          type: 'object', additionalProperties: false, required: ['type', 'summary'],
          properties: { type: { const: 'affordability_question' }, summary: { type: 'string' }, amount: { type: 'integer', minimum: 0 } },
        },
        {
          type: 'object', additionalProperties: false, required: ['type', 'summary'],
          properties: { type: { const: 'scenario' }, summary: { type: 'string' }, incomeReduction: { type: 'integer', minimum: 0 }, month: { type: 'string' } },
        },
        {
          type: 'object', additionalProperties: false, required: ['type', 'summary', 'question'],
          properties: { type: { const: 'clarification' }, summary: { type: 'string' }, question: { type: 'string' } },
        },
        {
          type: 'object', additionalProperties: false, required: ['type', 'summary', 'answer'],
          properties: { type: { const: 'explanation' }, summary: { type: 'string' }, answer: { type: 'string' } },
        },
      ],
    },
  },
  $defs: {
    category: { type: 'string', enum: ['bills', 'food', 'transport', 'subscriptions', 'personal', 'other'] },
    schedule: {
      oneOf: [
        { type: 'object', additionalProperties: false, required: ['kind', 'date'], properties: { kind: { const: 'once' }, date: { type: 'string' } } },
        { type: 'object', additionalProperties: false, required: ['kind', 'day'], properties: { kind: { const: 'monthly' }, day: { type: 'integer', minimum: 1, maximum: 31 } } },
        { type: 'object', additionalProperties: false, required: ['kind', 'anchorDate'], properties: { kind: { enum: ['weekly', 'fortnightly'] }, anchorDate: { type: 'string' } } },
        { type: 'object', additionalProperties: false, required: ['kind', 'anchorDate', 'everyDays'], properties: { kind: { const: 'interval' }, anchorDate: { type: 'string' }, everyDays: { type: 'integer', minimum: 1 } } },
      ],
    },
    income: { type: 'object', additionalProperties: false, required: ['name', 'amount', 'schedule'], properties: { name: { type: 'string' }, amount: { type: 'integer', minimum: 0 }, schedule: { $ref: '#/$defs/schedule' } } },
    expense: { type: 'object', additionalProperties: false, required: ['name', 'amount', 'category', 'essential', 'schedule'], properties: { name: { type: 'string' }, amount: { type: 'integer', minimum: 0 }, category: { $ref: '#/$defs/category' }, essential: { type: 'boolean' }, schedule: { $ref: '#/$defs/schedule' } } },
  },
} as const;
