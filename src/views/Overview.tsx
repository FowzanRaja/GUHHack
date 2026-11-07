import { useMemo, useState, type ReactNode } from 'react';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowUpRight,
  CalendarClock,
  ChevronRight,
  CirclePoundSterling,
  Edit3,
  Landmark,
  Plus,
  Sparkles,
  Target,
  WalletCards,
} from 'lucide-react';
import type { FinancialPlan, FinancialState, PlannedPot, PotReserveItem } from '../types';
import { calculateAvailableToday, forecastNextDays, incomeEventsForRange } from '../lib/engine';
import { formatMoney } from '../lib/money';
import { parseDate, scheduleDates, tryParseDate } from '../lib/dates';
import { addDays, endOfMonth, format, startOfMonth } from 'date-fns';
import { Modal } from '../components/Modal';
import { MoneyInput } from '../components/MoneyInput';
import type { NavSection } from '../components/Layout';

interface OverviewProps {
  state: FinancialState;
  plan: FinancialPlan;
  onNavigate: (section: NavSection) => void;
  onLoadDemo: () => void;
  onSetAllocation: (id: string, value: number) => void;
  onAddPot: (name: string, allocation: number) => void;
}

export function Overview({ state, plan, onNavigate, onLoadDemo, onSetAllocation, onAddPot }: OverviewProps) {
  const [editing, setEditing] = useState<PlannedPot | null>(null);
  const [adding, setAdding] = useState(false);
  const upcoming = useMemo(
    () => forecastNextDays(state, 45).filter((event) => event.type === 'income' || event.type === 'expense').slice(0, 5),
    [state],
  );
  const hasData = state.incomes.length > 0 || state.expenses.length > 0;
  const availableToday = useMemo(() => calculateAvailableToday(state), [state]);
  const regularIncome = useMemo(() => {
    const reference = new Date(`${plan.month}-01T12:00:00`);
    return state.incomes.reduce((sum, income) => sum + income.amount * scheduleDates(income.schedule, startOfMonth(reference), endOfMonth(reference)).length, 0);
  }, [plan.month, state.incomes]);
  const temporaryIncomeChange = regularIncome !== plan.expectedIncome;
  const nextPayday = useMemo(
    () => incomeEventsForRange(state, new Date(), addDays(new Date(), 400)).filter((event) => event.amount > 0).sort((a, b) => a.date.localeCompare(b.date))[0],
    [state],
  );
  const savingsPots = plan.pots.filter((pot) => pot.priority === 'savings' && pot.allocation > 0);
  const savingsBreakdown = savingsPots.map((pot) => `${formatMoney(pot.allocation, { compact: true })} ${pot.id === 'emergency' ? 'emergency buffer' : pot.goalId ? `${pot.name.toLowerCase()} goal` : pot.name}`).join(' + ');
  const balanceToday = availableToday.status === 'available' ? availableToday.balance : state.currentBalance;
  const incomeDetail = temporaryIncomeChange
    ? `Includes a one-off change · regular income ${formatMoney(regularIncome, { compact: true })}`
    : nextPayday
      ? `Next payday ${format(parseDate(nextPayday.date), 'd MMM')}: ${formatMoney(nextPayday.amount, { compact: true })}`
      : 'No payday scheduled this month';

  if (!hasData) {
    return (
      <div className="space-y-6 animate-enter">
        <div><span className="eyebrow"><WalletCards size={14} /> Monthly picture</span><h1 className="page-title">Overview</h1><p className="page-subtitle">Your Smart Pots, monthly totals and upcoming payments will appear here.</p></div>
        <section className="empty-state card">
          <div className="empty-state-icon"><WalletCards size={30} /></div>
          <h2 className="mt-5 text-2xl font-bold text-cora-950">Your overview is ready to be built</h2>
          <p className="mt-2 max-w-lg text-sm leading-6 text-slate-600">Add your income and regular costs with Cora, or load the demo to explore a complete plan.</p>
          <div className="mt-6 flex flex-wrap justify-center gap-3"><button onClick={() => onNavigate('cora')} className="button-primary focus-ring">Build my plan</button><button onClick={onLoadDemo} className="button-secondary focus-ring"><Sparkles size={17} /> Try the £1,800 demo</button></div>
        </section>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-enter">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <span className="eyebrow"><span className="status-dot" /> Your monthly plan</span>
          <h1 className="page-title">Good {partOfDay()}, {state.customerName || 'there'}.</h1>
          <p className="page-subtitle">Here’s how your money is organised for {format(new Date(`${plan.month}-01T12:00:00`), 'MMMM')}.</p>
        </div>
        <button onClick={() => onNavigate('cora')} className="button-primary focus-ring"><Sparkles size={17} /> Ask Cora to adjust it</button>
      </div>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Financial summary">
        <SummaryCard icon={CirclePoundSterling} label="Expected income this month" value={formatMoney(plan.expectedIncome, { compact: true })} detail={incomeDetail} tone="purple" />
        <SummaryCard
          icon={Target}
          label="Planned savings this month"
          value={formatMoney(plan.savingsAllocated, { compact: true })}
          detail={savingsPots.length ? <><span className="block">{savingsBreakdown}</span><span className="block text-slate-400">Planned contributions, not yet saved</span></> : 'No savings contributions planned this month'}
          tone="green"
        />
        <SummaryCard icon={WalletCards} label="Flexible spending" value={formatMoney(plan.flexibleSpending, { compact: true })} detail="Left for you after bills, needs and savings" tone="pink" />
        <SummaryCard icon={Landmark} label="Balance today" value={balanceToday === null ? 'Not added' : formatMoney(balanceToday, { compact: true })} detail={balanceToday === null ? 'Add your balance in Cora to see what you can spend' : 'Projected from the balance you entered'} tone="blue" />
      </section>

      {plan.shortfall > 0 ? (
        <div className="notice notice-danger" role="alert"><AlertTriangle aria-hidden="true" /><div><strong>There’s a {formatMoney(plan.shortfall)} shortfall.</strong><p>Your known essentials and everyday needs cost more than this month’s available income. Cora has not hidden or reduced them.</p></div><button onClick={() => onNavigate('cora')}>Review options</button></div>
      ) : plan.notices.some((notice) => notice.id === 'goal-pressure') ? (
        <div className="notice border-amber-200 bg-amber-50 text-amber-950" role="status"><AlertTriangle aria-hidden="true" /><div><strong>A goal deadline needs attention.</strong><p>Known commitments are covered, but the affordable savings contribution is below the amount needed to stay on schedule.</p></div><button onClick={() => onNavigate('cora')}>Review goal</button></div>
      ) : null}

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(340px,0.7fr)]">
        <article className="card card-roomy overflow-hidden">
          <div className="flex items-start justify-between gap-4">
            <div>
              <span className="eyebrow">Payday plan</span>
              <h2 className="section-title">Your Smart Pots</h2>
              <p className="section-subtitle">Based on what you’ve told Cora — not a fixed percentage split.</p>
            </div>
            <button onClick={() => setAdding(true)} className="button-quiet focus-ring"><Plus size={16} /> Add Pot</button>
          </div>
          <div className="mt-6 grid items-center gap-8 lg:grid-cols-[340px_1fr]">
            <AllocationChart plan={plan} />
            <div className="space-y-2" aria-label="Pot allocation list">
              {plan.pots.map((pot) => (
                <button key={pot.id} onClick={() => setEditing(pot)} className="pot-row focus-ring">
                  <span className="pot-swatch" style={{ backgroundColor: pot.colour }} aria-hidden="true" />
                  <span className="min-w-0 flex-1 text-left">
                    <span className="block truncate text-sm font-semibold text-slate-900">{pot.name}</span>
                    <span className="block truncate text-xs text-slate-500">{pot.description}</span>
                  </span>
                  <span className="text-right">
                    <span className="block text-sm font-bold text-cora-950">{formatMoney(pot.allocation, { compact: true })}</span>
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{plan.expectedIncome ? Math.round((pot.allocation / plan.expectedIncome) * 100) : 0}% · {pot.priority}</span>
                  </span>
                  <Edit3 size={15} className="text-slate-400" aria-hidden="true" />
                </button>
              ))}
              {plan.unallocated > 0 && <div className="pot-row"><span className="pot-swatch bg-slate-400" aria-hidden="true" /><span className="min-w-0 flex-1"><span className="block text-sm font-semibold text-slate-900">Money left to assign</span><span className="block text-xs text-slate-500">Not yet given a purpose</span></span><span className="text-right"><span className="block text-sm font-bold text-cora-950">{formatMoney(plan.unallocated, { compact: true })}</span><span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{plan.expectedIncome ? Math.round((plan.unallocated / plan.expectedIncome) * 100) : 0}%</span></span></div>}
            </div>
          </div>
          <div className={`mt-6 grid gap-2 ${plan.unallocated > 0 ? 'sm:grid-cols-2' : ''}`} aria-label="What you can spend">
            <PlanFigure
              label="Available to spend today"
              value={availableToday.status === 'available' ? formatMoney(availableToday.amount) : 'Unavailable'}
              detail={availableToday.status === 'available' ? <ReserveSummary items={availableToday.items} reserved={availableToday.reserved} nextPayday={availableToday.nextPayday} /> : availableToday.reason}
              warning={availableToday.status === 'available' && availableToday.amount < 0}
            />
            {plan.unallocated > 0 && <PlanFigure label="Money left to assign" value={formatMoney(plan.unallocated)} detail="Give it a purpose by editing a Pot or asking Cora" />}
          </div>
        </article>

        <article className="card card-roomy">
          <div className="flex items-center justify-between">
            <div>
              <span className="eyebrow">Next 45 days</span>
              <h2 className="section-title">Coming up</h2>
            </div>
            <button onClick={() => onNavigate('calendar')} className="round-link focus-ring" aria-label="Open financial calendar"><ChevronRight size={20} /></button>
          </div>
          <div className="mt-5 divide-y divide-slate-100">
            {upcoming.map((event) => (
              <div className="flex items-center gap-3 py-4" key={event.id}>
                <div className={`event-icon ${event.type === 'income' ? 'event-icon-income' : 'event-icon-expense'}`}>
                  {event.type === 'income' ? <ArrowDownLeft size={17} /> : <ArrowUpRight size={17} />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-slate-900">{event.name}</p>
                  <p className="text-xs text-slate-500">{format(parseDate(event.date), 'EEE d MMM')}</p>
                </div>
                <span className={`text-sm font-bold ${event.type === 'income' ? 'text-emerald-700' : 'text-slate-900'}`}>
                  {event.type === 'income' ? '+' : '−'}{formatMoney(event.amount)}
                </span>
              </div>
            ))}
            {upcoming.length === 0 && <p className="py-8 text-center text-sm text-slate-500">No scheduled payments yet.</p>}
          </div>
          <button onClick={() => onNavigate('calendar')} className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-cora-200 px-4 py-3 text-sm font-semibold text-cora-800 hover:bg-cora-50 focus-ring"><CalendarClock size={17} /> View financial calendar</button>
        </article>
      </section>

      {state.goals.length > 0 && (
        <section className="goal-banner">
          <div className="goal-icon"><Target size={24} /></div>
          <div className="min-w-0 flex-1">
            <span className="text-xs font-bold uppercase tracking-widest text-cora-200">Goal in progress</span>
            <h2 className="mt-1 text-xl font-bold text-white">{state.goals[0].name}</h2>
            <p className="mt-1 text-sm text-cora-100">{formatMoney(state.goals[0].currentAmount)} saved of {formatMoney(state.goals[0].targetAmount)} · {tryParseDate(state.goals[0].targetDate) ? `target ${format(tryParseDate(state.goals[0].targetDate)!, 'd MMMM yyyy')}` : 'target date needs correcting'}</p>
          </div>
          <button onClick={() => onNavigate('cora')} className="button-on-dark button-secondary focus-ring">Manage with Cora <ChevronRight size={16} /></button>
        </section>
      )}

      {editing && <EditPotModal pot={editing} onClose={() => setEditing(null)} onSave={(value) => { onSetAllocation(editing.id, value); setEditing(null); }} />}
      {adding && <AddPotModal onClose={() => setAdding(false)} onSave={(name, value) => { onAddPot(name, value); setAdding(false); }} />}
    </div>
  );
}

function AllocationChart({ plan }: { plan: FinancialPlan }) {
  const data = [
    ...plan.pots.filter((pot) => pot.allocation > 0).map((pot) => ({ name: pot.name, value: pot.allocation, colour: pot.colour })),
    ...(plan.unallocated > 0 ? [{ name: 'Money left to assign', value: plan.unallocated, colour: '#94a3b8' }] : []),
  ];
  return (
    <div className="relative h-[290px]" role="img" aria-label={`Allocation chart. ${data.map((item) => `${item.name}: ${formatMoney(item.value)}`).join(', ')}`}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={data} dataKey="value" nameKey="name" innerRadius={86} outerRadius={124} paddingAngle={2} stroke="none" isAnimationActive>
            {data.map((item) => <Cell key={item.name} fill={item.colour} />)}
          </Pie>
          <Tooltip formatter={(value) => formatMoney(Number(value))} contentStyle={{ borderRadius: 14, border: '1px solid #e8dff0', boxShadow: '0 8px 30px rgba(48,13,68,.12)' }} />
        </PieChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
        <div><span className="block text-xs font-semibold uppercase tracking-wider text-slate-500">In your Pots</span><strong className="mt-1 block text-2xl text-cora-950">{formatMoney(plan.totalAllocated, { compact: true })}</strong><span className="text-xs text-slate-500">{plan.unallocated > 0 ? `${formatMoney(plan.unallocated, { compact: true })} left to assign` : 'this month'}</span></div>
      </div>
    </div>
  );
}

function PlanFigure({ label, value, detail, warning = false }: { label: string; value: string; detail?: ReactNode; warning?: boolean }) {
  return <div className={`rounded-2xl border p-4 ${warning ? 'border-red-200 bg-red-50' : 'border-cora-100 bg-cora-50'}`}><span className="block text-[11px] font-bold uppercase tracking-wider text-slate-500">{label}</span><strong className={`mt-1 block text-xl ${warning ? 'text-red-800' : 'text-cora-950'}`}>{value}</strong>{detail && <div className="mt-1 text-xs leading-5 text-slate-600">{detail}</div>}</div>;
}

/** Explains exactly what is held back from today's balance. */
function ReserveSummary({ items, reserved, nextPayday }: { items: PotReserveItem[]; reserved: number; nextPayday: string }) {
  const payday = format(parseDate(nextPayday), 'd MMM');
  if (!items.length) return <>Nothing is reserved for bills before your next payday on {payday}.</>;
  const describe = (item: PotReserveItem) => item.kind === 'bill' && item.date ? `${item.name} (${format(parseDate(item.date), 'd MMM')})` : `${item.name} Pot`;
  if (items.length === 1) return <>{formatMoney(reserved)} reserved for your upcoming {describe(items[0])}.</>;
  return (
    <details>
      <summary className="cursor-pointer rounded focus-ring">{formatMoney(reserved)} reserved for {items.length} upcoming payments and Pots before {payday}</summary>
      <ul className="mt-1 space-y-0.5">{items.map((item) => <li key={`${item.kind}-${item.name}-${item.date ?? ''}`} className="flex justify-between gap-3"><span>{describe(item)}</span><span className="font-semibold">{formatMoney(item.amount)}</span></li>)}</ul>
    </details>
  );
}

function SummaryCard({ icon: Icon, label, value, detail, tone }: { icon: typeof CirclePoundSterling; label: string; value: string; detail: ReactNode; tone: string }) {
  return (
    <article className="summary-card">
      <div className={`summary-icon summary-${tone}`}><Icon size={19} aria-hidden="true" /></div>
      <p className="mt-4 text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-bold tracking-tight text-cora-950">{value}</p>
      <div className="mt-1 text-xs leading-5 text-slate-500">{detail}</div>
    </article>
  );
}

function EditPotModal({ pot, onClose, onSave }: { pot: PlannedPot; onClose: () => void; onSave: (value: number) => void }) {
  const [value, setValue] = useState(pot.allocation);
  return (
    <Modal title={`Edit ${pot.name}`} description={pot.protected ? 'Protected commitments cannot be reduced below the known amount.' : 'Changes update the allocation chart immediately.'} onClose={onClose}>
      <MoneyInput id="pot-amount" label="Monthly allocation" value={value} onChange={setValue} />
      <div className="modal-actions"><button onClick={onClose} className="button-secondary focus-ring">Cancel</button><button onClick={() => onSave(value)} className="button-primary focus-ring">Save allocation</button></div>
    </Modal>
  );
}

function AddPotModal({ onClose, onSave }: { onClose: () => void; onSave: (name: string, value: number) => void }) {
  const [name, setName] = useState('');
  const [value, setValue] = useState(0);
  return (
    <Modal title="Add a custom Pot" description="Use this for something personal to your plan." onClose={onClose}>
      <label className="form-field"><span className="form-label">Pot name</span><input className="text-input focus-ring" value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. School uniform" /></label>
      <MoneyInput id="new-pot-amount" label="Monthly allocation" value={value} onChange={setValue} />
      <div className="modal-actions"><button onClick={onClose} className="button-secondary focus-ring">Cancel</button><button disabled={!name.trim() || value <= 0} onClick={() => onSave(name.trim(), value)} className="button-primary focus-ring disabled:opacity-50">Add Pot</button></div>
    </Modal>
  );
}

function partOfDay() {
  const hour = new Date().getHours();
  return hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening';
}
