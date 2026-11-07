import { useMemo, useState } from 'react';
import { differenceInCalendarDays, format } from 'date-fns';
import { Calendar, CheckCircle2, Edit3, Flag, Plus, Sparkles, Target, Trash2, TrendingUp } from 'lucide-react';
import type { FinancialState, SavingsGoal } from '../types';
import { calculatePlan, goalPaydayBreakdown } from '../lib/engine';
import { formatMoney } from '../lib/money';
import { isoDate, parseDate, tryParseDate } from '../lib/dates';
import { Modal } from '../components/Modal';
import { MoneyInput } from '../components/MoneyInput';
import { makeId } from '../lib/id';

interface GoalsViewProps {
  state: FinancialState;
  onSave: (goal: SavingsGoal) => void;
  onDelete: (id: string) => void;
  onAskCora: () => void;
  embedded?: boolean;
}

export function SavingsGoalsSection({ state, onSave, onDelete, onAskCora, embedded = false }: GoalsViewProps) {
  const [editing, setEditing] = useState<SavingsGoal | 'new' | null>(null);
  const plan = useMemo(() => calculatePlan(state), [state]);
  const totalTarget = state.goals.reduce((sum, goal) => sum + goal.targetAmount, 0);
  const totalSaved = state.goals.reduce((sum, goal) => sum + goal.currentAmount, 0);

  return (
    <div className={`space-y-6 ${embedded ? '' : 'animate-enter'}`}>
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <span className="eyebrow"><Target size={14} /> What matters to you</span>
          {embedded ? <h2 className="section-title">Savings goals</h2> : <h1 className="page-title">Savings goals</h1>}
          <p className="page-subtitle">Cora works out contributions from your real upcoming paydays.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={onAskCora} className="button-secondary focus-ring"><Sparkles size={17} /> Tell Cora a goal</button>
          <button onClick={() => setEditing('new')} className="button-primary focus-ring"><Plus size={17} /> New goal</button>
        </div>
      </div>

      {state.goals.length > 0 && (
        <section className="grid gap-4 sm:grid-cols-3" aria-label="Savings summary">
          <article className="goal-summary-card goal-summary-feature"><span className="goal-summary-icon"><Flag /></span><p>Total goal value</p><strong>{formatMoney(totalTarget, { compact: true })}</strong></article>
          <article className="goal-summary-card"><span className="goal-summary-icon goal-summary-green"><TrendingUp /></span><p>Already saved</p><strong>{formatMoney(totalSaved, { compact: true })}</strong></article>
          <article className="goal-summary-card"><span className="goal-summary-icon goal-summary-pink"><Calendar /></span><p>Planned this month</p><strong>{formatMoney(plan.pots.filter((pot) => pot.goalId).reduce((sum, pot) => sum + pot.allocation, 0), { compact: true })}</strong></article>
        </section>
      )}

      {state.goals.length === 0 ? (
        <section className="empty-state card">
          <div className="empty-state-icon"><Target size={30} /></div>
          <h2 className="mt-5 text-2xl font-bold text-cora-950">What would you like to work towards?</h2>
          <p className="mt-2 max-w-lg text-sm leading-6 text-slate-600">Add an amount and a date. Cora will count the actual income payments before your deadline — not just divide by a number of months.</p>
          <div className="mt-6 flex flex-wrap justify-center gap-3"><button onClick={() => setEditing('new')} className="button-primary focus-ring"><Plus size={17} /> Create manually</button><button onClick={onAskCora} className="button-secondary focus-ring"><Sparkles size={17} /> Tell Cora instead</button></div>
        </section>
      ) : (
        <section className="grid gap-5 lg:grid-cols-2">
          {state.goals.map((goal) => <GoalCard key={goal.id} goal={goal} state={state} onEdit={() => setEditing(goal)} onDelete={() => onDelete(goal.id)} />)}
          <button onClick={() => setEditing('new')} className="add-goal-card focus-ring"><Plus size={24} /><span>Add another goal</span><small>Cora will rebalance savings around your priorities.</small></button>
        </section>
      )}

      {editing && <GoalModal goal={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} onSave={(goal) => { onSave(goal); setEditing(null); }} />}
    </div>
  );
}

