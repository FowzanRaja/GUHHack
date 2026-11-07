import { useEffect, useRef, useState } from 'react';
import { format } from 'date-fns';
import {
  AlertCircle,
  Bot,
  Check,
  ChevronRight,
  Edit3,
  Loader2,
  MessageCircleMore,
  Plus,
  Send,
  Settings2,
  Sparkles,
  Trash2,
  UserRound,
  WandSparkles,
  X,
} from 'lucide-react';
import type {
  ActionPreview,
} from '../lib/actions';
import { previewAssistantAction } from '../lib/actions';
import type { ChatMessage, Expense, FinancialState, IncomeSource, SavingsGoal, Schedule } from '../types';
import { formatMoney } from '../lib/money';
import { describeScheduleDay } from '../lib/demo';
import { makeId } from '../lib/id';
import { isoDate } from '../lib/dates';
import { answerInformationRequest, boundedHistory } from '../lib/information';
import { MoneyInput } from '../components/MoneyInput';
import { Modal } from '../components/Modal';
import { SavingsGoalsSection } from './GoalsView';

interface CoraViewProps {
  state: FinancialState;
  onStateChange: (state: FinancialState, announcement?: string) => void;
  onSaveGoal: (goal: SavingsGoal) => void;
  onDeleteGoal: (id: string) => void;
}

