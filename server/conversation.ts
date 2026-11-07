import { isAfter, isValid, parseISO, startOfDay } from 'date-fns';
import type { z } from 'zod';
import type { assistantResponseSchema, pendingActionSchema } from './schemas.js';

export type PendingAction = z.infer<typeof pendingActionSchema>;
export type ValidatedAssistantResponse = z.infer<typeof assistantResponseSchema>;

const MONTHS: Record<string, number> = {
  jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2, apr: 3, april: 3, may: 4, jun: 5, june: 5,
  jul: 6, july: 6, aug: 7, august: 7, sep: 8, sept: 8, september: 8, oct: 9, october: 9, nov: 10, november: 10, dec: 11, december: 11,
};

function toIso(year: number, month: number, day: number): string | undefined {
  const candidate = new Date(year, month, day);
  if (candidate.getFullYear() !== year || candidate.getMonth() !== month || candidate.getDate() !== day) return undefined;
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function parseContextualDate(message: string, now: Date, targetMonth?: string): string | undefined {
  const clean = message.trim().toLowerCase().replace(/\./g, '').replace(/\b(\d{1,2})(st|nd|rd|th)\b/g, '$1').replace(/^the\s+/, '');
  const full = clean.match(/^(\d{1,2})(?:\s+of)?\s+([a-z]+)(?:\s+(\d{4}))?$/);
  if (full) {
    const day = Number(full[1]);
    const month = MONTHS[full[2]];
    if (month === undefined) return undefined;
    let year = full[3] ? Number(full[3]) : now.getFullYear();
    let iso = toIso(year, month, day);
    if (!iso) return undefined;
    if (!full[3] && !isAfter(parseISO(iso), startOfDay(now))) {
      year += 1;
      iso = toIso(year, month, day);
    }
    return iso;
  }
  const dayOnly = clean.match(/^(\d{1,2})$/);
  if (dayOnly && targetMonth) {
    const [year, month] = targetMonth.split('-').map(Number);
    return toIso(year, month - 1, Number(dayOnly[1]));
  }
  const iso = parseISO(clean);
  return /^\d{4}-\d{2}-\d{2}$/.test(clean) && isValid(iso) ? clean : undefined;
}

export function resolvePendingClarification(pending: PendingAction | undefined, message: string, now: Date): ValidatedAssistantResponse | undefined {
  if (!pending || pending.intent !== 'new_goal' || !pending.missing.includes('targetDate') || pending.known.targetAmount === undefined) return undefined;
  const targetDate = parseContextualDate(message, now, pending.known.targetMonth);
  if (!targetDate || !isAfter(parseISO(targetDate), startOfDay(now))) return undefined;
  const name = pending.known.name || 'Savings goal';
  return {
    message: `Thanks — I’ve used ${formatSpokenDate(targetDate)} as the deadline. I’ll calculate the contribution from the eligible paydays before then; please review the proposal before applying it.`,
    action: {
      type: 'new_goal',
      summary: `Create ${name} with the clarified deadline.`,
      name,
      targetAmount: pending.known.targetAmount,
      currentAmount: pending.known.currentAmount ?? 0,
      targetDate,
    },
  };
}

export function guardGoalDates(response: ValidatedAssistantResponse, now: Date): ValidatedAssistantResponse {
  if (response.action.type !== 'new_goal' && response.action.type !== 'update_goal') return response;
  const targetDate = response.action.targetDate;
  if (!targetDate) return response;
  const parsed = parseISO(targetDate);
  if (isValid(parsed) && isAfter(parsed, startOfDay(now))) return response;
  const pending: PendingAction = {
    intent: response.action.type,
    known: response.action.type === 'new_goal'
      ? { name: response.action.name, targetAmount: response.action.targetAmount, currentAmount: response.action.currentAmount }
      : { goalId: response.action.goalId },
    missing: ['targetDate'],
    question: 'What upcoming date would you like to use for this savings goal?',
    createdAt: now.toISOString(),
  };
  return {
    message: 'That deadline is invalid or has already passed. What upcoming date would you like to use instead?',
    action: { type: 'clarification', summary: 'An upcoming savings deadline is required.', question: pending.question, pending },
  };
}

function formatSpokenDate(iso: string): string {
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(parseISO(iso));
}
