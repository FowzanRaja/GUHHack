import { useMemo, useState } from 'react';
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  startOfMonth,
  startOfWeek,
} from 'date-fns';
import { AlertTriangle, ArrowDownLeft, ArrowUpRight, ChevronLeft, ChevronRight, CircleDot, Info, PiggyBank, WalletCards } from 'lucide-react';
import type { FinancialEvent, FinancialState } from '../types';
import { calendarEvents } from '../lib/engine';
import { formatMoney } from '../lib/money';
import { isoDate, parseDate } from '../lib/dates';

export function CalendarView({ state }: { state: FinancialState }) {
  const [month, setMonth] = useState(startOfMonth(new Date()));
  const [selectedDate, setSelectedDate] = useState(isoDate(new Date()));
  const gridStart = startOfWeek(startOfMonth(month), { weekStartsOn: 1 });
  const gridEnd = endOfWeek(endOfMonth(month), { weekStartsOn: 1 });
  const days = eachDayOfInterval({ start: gridStart, end: gridEnd });
  const events = useMemo(() => calendarEvents(state, startOfMonth(month), endOfMonth(month)), [state, month]);
  const byDate = useMemo(() => events.reduce((grouped, event) => {
    const current = grouped.get(event.date) ?? [];
    current.push(event);
    grouped.set(event.date, current);
    return grouped;
  }, new Map<string, FinancialEvent[]>()), [events]);
  const selectedEvents = byDate.get(selectedDate) ?? [];
  const incomeTotal = events.filter((event) => event.type === 'income').reduce((sum, event) => sum + event.amount, 0);
  const expenseTotal = events.filter((event) => event.type === 'expense').reduce((sum, event) => sum + event.amount, 0);
  const warnings = events.filter((event) => event.type === 'warning').length;
  const allowances = state.expenses.filter((expense) => expense.schedule.kind === 'monthly_allowance');
  const allowanceTotal = allowances.reduce((sum, expense) => sum + expense.amount, 0);

  function moveMonth(amount: number) {
    const next = addMonths(month, amount);
    setMonth(next);
    setSelectedDate(isoDate(startOfMonth(next)));
  }

  return (
    <div className="space-y-6 animate-enter">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <span className="eyebrow"><CircleDot size={13} /> Cash-flow forecast</span>
          <h1 className="page-title">Financial calendar</h1>
          <p className="page-subtitle">See when money arrives, when payments leave, and where timing could get tight.</p>
        </div>
        <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white p-1.5 shadow-sm">
          <button onClick={() => moveMonth(-1)} className="calendar-nav focus-ring" aria-label="Previous month"><ChevronLeft /></button>
          <button onClick={() => { const now = startOfMonth(new Date()); setMonth(now); setSelectedDate(isoDate(new Date())); }} className="min-w-36 rounded-xl px-3 py-2 text-sm font-bold text-cora-950 hover:bg-cora-50 focus-ring">{format(month, 'MMMM yyyy')}</button>
          <button onClick={() => moveMonth(1)} className="calendar-nav focus-ring" aria-label="Next month"><ChevronRight /></button>
        </div>
      </div>

      <section className="grid gap-3 sm:grid-cols-3" aria-label={`${format(month, 'MMMM')} totals`}>
        <MonthStat label="Income scheduled" value={formatMoney(incomeTotal)} icon={ArrowDownLeft} tone="income" />
        <MonthStat label="Payments scheduled" value={formatMoney(expenseTotal)} icon={ArrowUpRight} tone="expense" />
        <MonthStat label="Timing warnings" value={String(warnings)} icon={AlertTriangle} tone={warnings ? 'warning' : 'safe'} />
      </section>

      {(allowanceTotal > 0 || state.currentBalance === null) && (
        <div className="grid gap-3 sm:grid-cols-2">
          {allowanceTotal > 0 && <div className="flex items-start gap-3 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-950"><WalletCards size={18} className="mt-0.5 shrink-0" /><div><strong>Ongoing monthly allowances: {formatMoney(allowanceTotal)}</strong><p className="mt-0.5 text-xs leading-5 text-blue-800">{allowances.map((expense) => `${expense.name} ${formatMoney(expense.amount)}`).join(' · ')}. Included in Pots without a made-up payment date.</p></div></div>}
          {state.currentBalance === null && <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950"><Info size={18} className="mt-0.5 shrink-0" /><div><strong>Opening balance not provided</strong><p className="mt-0.5 text-xs leading-5 text-amber-800">Dated events are shown, but estimated balances and shortfall warnings are paused.</p></div></div>}
        </div>
      )}

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <article className="card overflow-hidden p-0">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-4 sm:px-6">
            <div className="flex flex-wrap gap-4 text-xs font-semibold text-slate-600" aria-label="Calendar legend">
              <Legend colour="bg-emerald-500" label="Income" />
              <Legend colour="bg-cora-600" label="Payment" />
              <Legend colour="bg-rosebank" label="Goal" />
              <Legend colour="bg-amber-500" label="Warning" />
            </div>
            <span className="flex items-center gap-1.5 text-xs text-slate-500"><Info size={14} /> Pots are earmarked, not counted as spending</span>
          </div>
          <div className="calendar-grid border-b border-slate-100 bg-slate-50/70" aria-hidden="true">
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => <div className="px-1 py-2.5 text-center text-[11px] font-bold uppercase tracking-wider text-slate-500" key={day}>{day}</div>)}
          </div>
          <div className="calendar-grid" role="grid" aria-label={`${format(month, 'MMMM yyyy')} financial events`}>
            {days.map((day) => {
              const date = isoDate(day);
              const dayEvents = byDate.get(date) ?? [];
              const currentMonth = isSameMonth(day, month);
              const selected = date === selectedDate;
              const isToday = isSameDay(day, new Date());
              return (
                <button
                  key={date}
                  onClick={() => setSelectedDate(date)}
                  className={`calendar-day focus-ring ${currentMonth ? '' : 'calendar-day-muted'} ${selected ? 'calendar-day-selected' : ''}`}
                  role="gridcell"
                  aria-selected={selected}
                  aria-label={`${format(day, 'EEEE d MMMM')}, ${dayEvents.length} financial events`}
                >
                  <span className={`calendar-number ${isToday ? 'calendar-today' : ''}`}>{format(day, 'd')}</span>
                  <span className="mt-2 hidden space-y-1 sm:block">
                    {dayEvents.slice(0, 3).map((event) => (
                      <span key={event.id} className={`calendar-event calendar-event-${event.type}`}>
                        <span className="truncate">{event.name}</span>
                        {event.type !== 'warning' && <span className="font-bold">{event.type === 'income' ? '+' : event.type === 'expense' ? '−' : ''}{formatMoney(event.amount, { compact: true })}</span>}
                      </span>
                    ))}
                    {dayEvents.length > 3 && <span className="block pl-1 text-[10px] font-semibold text-slate-500">+{dayEvents.length - 3} more</span>}
                  </span>
                  <span className="mt-2 flex flex-wrap justify-center gap-1 sm:hidden" aria-hidden="true">
                    {dayEvents.slice(0, 4).map((event) => <span key={event.id} className={`h-1.5 w-1.5 rounded-full dot-${event.type}`} />)}
                  </span>
                </button>
              );
            })}
          </div>
        </article>

        <aside className="card card-roomy self-start xl:sticky xl:top-28">
          <span className="eyebrow">Selected day</span>
          <h2 className="mt-2 text-2xl font-bold text-cora-950">{format(parseDate(selectedDate), 'd MMMM')}</h2>
          <p className="text-sm text-slate-500">{format(parseDate(selectedDate), 'EEEE')}</p>
          <div className="mt-5 space-y-3">
            {selectedEvents.map((event) => <DayEvent event={event} key={event.id} />)}
            {selectedEvents.length === 0 && (
              <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-8 text-center">
                <CircleDot className="mx-auto text-slate-300" />
                <p className="mt-2 text-sm font-semibold text-slate-700">Nothing planned</p>
                <p className="mt-1 text-xs text-slate-500">Select another day to inspect its events.</p>
              </div>
            )}
          </div>
          {selectedEvents.at(-1)?.runningBalance !== undefined && (
            <div className={`mt-5 rounded-2xl p-4 ${selectedEvents.at(-1)!.runningBalance! < 0 ? 'bg-red-50 text-red-900' : 'bg-cora-50 text-cora-950'}`}>
              <p className="text-xs font-semibold uppercase tracking-wider opacity-70">Estimated balance after this day</p>
              <p className="mt-1 text-xl font-bold">{formatMoney(selectedEvents.at(-1)!.runningBalance!)}</p>
              <p className="mt-1 text-xs opacity-70">Based only on the balance and events you’ve entered.</p>
            </div>
          )}
        </aside>
      </section>
    </div>
  );
}

