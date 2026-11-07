import { useMemo, useState } from 'react';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowUpRight,
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  CirclePoundSterling,
  Edit3,
  Plus,
  ShieldCheck,
  Sparkles,
  Target,
  WalletCards,
} from 'lucide-react';
import type { FinancialPlan, FinancialState, PlannedPot } from '../types';
import { forecastNextDays } from '../lib/engine';
import { formatMoney } from '../lib/money';
import { parseDate, tryParseDate } from '../lib/dates';
import { format } from 'date-fns';
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

  if (!hasData) {
    return (
      <div className="animate-enter">
        <section className="welcome-panel">
          <div className="relative z-10 max-w-2xl">
            <span className="eyebrow eyebrow-light"><Sparkles size={14} /> A calmer way to plan payday</span>
            <h1 className="mt-5 text-4xl font-bold tracking-tight text-white sm:text-5xl">Tell Cora what matters.<br />Make every payday count.</h1>
            <p className="mt-5 max-w-xl text-base leading-7 text-cora-100 sm:text-lg">Cora turns your real income, bills and goals into simple Pots — then adapts the plan when life changes.</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <button onClick={() => onNavigate('cora')} className="button-primary button-on-dark focus-ring">Build my plan</button>
              <button onClick={onLoadDemo} className="button-secondary button-on-dark-secondary focus-ring"><Sparkles size={17} /> Try the £1,800 demo</button>
            </div>
            <p className="mt-6 flex items-center gap-2 text-xs text-cora-200"><ShieldCheck size={15} /> Prototype only — no bank login or real transfers</p>
          </div>
          <div className="welcome-orb welcome-orb-one" aria-hidden="true" />
          <div className="welcome-orb welcome-orb-two" aria-hidden="true" />
        </section>

        <section className="mt-6 grid gap-4 md:grid-cols-3" aria-label="How Cora works">
          {[
            ['01', 'Share the basics', 'Type naturally or use simple manual fields. You stay in control.'],
            ['02', 'See your Pots', 'Essentials are covered first, using your actual figures.'],
            ['03', 'Adapt with confidence', 'Preview the impact of a change before anything is saved.'],
          ].map(([number, title, body]) => (
            <article className="card group" key={number}>
              <span className="text-sm font-bold text-rosebank">{number}</span>
              <h2 className="mt-5 text-lg font-bold text-cora-950">{title}</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">{body}</p>
            </article>
          ))}
        </section>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-enter">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <span className="eyebrow"><span className="status-dot" /> {state.isDemo ? 'Live demo plan' : 'Your monthly plan'}</span>
          <h1 className="page-title">Good {partOfDay()}, {state.customerName || 'there'}.</h1>
          <p className="page-subtitle">Here’s how your money is organised for {format(new Date(`${plan.month}-01T12:00:00`), 'MMMM')}.</p>
        </div>
        <button onClick={() => onNavigate('cora')} className="button-primary focus-ring"><Sparkles size={17} /> Ask Cora to adjust it</button>
      </div>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Financial summary">
        <SummaryCard icon={CirclePoundSterling} label="Expected income" value={formatMoney(plan.expectedIncome, { compact: true })} detail="This calendar month" tone="purple" />
        <SummaryCard icon={ShieldCheck} label="Essential commitments" value={formatMoney(plan.essentialCommitments, { compact: true })} detail={`${plan.expectedIncome ? Math.round((plan.essentialCommitments / plan.expectedIncome) * 100) : 0}% of income`} tone="blue" />
        <SummaryCard icon={Target} label="Saving this month" value={formatMoney(plan.savingsAllocated, { compact: true })} detail={`${state.goals.length} active goal${state.goals.length === 1 ? '' : 's'}`} tone="green" />
        <SummaryCard icon={WalletCards} label="Flexible spending" value={formatMoney(plan.flexibleSpending, { compact: true })} detail="After known priorities" tone="pink" />
      </section>

      {plan.shortfall > 0 ? (
        <div className="notice notice-danger" role="alert"><AlertTriangle aria-hidden="true" /><div><strong>There’s a {formatMoney(plan.shortfall)} shortfall.</strong><p>Your known essentials and everyday needs cost more than this month’s available income. Cora has not hidden or reduced them.</p></div><button onClick={() => onNavigate('cora')}>Review options</button></div>
      ) : (
        <div className="notice notice-positive" role="status"><CheckCircle2 aria-hidden="true" /><div><strong>Your known commitments are covered.</strong><p>Every pound in this plan has a purpose, and you can change any flexible Pot.</p></div></div>
      )}

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
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{pot.priority}</span>
                  </span>
                  <Edit3 size={15} className="text-slate-400" aria-hidden="true" />
                </button>
              ))}
            </div>
          </div>
          <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-cora-50 px-4 py-3 text-sm">
            <span className="text-slate-600">Total planned</span>
            <span className="font-bold text-cora-950">{formatMoney(plan.totalAllocated)} of {formatMoney(plan.expectedIncome)}</span>
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
          <button onClick={() => onNavigate('goals')} className="button-on-dark button-secondary focus-ring">See progress <ChevronRight size={16} /></button>
        </section>
      )}

      {editing && <EditPotModal pot={editing} onClose={() => setEditing(null)} onSave={(value) => { onSetAllocation(editing.id, value); setEditing(null); }} />}
      {adding && <AddPotModal onClose={() => setAdding(false)} onSave={(name, value) => { onAddPot(name, value); setAdding(false); }} />}
    </div>
  );
}

function AllocationChart({ plan }: { plan: FinancialPlan }) {
  const data = plan.pots.filter((pot) => pot.allocation > 0).map((pot) => ({ name: pot.name, value: pot.allocation, colour: pot.colour }));
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
        <div><span className="block text-xs font-semibold uppercase tracking-wider text-slate-500">Planned</span><strong className="mt-1 block text-2xl text-cora-950">{formatMoney(plan.totalAllocated, { compact: true })}</strong><span className="text-xs text-slate-500">this month</span></div>
      </div>
    </div>
  );
}

function SummaryCard({ icon: Icon, label, value, detail, tone }: { icon: typeof CirclePoundSterling; label: string; value: string; detail: string; tone: string }) {
  return (
    <article className="summary-card">
      <div className={`summary-icon summary-${tone}`}><Icon size={19} aria-hidden="true" /></div>
      <p className="mt-4 text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-bold tracking-tight text-cora-950">{value}</p>
      <p className="mt-1 text-xs text-slate-500">{detail}</p>
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