export function CoraView({ state, onStateChange, onSaveGoal, onDeleteGoal }: CoraViewProps) {
  const messages = state.conversation.history;
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState<ActionPreview | null>(() => state.conversation.proposal ? previewAssistantAction(state, state.conversation.proposal) : null);
  const [entryEditor, setEntryEditor] = useState<{ type: 'income' | 'expense'; item?: IncomeSource | Expense } | null>(null);
  const [balanceDraft, setBalanceDraft] = useState<number | null>(state.currentBalance);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const composingRef = useRef(false);
  const balanceDirty = balanceDraft !== state.currentBalance;

  useEffect(() => setBalanceDraft(state.currentBalance), [state.currentBalance]);
  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(textarea.scrollHeight, 144)}px`;
    textarea.style.overflowY = textarea.scrollHeight > 144 ? 'auto' : 'hidden';
  }, [draft]);

  async function sendMessage(text = draft) {
    const clean = text.trim();
    if (!clean || loading) return;
    setDraft('');
    setError('');
    setPreview(null);
    const previousHistory = state.conversation.history;
    const userMessage: ChatMessage = { id: makeId('message'), role: 'user', text: clean, timestamp: new Date().toISOString() };
    onStateChange({ ...state, conversation: { ...state.conversation, history: boundedHistory([...previousHistory, userMessage]), proposal: undefined } });
    setLoading(true);
    window.setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 30);
    try {
      const { conversation: _conversation, ...financialState } = state;
      const response = await fetch('/api/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: clean, history: previousHistory, pending: state.conversation.pending, state: financialState }),
      });
      const responseText = await response.text();
      let data: { message?: string; action?: Parameters<typeof previewAssistantAction>[1] };
      try {
        if (!responseText) throw new Error('empty');
        data = JSON.parse(responseText) as { message?: string; action?: Parameters<typeof previewAssistantAction>[1] };
      } catch {
        throw new Error('Cora returned an invalid response. Please try again or use the manual controls.');
      }
      if (!response.ok || !data.action || !data.message) throw new Error(data.message || 'Cora could not respond just now.');
      const pending = data.action.type === 'clarification' ? data.action.pending : undefined;
      const proposalBaseState: FinancialState = {
        ...state,
        conversation: { history: boundedHistory([...previousHistory, userMessage]), pending },
      };
      const calculatedPreview = previewAssistantAction(proposalBaseState, data.action);
      const assistantText = data.action.type === 'information_request'
        ? answerInformationRequest(state, data.action)
        : data.action.type === 'clarification'
          ? data.action.question
          : data.action.type === 'explanation'
            ? data.action.answer
            : calculatedPreview.explanation;
      const assistantMessage: ChatMessage = { id: makeId('message'), role: 'assistant', text: assistantText, timestamp: new Date().toISOString() };
      const stateWithConversation: FinancialState = {
        ...state,
        conversation: { history: boundedHistory([...previousHistory, userMessage, assistantMessage]), pending },
      };
      const nextPreview = previewAssistantAction(stateWithConversation, data.action);
      if (nextPreview.canApply) stateWithConversation.conversation.proposal = data.action;
      onStateChange(stateWithConversation);
      setPreview(nextPreview.canApply ? nextPreview : null);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'Cora could not respond just now.';
      setError(message);
      const assistantMessage: ChatMessage = { id: makeId('message'), role: 'assistant', text: 'I couldn’t connect to the AI service. Nothing has changed. You can still use the manual controls beside this chat.', timestamp: new Date().toISOString() };
      onStateChange({
        ...state,
        conversation: { ...state.conversation, history: boundedHistory([...previousHistory, userMessage, assistantMessage]), proposal: undefined },
      });
    } finally {
      setLoading(false);
      window.setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 30);
    }
  }

  function showDemoAdjustment() {
    const salary = state.incomes[0];
    if (!salary) return;
    const userMessage: ChatMessage = { id: makeId('message'), role: 'user', text: 'I’m only getting paid £1,200 this month instead of £1,800.', timestamp: new Date().toISOString() };
    const assistantMessage: ChatMessage = { id: makeId('message'), role: 'assistant', text: 'I’ve prepared a one-off adjustment for your next salary. Your regular salary stays unchanged. Review the impact below before applying it.', timestamp: new Date().toISOString() };
    const action = {
      type: 'temporary_income_change' as const,
      summary: 'Reduce the next salary payment for this month only.',
      incomeSourceId: salary.id,
      amount: 120000,
    };
    const stateWithConversation: FinancialState = {
      ...state,
      conversation: { history: boundedHistory([...state.conversation.history, userMessage, assistantMessage]), proposal: action },
    };
    onStateChange(stateWithConversation);
    setPreview(previewAssistantAction(stateWithConversation, action));
  }

  function applyPreview() {
    if (!preview?.canApply) return;
    const done: ChatMessage = { id: makeId('message'), role: 'assistant', text: 'Done — I’ve updated your shared plan. The Overview, Pots and calendar now use the new figures.', timestamp: new Date().toISOString() };
    const nextState: FinancialState = {
      ...preview.nextState,
      conversation: { history: boundedHistory([...preview.nextState.conversation.history, done]), pending: undefined, proposal: undefined },
    };
    onStateChange(nextState, 'Cora’s proposed change was applied across Pots, goals and the calendar.');
    setPreview(null);
  }

  function dismissPreview() {
    setPreview(null);
    onStateChange({ ...state, conversation: { ...state.conversation, proposal: undefined } }, 'The proposed change was not applied.');
  }

  function saveEntry(item: IncomeSource | Expense) {
    if (entryEditor?.type === 'income') {
      const income = item as IncomeSource;
      onStateChange({ ...state, incomes: state.incomes.some((entry) => entry.id === income.id) ? state.incomes.map((entry) => entry.id === income.id ? income : entry) : [...state.incomes, income] }, 'Income details saved.');
    } else {
      const expense = item as Expense;
      onStateChange({ ...state, expenses: state.expenses.some((entry) => entry.id === expense.id) ? state.expenses.map((entry) => entry.id === expense.id ? expense : entry) : [...state.expenses, expense] }, 'Cost details saved.');
    }
    setEntryEditor(null);
  }

  return (
    <div className="space-y-6 animate-enter">
      <div>
        <span className="eyebrow"><MessageCircleMore size={14} /> Plan together</span>
        <h1 className="page-title">Chat with Cora</h1>
        <p className="page-subtitle">Explain what’s changing in your own words. You approve every financial update.</p>
      </div>

      <section className="grid min-h-[720px] gap-6 xl:grid-cols-[minmax(0,1.25fr)_minmax(360px,0.75fr)]">
        <article className="chat-shell">
          <div className="chat-header">
            <div className="cora-avatar"><Sparkles size={21} /></div>
            <div><h2 className="font-bold text-white">Cora</h2><p className="flex items-center gap-1.5 text-xs text-cora-200"><span className="h-2 w-2 rounded-full bg-emerald-400" /> Financial planning assistant</p></div>
            <span className="ml-auto rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-cora-100">Review first</span>
          </div>

          <div className="chat-messages" aria-live="polite">
            {messages.map((message) => <ChatBubble message={message} key={message.id} />)}
            {loading && <div className="flex items-end gap-2"><div className="chat-avatar-small"><Bot size={15} /></div><div className="chat-bubble chat-bubble-assistant flex items-center gap-2 text-slate-500"><Loader2 size={16} className="animate-spin" /> Cora is checking your plan…</div></div>}
            {preview && <ProposalCard preview={preview} onApply={applyPreview} onDismiss={dismissPreview} />}
            {error && <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900" role="alert"><AlertCircle size={16} className="mt-0.5 shrink-0" /><span>{error}</span></div>}
            <div ref={bottomRef} />
          </div>

          <div className="chat-composer-wrap">
            {state.isDemo && !state.incomeOverrides.length && <button onClick={showDemoAdjustment} className="mb-3 flex w-full items-center justify-between rounded-xl bg-gradient-to-r from-cora-100 to-fuchsia-50 px-4 py-3 text-left text-xs font-semibold text-cora-900 hover:from-cora-200 focus-ring"><span className="flex items-center gap-2"><WandSparkles size={16} /> Run the judge demo: £1,200 salary this month</span><ChevronRight size={16} /></button>}
            <form onSubmit={(event) => { event.preventDefault(); void sendMessage(); }} className="chat-composer">
              <label htmlFor="cora-message" className="sr-only">Message Cora</label>
              <textarea ref={textareaRef} id="cora-message" rows={2} value={draft} onChange={(event) => setDraft(event.target.value)} onCompositionStart={() => { composingRef.current = true; }} onCompositionEnd={() => { composingRef.current = false; }} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey && !composingRef.current && !event.nativeEvent.isComposing) { event.preventDefault(); void sendMessage(); } }} placeholder="Tell Cora what has changed…" className="focus-ring" />
              <button type="submit" disabled={!draft.trim() || loading} className="send-button focus-ring" aria-label="Send message"><Send size={18} /></button>
            </form>
            <p className="mt-2 text-center text-[10px] text-slate-400">Cora can make mistakes. Check the figures before confirming.</p>
          </div>
        </article>

        <aside className="card card-roomy self-start xl:sticky xl:top-28">
          <div className="flex items-start justify-between gap-3">
            <div><span className="eyebrow"><Settings2 size={13} /> Manual controls</span><h2 className="section-title">Your details</h2><p className="section-subtitle">Add or correct anything without AI.</p></div>
          </div>
          <div className="mt-5 rounded-2xl bg-cora-50 p-4">
            <MoneyInput id="current-balance" label="Available balance today" value={balanceDraft ?? 0} onChange={setBalanceDraft} hint="Draft only until you save. Used for cash-flow forecasts." />
            {balanceDraft === null
              ? <p className="mt-2 text-[11px] text-amber-800">Not provided — cash-flow shortfall warnings are paused.</p>
              : <button onClick={() => setBalanceDraft(null)} className="mt-2 text-[11px] font-semibold text-cora-700 underline">Mark balance as unknown</button>}
            <div className="mt-4 flex justify-end gap-2 border-t border-cora-100 pt-3">
              <button disabled={!balanceDirty} onClick={() => setBalanceDraft(state.currentBalance)} className="button-secondary button-small focus-ring disabled:cursor-not-allowed disabled:opacity-50">Cancel</button>
              <button disabled={!balanceDirty} onClick={() => onStateChange({ ...state, currentBalance: balanceDraft, balanceAsOf: balanceDraft === null ? null : isoDate(new Date()) }, balanceDraft === null ? 'Available balance marked as unknown.' : 'Available balance saved for today.')} className="button-primary button-small focus-ring disabled:cursor-not-allowed disabled:opacity-50">Save changes</button>
            </div>
          </div>

          <ManualSection title="Income" addLabel="Add income" onAdd={() => setEntryEditor({ type: 'income' })}>
            {state.incomes.map((income) => <ManualRow key={income.id} name={income.name} amount={income.amount} detail={scheduleLabel(income.schedule)} onEdit={() => setEntryEditor({ type: 'income', item: income })} onDelete={() => onStateChange({ ...state, incomes: state.incomes.filter((item) => item.id !== income.id) }, 'Income removed.')} />)}
            {!state.incomes.length && <EmptyRow text="No income added yet" />}
          </ManualSection>

          <ManualSection title="Regular costs" addLabel="Add cost" onAdd={() => setEntryEditor({ type: 'expense' })}>
            {state.expenses.slice(0, 6).map((expense) => <ManualRow key={expense.id} name={expense.name} amount={expense.amount} detail={`${scheduleLabel(expense.schedule)}${expense.essential ? ' · Essential' : ''}`} onEdit={() => setEntryEditor({ type: 'expense', item: expense })} onDelete={() => onStateChange({ ...state, expenses: state.expenses.filter((item) => item.id !== expense.id) }, 'Cost removed.')} />)}
            {!state.expenses.length && <EmptyRow text="No costs added yet" />}
            {state.expenses.length > 6 && <p className="pt-2 text-center text-xs text-slate-500">+{state.expenses.length - 6} more costs</p>}
          </ManualSection>

          <div className="mt-6 rounded-2xl border border-cora-100 bg-white p-4 text-xs leading-5 text-slate-600"><strong className="block text-cora-950">You stay in control</strong>Cora proposes changes. The calculation engine checks them, and nothing is saved until you confirm.</div>
        </aside>
      </section>

      <section className="card card-roomy" aria-label="Savings goals in Cora">
        <SavingsGoalsSection state={state} onSave={onSaveGoal} onDelete={onDeleteGoal} onAskCora={() => { textareaRef.current?.focus(); window.scrollTo({ top: 0, behavior: 'smooth' }); }} embedded />
      </section>

      {entryEditor && <EntryModal type={entryEditor.type} item={entryEditor.item} onClose={() => setEntryEditor(null)} onSave={saveEntry} />}
    </div>
  );
}

function ChatBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user';
  return (
    <div className={`flex items-end gap-2 ${isUser ? 'justify-end' : ''}`}>
      {!isUser && <div className="chat-avatar-small"><Bot size={15} /></div>}
      <div className={`chat-bubble ${isUser ? 'chat-bubble-user' : 'chat-bubble-assistant'}`}><p>{message.text}</p><time>{format(new Date(message.timestamp), 'HH:mm')}</time></div>
      {isUser && <div className="chat-avatar-user"><UserRound size={14} /></div>}
    </div>
  );
}

function ProposalCard({ preview, onApply, onDismiss }: { preview: ActionPreview; onApply: () => void; onDismiss: () => void }) {
  const figures = [
    ['Income', preview.beforePlan.expectedIncome, preview.afterPlan.expectedIncome],
    ['Savings', preview.beforePlan.savingsAllocated, preview.afterPlan.savingsAllocated],
    ['Flexible', preview.beforePlan.flexibleSpending, preview.afterPlan.flexibleSpending],
    ['Shortfall', preview.beforePlan.shortfall, preview.afterPlan.shortfall],
  ];
  return (
    <section className="proposal-card" aria-label="Proposed financial change">
      <div className="flex items-start justify-between gap-3"><div><span className="eyebrow"><WandSparkles size={13} /> Proposed change</span><h3 className="mt-2 text-lg font-bold text-cora-950">{preview.title}</h3></div><button onClick={onDismiss} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 focus-ring" aria-label="Dismiss proposal"><X size={17} /></button></div>
      <p className="mt-2 text-sm leading-6 text-slate-600">{preview.explanation}</p>
      <ul className="mt-3 space-y-1.5">{preview.changes.map((change) => <li className="flex gap-2 text-xs text-slate-700" key={change}><Check size={14} className="mt-0.5 shrink-0 text-emerald-600" />{change}</li>)}</ul>
      {preview.canApply && (
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {figures.map(([label, before, after]) => {
            const changed = preview.showBeforeAfter && before !== after;
            return <div className={`proposal-figure ${changed ? 'proposal-figure-changed' : ''}`} key={String(label)}><span>{label}</span><strong>{formatMoney(Number(after), { compact: true })}</strong>{changed && <small>was {formatMoney(Number(before), { compact: true })}</small>}</div>;
          })}
        </div>
      )}
      <div className="mt-4 flex flex-wrap justify-end gap-2"><button onClick={onDismiss} className="button-secondary button-small focus-ring">{preview.canApply ? 'Keep current plan' : 'Close'}</button>{preview.canApply && <button onClick={onApply} className="button-primary button-small focus-ring"><Check size={16} /> Apply to my plan</button>}</div>
      {preview.canApply && <p className="mt-3 text-center text-[10px] text-slate-400">No real money moves. This updates the prototype plan only.</p>}
    </section>
  );
}

function ManualSection({ title, addLabel, onAdd, children }: { title: string; addLabel: string; onAdd: () => void; children: React.ReactNode }) {
  return <section className="mt-6"><div className="mb-2 flex items-center justify-between"><h3 className="text-sm font-bold text-cora-950">{title}</h3><button onClick={onAdd} className="flex items-center gap-1 text-xs font-semibold text-cora-700 hover:text-cora-900 focus-ring"><Plus size={14} />{addLabel}</button></div><div className="divide-y divide-slate-100">{children}</div></section>;
}

function ManualRow({ name, amount, detail, onEdit, onDelete }: { name: string; amount: number; detail: string; onEdit: () => void; onDelete: () => void }) {
  return <div className="group flex items-center gap-2 py-3"><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-slate-900">{name}</p><p className="truncate text-xs text-slate-500">{detail}</p></div><strong className="text-sm text-cora-950">{formatMoney(amount, { compact: true })}</strong><button onClick={onEdit} className="manual-action focus-ring" aria-label={`Edit ${name}`}><Edit3 size={14} /></button><button onClick={onDelete} className="manual-action manual-delete focus-ring" aria-label={`Delete ${name}`}><Trash2 size={14} /></button></div>;
}

function EmptyRow({ text }: { text: string }) { return <p className="rounded-xl border border-dashed border-slate-200 py-4 text-center text-xs text-slate-500">{text}</p>; }

function scheduleLabel(schedule: Schedule): string {
  if (schedule.kind === 'once') return format(new Date(`${schedule.date}T12:00:00`), 'd MMM yyyy');
  if (schedule.kind === 'monthly') return describeScheduleDay(schedule.day);
  if (schedule.kind === 'monthly_allowance') return 'Monthly allowance · no fixed date';
  if (schedule.kind === 'weekly') return 'Weekly';
  if (schedule.kind === 'fortnightly') return 'Every 2 weeks';
  return `Every ${schedule.everyDays} days`;
}

function EntryModal({ type, item, onClose, onSave }: { type: 'income' | 'expense'; item?: IncomeSource | Expense; onClose: () => void; onSave: (item: IncomeSource | Expense) => void }) {
  const isExpense = type === 'expense';
  const existing = item as Expense | undefined;
  const [name, setName] = useState(item?.name ?? '');
  const [amount, setAmount] = useState(item?.amount ?? 0);
  const [schedule, setSchedule] = useState<Schedule>(item?.schedule ?? { kind: 'monthly', day: 1 });
  const [category, setCategory] = useState<Expense['category']>(existing?.category ?? 'bills');
  const [essential, setEssential] = useState(existing?.essential ?? false);
  function changeKind(kind: Schedule['kind']) {
    const today = isoDate(new Date());
    if (kind === 'monthly') setSchedule({ kind, day: 1 });
    if (kind === 'monthly_allowance') setSchedule({ kind });
    if (kind === 'once') setSchedule({ kind, date: today });
    if (kind === 'weekly' || kind === 'fortnightly') setSchedule({ kind, anchorDate: today });
    if (kind === 'interval') setSchedule({ kind, anchorDate: today, everyDays: 10 });
  }
  function submit() {
    if (isExpense) onSave({ id: item?.id ?? makeId('expense'), name: name.trim(), amount, schedule, category, essential });
    else onSave({ id: item?.id ?? makeId('income'), name: name.trim(), amount, schedule });
  }
  return (
    <Modal title={`${item ? 'Edit' : 'Add'} ${isExpense ? 'a cost' : 'income'}`} description="Schedules feed the same calendar and forecast as Cora." onClose={onClose}>
      <div className="space-y-4">
        <label className="form-field"><span className="form-label">Name</span><input autoFocus className="text-input focus-ring" value={name} onChange={(event) => setName(event.target.value)} placeholder={isExpense ? 'e.g. Rent' : 'e.g. Salary'} /></label>
        <MoneyInput id="entry-amount" label={isExpense ? 'Payment amount' : 'Amount received'} value={amount} onChange={setAmount} />
        <label className="form-field"><span className="form-label">Schedule</span><select className="text-input focus-ring" value={schedule.kind} onChange={(event) => changeKind(event.target.value as Schedule['kind'])}><option value="monthly">Monthly on a date</option>{isExpense && <option value="monthly_allowance">Monthly allowance · no fixed date</option>}<option value="weekly">Weekly</option><option value="fortnightly">Fortnightly</option><option value="once">One-off date</option><option value="interval">Every N days</option></select></label>
        <ScheduleInput schedule={schedule} onChange={setSchedule} />
        {isExpense && <div className="grid gap-4 sm:grid-cols-2"><label className="form-field"><span className="form-label">Category</span><select className="text-input focus-ring" value={category} onChange={(event) => setCategory(event.target.value as Expense['category'])}><option value="bills">Bills</option><option value="food">Food & essentials</option><option value="transport">Transport</option><option value="subscriptions">Subscriptions</option><option value="personal">Personal</option><option value="other">Other</option></select></label><label className="mt-7 flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-semibold text-slate-700"><input type="checkbox" checked={essential} onChange={(event) => setEssential(event.target.checked)} className="rounded border-slate-300 text-cora-700 focus:ring-cora-500" /> Essential commitment</label></div>}
      </div>
      <div className="modal-actions"><button onClick={onClose} className="button-secondary focus-ring">Cancel</button><button disabled={!name.trim() || amount <= 0} onClick={submit} className="button-primary focus-ring disabled:opacity-50">Save details</button></div>
    </Modal>
  );
}

function ScheduleInput({ schedule, onChange }: { schedule: Schedule; onChange: (schedule: Schedule) => void }) {
  if (schedule.kind === 'monthly') return <label className="form-field"><span className="form-label">Day of month</span><input type="number" min="1" max="31" className="text-input focus-ring" value={schedule.day} onChange={(event) => onChange({ ...schedule, day: Math.min(31, Math.max(1, Number(event.target.value))) })} /><span className="form-hint">The 31st automatically becomes the last day of shorter months.</span></label>;
  if (schedule.kind === 'monthly_allowance') return <p className="rounded-xl bg-blue-50 px-3 py-2.5 text-xs leading-5 text-blue-900">This amount is included in the monthly Pots without inventing a payment date or reducing the forecast balance on one arbitrary day.</p>;
  if (schedule.kind === 'once') return <label className="form-field"><span className="form-label">Date</span><input type="date" className="text-input focus-ring" value={schedule.date} onChange={(event) => onChange({ ...schedule, date: event.target.value })} /></label>;
  return <div className="grid gap-4 sm:grid-cols-2"><label className="form-field"><span className="form-label">First known date</span><input type="date" className="text-input focus-ring" value={schedule.anchorDate} onChange={(event) => onChange({ ...schedule, anchorDate: event.target.value })} /></label>{schedule.kind === 'interval' && <label className="form-field"><span className="form-label">Repeat every</span><span className="flex items-center gap-2"><input type="number" min="1" max="365" className="text-input focus-ring" value={schedule.everyDays} onChange={(event) => onChange({ ...schedule, everyDays: Math.max(1, Number(event.target.value)) })} /><span className="text-sm text-slate-500">days</span></span></label>}</div>;
}