function MonthStat({ label, value, icon: Icon, tone }: { label: string; value: string; icon: typeof ArrowDownLeft; tone: string }) {
  return <article className="month-stat"><span className={`month-stat-icon month-${tone}`}><Icon size={18} /></span><span><span className="block text-xs font-semibold text-slate-500">{label}</span><strong className="mt-0.5 block text-lg text-cora-950">{value}</strong></span></article>;
}

function Legend({ colour, label }: { colour: string; label: string }) {
  return <span className="flex items-center gap-1.5"><span className={`h-2.5 w-2.5 rounded-full ${colour}`} />{label}</span>;
}

function DayEvent({ event }: { event: FinancialEvent }) {
  const Icon = event.type === 'income' ? ArrowDownLeft : event.type === 'expense' ? ArrowUpRight : event.type === 'goal' ? PiggyBank : event.type === 'allocation' ? WalletCards : AlertTriangle;
  return (
    <div className={`day-event day-event-${event.type}`}>
      <span className="day-event-icon"><Icon size={17} /></span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-slate-900">{event.name}</p>
        {event.detail && <p className="mt-0.5 text-xs leading-4 text-slate-500">{event.detail}</p>}
      </div>
      {event.type !== 'warning' && <strong className="text-sm text-slate-900">{event.type === 'income' ? '+' : event.type === 'expense' ? '−' : ''}{formatMoney(event.amount, { compact: true })}</strong>}
    </div>
  );
}
