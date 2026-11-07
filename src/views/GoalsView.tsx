import { useMemo, useState } from 'react';
import { differenceInCalendarDays, format } from 'date-fns';
import { Calendar, CheckCircle2, Edit3, Flag, Plus, Sparkles, Target, Trash2, TrendingUp } from 'lucide-react';
import type { FinancialState, SavingsGoal } from '../types';
import { calculatePlan, projectGoal } from '../lib/engine';
import { formatMoney } from '../lib/money';
import { isoDate, tryParseDate } from '../lib/dates';
import { Modal } from '../components/Modal';
import { MoneyInput } from '../components/MoneyInput';
import { makeId } from '../lib/id';

interface GoalsViewProps {
  state: FinancialState;
  onSave: (goal: SavingsGoal) => void;
  onDelete: (id: string) => void;
  onAskCora: () => void;
}

export function GoalsView({ state, onSave, onDelete, onAskCora }: GoalsViewProps) {
  const [editing, setEditing] = useState<SavingsGoal | 'new' | null>(null);
  const plan = useMemo(() => calculatePlan(state), [state]);
  const totalTarget = state.goals.reduce((sum, goal) => sum + goal.targetAmount, 0);
  const totalSaved = state.goals.reduce((sum, goal) => sum + goal.currentAmount, 0);

  return (
    <div className="space-y-6 animate-enter">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <span className="eyebrow"><Target size={14} /> What matters to you</span>
          <h1 className="page-title">Savings goals</h1>
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
  const projection = projectGoal(state, goal);
  const percent = goal.targetAmount ? Math.min(100, Math.round((goal.currentAmount / goal.targetAmount) * 100)) : 0;
  const targetDate = tryParseDate(goal.targetDate);
  const days = targetDate ? differenceInCalendarDays(targetDate, new Date()) : -1;
  const plan = calculatePlan(state);
  const goalPot = plan.pots.find((pot) => pot.goalId === goal.id);
  const underfunded = !projection.validDeadline || days < 0 || (goalPot ? goalPot.allocation < goalPot.requested : projection.remaining > 0);
  return (
    <article className="goal-card">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3"><div className="goal-progress-ring" style={{ '--progress': `${percent * 3.6}deg`, '--goal-colour': goal.colour } as React.CSSProperties}><span>{percent}%</span></div><div><span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Savings goal</span><h2 className="text-xl font-bold text-cora-950">{goal.name}</h2></div></div>
        <div className="flex gap-1"><button onClick={onEdit} className="goal-action focus-ring" aria-label={`Edit ${goal.name}`}><Edit3 size={17} /></button><button onClick={onDelete} className="goal-action goal-action-delete focus-ring" aria-label={`Delete ${goal.name}`}><Trash2 size={17} /></button></div>
      </div>
      <div className="mt-6">
        <div className="flex items-end justify-between gap-3"><div><p className="text-xs text-slate-500">Saved so far</p><p className="text-2xl font-bold text-cora-950">{formatMoney(goal.currentAmount, { compact: true })}</p></div><p className="text-sm text-slate-500">of <strong className="text-slate-800">{formatMoney(goal.targetAmount, { compact: true })}</strong></p></div>
        <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full transition-all duration-500" style={{ width: `${percent}%`, backgroundColor: goal.colour }} /></div>
      </div>
      <div className="mt-5 grid grid-cols-2 gap-3">
        <div className="goal-detail"><span>Each payday</span><strong>{projection.eligibleIncomeCount ? formatMoney(projection.contributionPerIncome, { compact: true }) : 'Set income'}</strong><small>{projection.eligibleIncomeCount} payment{projection.eligibleIncomeCount === 1 ? '' : 's'} left</small></div>
        <div className="goal-detail"><span>Target date</span><strong>{targetDate ? format(targetDate, 'd MMM yyyy') : 'Invalid date'}</strong><small>{!targetDate ? 'Edit this goal to correct it' : days >= 0 ? `${days} days away` : 'Date has passed — edit this goal'}</small></div>
      </div>
      <div className={`mt-4 flex items-start gap-2 rounded-xl px-3 py-2.5 text-xs leading-5 ${underfunded ? 'bg-amber-50 text-amber-900' : 'bg-emerald-50 text-emerald-900'}`}>
        <CheckCircle2 size={16} className="mt-0.5 shrink-0" />
        <span>{!targetDate || days < 0 ? 'This goal is preserved, but its deadline must be corrected before Cora can calculate a reliable contribution.' : underfunded ? 'The full suggested contribution may not fit after current commitments. Review it with Cora.' : 'This month’s suggested contribution fits after known commitments.'}</span>
      </div>
    </article>
  );
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
