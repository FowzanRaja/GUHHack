import {
  addDays,
  compareAsc,
  differenceInCalendarDays,
  endOfMonth,
  format,
  isAfter,
  isBefore,
  isEqual,
  isValid,
  parseISO,
  setDate,
  startOfDay,
} from 'date-fns';
import type { Schedule } from '../types';

export const isoDate = (date: Date): string => format(date, 'yyyy-MM-dd');

export function parseDate(value: string): Date {
  const parsed = parseISO(value);
  return isValid(parsed) ? startOfDay(parsed) : startOfDay(new Date());
}

export function monthlyOccurrence(year: number, monthIndex: number, day: number): Date {
  const monthStart = new Date(year, monthIndex, 1);
  const lastDay = endOfMonth(monthStart).getDate();
  return setDate(monthStart, Math.min(Math.max(day, 1), lastDay));
}

export function scheduleDates(schedule: Schedule, from: Date, to: Date): Date[] {
  const start = startOfDay(from);
  const end = startOfDay(to);
  if (isAfter(start, end)) return [];

  if (schedule.kind === 'once') {
    const date = parseDate(schedule.date);
    return !isBefore(date, start) && !isAfter(date, end) ? [date] : [];
  }

  if (schedule.kind === 'monthly') {
    const dates: Date[] = [];
    let cursor = new Date(start.getFullYear(), start.getMonth(), 1);
    const finalMonth = new Date(end.getFullYear(), end.getMonth(), 1);
    while (!isAfter(cursor, finalMonth)) {
      const occurrence = monthlyOccurrence(cursor.getFullYear(), cursor.getMonth(), schedule.day);
      if (!isBefore(occurrence, start) && !isAfter(occurrence, end)) dates.push(occurrence);
      cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
    }
    return dates;
  }

  const anchor = parseDate(schedule.anchorDate);
  const step = schedule.kind === 'weekly' ? 7 : schedule.kind === 'fortnightly' ? 14 : Math.max(1, schedule.everyDays);
  let cursor = anchor;
  if (isBefore(cursor, start)) {
    const elapsed = differenceInCalendarDays(start, cursor);
    cursor = addDays(cursor, Math.ceil(elapsed / step) * step);
  }
  const dates: Date[] = [];
  while (!isAfter(cursor, end)) {
    if (!isBefore(cursor, start)) dates.push(cursor);
    cursor = addDays(cursor, step);
  }
  return dates;
}

export function nextScheduleDate(schedule: Schedule, after: Date, horizonDays = 400): Date | undefined {
  return scheduleDates(schedule, after, addDays(after, horizonDays)).sort(compareAsc)[0];
}

export function isSameIsoDate(a: Date, iso: string): boolean {
  return isEqual(startOfDay(a), parseDate(iso));
}
