import { useMemo, useState } from 'react';
import { addMonths, eachDayOfInterval, endOfMonth, endOfWeek, format, isSameDay, isSameMonth, startOfMonth, startOfWeek } from 'date-fns';
import { AlertTriangle, ArrowDownLeft, ArrowUpRight, ChevronLeft, ChevronRight, CircleDot, Info, PiggyBank, WalletCards } from 'lucide-react';
import type { AvailableAfterPots, DailyForecast, FinancialEvent, FinancialState } from '../types';
import { calendarEvents, dailyForecast } from '../lib/engine';
import { formatMoney } from '../lib/money';
import { isoDate, parseDate } from '../lib/dates';
import { Modal } from '../components/Modal';

export function CalendarView({ state }: { state: FinancialState }) {
  const [month, setMonth] = useState(startOfMonth(new Date()));
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const gridStart = startOfWeek(startOfMonth(month), { weekStartsOn: 1 });
  const gridEnd = endOfWeek(endOfMonth(month), { weekStartsOn: 1 });
  const days = eachDayOfInterval({ start: gridStart, end: gridEnd });
  const events = useMemo(() => calendarEvents(state, startOfMonth(month), endOfMonth(month)), [state, month]);
  const forecast = useMemo(() => dailyForecast(state, gridStart, gridEnd), [state, gridStart.getTime(), gridEnd.getTime()]);
  const byDate = useMemo(() => new Map(forecast.map((day) => [day.date, day])), [forecast]);
  const selectedDay = selectedDate ? byDate.get(selectedDate) ?? dailyForecast(state, parseDate(selectedDate), parseDate(selectedDate))[0] : undefined;
  const incomeTotal = events.filter((event) => event.type === 'income').reduce((sum, event) => sum + event.amount, 0);
  const expenseTotal = events.filter((event) => event.type === 'expense').reduce((sum, event) => sum + event.amount, 0);
  const warnings = events.filter((event) => event.type === 'warning').length;
  const allowances = state.expenses.filter((expense) => expense.schedule.kind === 'monthly_allowance');
  const allowanceTotal = allowances.reduce((sum, expense) => sum + expense.amount, 0);

  function moveMonth(amount: number) {
    setMonth((current) => addMonths(current, amount));
    setSelectedDate(null);
  }

  return (
    <div className="space-y-6 animate-enter">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div><span className="eyebrow"><CircleDot size={13} /> Cash-flow forecast</span><h1 className="page-title">Financial calendar</h1><p className="page-subtitle">A continuous balance from the date you last entered it — never reset at a month boundary.</p></div>
        <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white p-1.5 shadow-sm">
          <button onClick={() => moveMonth(-1)} className="calendar-nav focus-ring" aria-label="Previous month"><ChevronLeft /></button>
          <button onClick={() => { setMonth(startOfMonth(new Date())); setSelectedDate(null); }} className="min-w-36 rounded-xl px-3 py-2 text-sm font-bold text-cora-950 hover:bg-cora-50 focus-ring">{format(month, 'MMMM yyyy')}</button>
          <button onClick={() => moveMonth(1)} className="calendar-nav focus-ring" aria-label="Next month"><ChevronRight /></button>
        </div>
      </div>

      <section className="grid gap-3 sm:grid-cols-3" aria-label={`${format(month, 'MMMM')} totals`}>
        <MonthStat label="Income scheduled" value={formatMoney(incomeTotal)} icon={ArrowDownLeft} tone="income" />
        <MonthStat label="Payments scheduled" value={formatMoney(expenseTotal)} icon={ArrowUpRight} tone="expense" />
        <MonthStat label="Timing warnings" value={String(warnings)} icon={AlertTriangle} tone={warnings ? 'warning' : 'safe'} />
      </section>

      {(allowanceTotal > 0 || state.currentBalance === null || !state.balanceAsOf) && <div className="grid gap-3 sm:grid-cols-2">
        {allowanceTotal > 0 && <div className="flex items-start gap-3 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-950"><WalletCards size={18} className="mt-0.5 shrink-0" /><div><strong>Ongoing monthly allowances: {formatMoney(allowanceTotal)}</strong><p className="mt-0.5 text-xs leading-5 text-blue-800">{allowances.map((expense) => `${expense.name} ${formatMoney(expense.amount)}`).join(' · ')}. Included in Pots without inventing a payment date, so not deducted from daily balances.</p></div></div>}
        {(state.currentBalance === null || !state.balanceAsOf) && <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950"><Info size={18} className="mt-0.5 shrink-0" /><div><strong>Known balance not provided</strong><p className="mt-0.5 text-xs leading-5 text-amber-800">Dated events are shown, but opening balances, closing balances and shortfall warnings are unavailable.</p></div></div>}
      </div>}

      <article className="card overflow-hidden p-0">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-4 sm:px-6">
          <div className="flex flex-wrap gap-4 text-xs font-semibold text-slate-600" aria-label="Calendar legend"><Legend colour="bg-emerald-500" label="Income" /><Legend colour="bg-cora-600" label="Payment" /><Legend colour="bg-rosebank" label="Goal" /><Legend colour="bg-amber-500" label="Warning" /></div>
          <span className="flex items-center gap-1.5 text-xs text-slate-500"><Info size={14} /> Pots are earmarked, not counted as spending</span>
        </div>
        <div className="calendar-grid border-b border-slate-100 bg-slate-50/70" aria-hidden="true">{['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => <div className="px-1 py-2.5 text-center text-[11px] font-bold uppercase tracking-wider text-slate-500" key={day}>{day}</div>)}</div>
        <div className="calendar-grid" role="grid" aria-label={`${format(month, 'MMMM yyyy')} financial events`}>
          {days.map((day) => {
            const date = isoDate(day);
            const dayForecast = byDate.get(date);
            const dayEvents = dayForecast?.events ?? [];
            const currentMonth = isSameMonth(day, month);
            const isToday = isSameDay(day, new Date());
            return <button key={date} onClick={() => setSelectedDate(date)} className={`calendar-day focus-ring ${currentMonth ? '' : 'calendar-day-muted'}`} role="gridcell" aria-label={`${format(day, 'EEEE d MMMM')}, ${dayEvents.length} financial events. ${dayForecast?.closingBalance === undefined ? 'Closing balance unavailable' : `Closing balance ${formatMoney(dayForecast.closingBalance)}`}`}>
              <span className={`calendar-number ${isToday ? 'calendar-today' : ''}`}>{format(day, 'd')}</span>
              <span className="mt-2 hidden space-y-1 sm:block">
                {dayEvents.slice(0, 2).map((event) => <span key={event.id} className={`calendar-event calendar-event-${event.type}`}><span className="flex min-w-0 items-center gap-0.5">{event.type === 'income' && <ArrowDownLeft size={10} className="shrink-0" aria-hidden="true" />}{event.type === 'expense' && <ArrowUpRight size={10} className="shrink-0" aria-hidden="true" />}<span className="truncate">{event.name}</span></span>{event.type !== 'warning' && <span className="font-bold">{event.type === 'income' ? '+' : event.type === 'expense' ? '−' : ''}{formatMoney(event.amount, { compact: true })}</span>}</span>)}
                {dayEvents.length > 2 && <span className="block pl-1 text-[10px] font-semibold text-slate-500">+{dayEvents.length - 2} more</span>}
                {currentMonth && <span className={`block pt-1 text-[10px] font-bold ${dayForecast?.closingBalance !== undefined && dayForecast.closingBalance < 0 ? 'text-red-700' : 'text-slate-500'}`}>{dayForecast?.closingBalance === undefined ? 'Balance —' : formatMoney(dayForecast.closingBalance, { compact: true })}</span>}
              </span>
              <span className="mt-2 flex flex-wrap justify-center gap-1 sm:hidden" aria-hidden="true">{dayEvents.slice(0, 4).map((event) => <span key={event.id} className={`h-1.5 w-1.5 rounded-full dot-${event.type}`} />)}</span>
            </button>;
          })}
        </div>
      </article>

      {selectedDate && selectedDay && <DayDialog day={selectedDay} onClose={() => setSelectedDate(null)} />}
    </div>
  );
}

function DayDialog({ day, onClose }: { day: DailyForecast; onClose: () => void }) {
  const negative = day.closingBalance !== undefined && day.closingBalance < 0;
  return <Modal title={format(parseDate(day.date), 'EEEE d MMMM yyyy')} description="Daily cash-flow details based on the information saved in this prototype." onClose={onClose}>
    <section className="grid grid-cols-2 gap-3" aria-label="Daily totals">
      <DayFigure label="Money in" value={formatMoney(day.income)} tone="income" />
      <DayFigure label="Money out" value={formatMoney(day.expenses)} tone="expense" />
      <DayFigure label="Closing balance" value={day.closingBalance === undefined ? 'Unavailable' : formatMoney(day.closingBalance)} tone={negative ? 'warning' : 'balance'} detail="Projected account balance" />
      <AfterPotsFigure value={day.availableAfterPots} />
    </section>
    {day.openingBalance !== undefined && <p className="mt-3 text-xs text-slate-500">Opening balance: <strong className="text-slate-700">{formatMoney(day.openingBalance)}</strong></p>}
    <div className="mt-5 space-y-3">{day.events.map((event) => <DayEvent event={event} key={event.id} />)}{day.events.length === 0 && <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-7 text-center"><CircleDot className="mx-auto text-slate-300" /><p className="mt-2 text-sm font-semibold text-slate-700">Nothing planned</p><p className="mt-1 text-xs text-slate-500">The balance still carries forward from the previous day.</p></div>}</div>
    {day.closingBalance === undefined && <div className="mt-5 rounded-2xl bg-amber-50 p-4 text-sm text-amber-900"><strong>Daily balance unavailable</strong><p className="mt-1 text-xs leading-5">Add a known balance in Cora. Dates before that balance was known remain unavailable rather than being guessed.</p></div>}
    {negative && <div className="mt-5 rounded-2xl bg-red-50 p-4 text-sm text-red-900" role="alert"><strong>Potential shortfall of {formatMoney(Math.abs(day.closingBalance!))}</strong><p className="mt-1 text-xs leading-5">This is based on saved dated events. Ongoing allowances without a payment date are not included.</p></div>}
  </Modal>;
}

function DayFigure({ label, value, tone, detail }: { label: string; value: string; tone: string; detail?: string }) { return <div className={`rounded-2xl p-3 day-figure-${tone}`}><span className="block text-[10px] font-bold uppercase tracking-wider opacity-70">{label}</span><strong className="mt-1 block text-base">{value}</strong>{detail && <small className="mt-0.5 block text-[11px] leading-4 opacity-75">{detail}</small>}</div>; }

function AfterPotsFigure({ value }: { value?: AvailableAfterPots }) {
  const negative = value?.status === 'available' && value.amount < 0;
  return (
    <div className={`rounded-2xl p-3 ${negative ? 'day-figure-warning' : 'day-figure-pots'}`}>
      <span className="block text-[10px] font-bold uppercase tracking-wider opacity-70">Available after Pots</span>
      <strong className="mt-1 block text-base">{value?.status === 'available' ? formatMoney(value.amount) : 'Unavailable'}</strong>
      <small className="mt-0.5 block text-[11px] leading-4 opacity-75">
        {!value ? 'Needs a known balance for this date.' : value.status === 'unavailable' ? value.reason : 'Projected closing balance excluding money earmarked for Pots.'}
      </small>
      {value?.status === 'available' && value.items.length > 0 && (
        <details className="mt-1.5 text-[11px] leading-4">
          <summary className="cursor-pointer rounded font-semibold focus-ring">{formatMoney(value.reserved)} earmarked</summary>
          <ul className="mt-1 space-y-0.5">
            {value.items.map((item) => <li key={`${item.kind}-${item.name}-${item.date ?? ''}`} className="flex justify-between gap-2"><span className="truncate">{item.kind === 'bill' && item.date ? `${item.name} · ${format(parseDate(item.date), 'd MMM')}` : `${item.name} Pot`}</span><span className="font-semibold">{formatMoney(item.amount)}</span></li>)}
          </ul>
          <p className="mt-1 opacity-75">Bills due before the {format(parseDate(value.nextPayday), 'd MMM')} payday, plus savings earmarked since your balance was last updated. Pots are earmarks, not payments.</p>
        </details>
      )}
    </div>
  );
}
function MonthStat({ label, value, icon: Icon, tone }: { label: string; value: string; icon: typeof ArrowDownLeft; tone: string }) { return <article className="month-stat"><span className={`month-stat-icon month-${tone}`}><Icon size={18} /></span><span><span className="block text-xs font-semibold text-slate-500">{label}</span><strong className="mt-0.5 block text-lg text-cora-950">{value}</strong></span></article>; }
function Legend({ colour, label }: { colour: string; label: string }) { return <span className="flex items-center gap-1.5"><span className={`h-2.5 w-2.5 rounded-full ${colour}`} />{label}</span>; }
function DayEvent({ event }: { event: FinancialEvent }) {
  const Icon = event.type === 'income' ? ArrowDownLeft : event.type === 'expense' ? ArrowUpRight : event.type === 'goal' ? PiggyBank : event.type === 'allocation' ? WalletCards : AlertTriangle;
  return <div className={`day-event day-event-${event.type}`}><span className="day-event-icon"><Icon size={17} /></span><div className="min-w-0 flex-1"><p className="text-sm font-semibold text-slate-900">{event.name}</p>{event.detail && <p className="mt-0.5 text-xs leading-4 text-slate-500">{event.detail}</p>}</div>{event.type !== 'warning' && <strong className="text-sm text-slate-900">{event.type === 'income' ? '+' : event.type === 'expense' ? '−' : ''}{formatMoney(event.amount, { compact: true })}</strong>}</div>;
}