function GoalCard({ goal, state, onEdit, onDelete }: { goal: SavingsGoal; state: FinancialState; onEdit: () => void; onDelete: () => void }) {
  const breakdown = goalPaydayBreakdown(state, goal);
  const percent = goal.targetAmount ? Math.min(100, Math.round((goal.currentAmount / goal.targetAmount) * 100)) : 0;
  const targetDate = tryParseDate(goal.targetDate);
  const days = targetDate ? differenceInCalendarDays(targetDate, new Date()) : -1;
  const underfunded = !targetDate || days < 0 || !breakdown.onTrack;
  return (
    <article className="goal-card">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3"><div className="goal-progress-ring" style={{ '--progress': `${percent * 3.6}deg`, '--goal-colour': goal.colour } as React.CSSProperties}><span>{percent}%</span></div><div><span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Savings goal</span><h2 className="text-xl font-bold text-cora-950">{goal.name}</h2></div></div>
        <div className="flex gap-1"><button onClick={onEdit} className="goal-action focus-ring" aria-label={`Edit ${goal.name}`}><Edit3 size={17} /></button><button onClick={onDelete} className="goal-action goal-action-delete focus-ring" aria-label={`Delete ${goal.name}`}><Trash2 size={17} /></button></div>
      </div>
      <div className="mt-6">
        <div className="grid grid-cols-3 gap-3"><GoalValue label="Target" value={goal.targetAmount} /><GoalValue label="Already saved" value={goal.currentAmount} /><GoalValue label="Still needed" value={breakdown.remaining} /></div>
        <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full transition-all duration-500" style={{ width: `${percent}%`, backgroundColor: goal.colour }} /></div>
      </div>
      <div className="mt-5 rounded-2xl border border-cora-100 bg-cora-50/60 p-4">
        <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-cora-700">Next payday plan</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <GoalDetail label="Next payday" value={breakdown.nextPayday ? format(parseDate(breakdown.nextPayday), 'd MMM yyyy') : 'Not scheduled'} detail={`${breakdown.eligiblePaydays} eligible before deadline`} />
          <GoalDetail label="Expected income" value={formatMoney(breakdown.expectedIncome, { compact: true })} detail="For this payday" />
          <GoalDetail label="Suggested contribution" value={formatMoney(breakdown.recommendedContribution, { compact: true })} detail="Affordable after priorities" />
          <GoalDetail label="Remaining income" value={formatMoney(breakdown.remainingIncomeAfterPriorities, { compact: true })} detail="After bills, needs and goals" />
        </div>
      </div>
      <div className={`mt-4 flex items-start gap-2 rounded-xl px-3 py-2.5 text-xs leading-5 ${underfunded ? 'bg-amber-50 text-amber-900' : 'bg-emerald-50 text-emerald-900'}`}>
        <CheckCircle2 size={16} className="mt-0.5 shrink-0" />
        <span>{!targetDate || days < 0 ? 'This goal is preserved, but its deadline must be corrected before Cora can calculate a reliable contribution.' : underfunded ? 'The affordable contributions do not reach the target by this deadline. Reduce the target contribution or extend the deadline.' : 'Affordable planned contributions are on track to reach this deadline.'}</span>
      </div>
    </article>
  );
}

function GoalValue({ label, value }: { label: string; value: number }) {
  return <div><p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{label}</p><p className="mt-1 text-lg font-bold text-cora-950">{formatMoney(value, { compact: true })}</p></div>;
}

function GoalDetail({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <div className="goal-detail"><span>{label}</span><strong>{value}</strong><small>{detail}</small></div>;
}

function GoalModal({ goal, onClose, onSave }: { goal?: SavingsGoal; onClose: () => void; onSave: (goal: SavingsGoal) => void }) {
  const [name, setName] = useState(goal?.name ?? '');
  const [target, setTarget] = useState(goal?.targetAmount ?? 0);
  const [current, setCurrent] = useState(goal?.currentAmount ?? 0);
  const [date, setDate] = useState(goal && tryParseDate(goal.targetDate) ? goal.targetDate : '');
  return (
    <Modal title={goal ? `Edit ${goal.name}` : 'Create a savings goal'} description="Cora will use the income events before this date to calculate a contribution." onClose={onClose}>
      <div className="space-y-4">
        <label className="form-field"><span className="form-label">What are you saving for?</span><input autoFocus className="text-input focus-ring" value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Family holiday" /></label>
        <div className="grid gap-4 sm:grid-cols-2"><MoneyInput id="goal-target" label="Target amount" value={target} onChange={setTarget} /><MoneyInput id="goal-current" label="Already saved" value={current} onChange={setCurrent} /></div>
        <label className="form-field"><span className="form-label">Target date</span><input type="date" min={isoDate(new Date())} className="text-input focus-ring" value={date} onChange={(event) => setDate(event.target.value)} /></label>
      </div>
      <div className="modal-actions"><button onClick={onClose} className="button-secondary focus-ring">Cancel</button><button disabled={!name.trim() || !date || target <= 0} onClick={() => onSave({ id: goal?.id ?? makeId('goal'), name: name.trim(), targetAmount: target, currentAmount: Math.min(current, target), targetDate: date, colour: goal?.colour ?? '#d2387c' })} className="button-primary focus-ring disabled:opacity-50">{goal ? 'Save changes' : 'Create goal'}</button></div>
    </Modal>
  );
}
