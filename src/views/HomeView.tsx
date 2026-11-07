import { CalendarClock, ChevronRight, MessageCircleMore, ShieldCheck, Sparkles, WalletCards } from 'lucide-react';
import type { FinancialPlan, FinancialState } from '../types';
import type { NavSection } from '../components/Layout';
import { formatMoney } from '../lib/money';

export function HomeView({ state, plan, onNavigate, onLoadDemo }: { state: FinancialState; plan: FinancialPlan; onNavigate: (section: NavSection) => void; onLoadDemo: () => void }) {
  const hasData = state.incomes.length > 0 || state.expenses.length > 0 || state.goals.length > 0;
  return (
    <div className="space-y-6 animate-enter">
      <section className="welcome-panel">
        <div className="relative z-10 max-w-2xl">
          <span className="eyebrow eyebrow-light"><Sparkles size={14} /> A calmer way to plan payday</span>
          <h1 className="mt-5 text-4xl font-bold tracking-tight text-white sm:text-5xl">Plan around real life,<br />one payday at a time.</h1>
          <p className="mt-5 max-w-xl text-base leading-7 text-cora-100 sm:text-lg">Cora organises your income, commitments and goals into Smart Pots, then shows the cash-flow impact before you approve a change.</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <button onClick={() => onNavigate('cora')} className="button-primary button-on-dark focus-ring"><MessageCircleMore size={17} /> {hasData ? 'Ask Cora' : 'Build my plan'}</button>
            <button onClick={() => onNavigate('overview')} className="button-secondary button-on-dark-secondary focus-ring"><WalletCards size={17} /> View overview</button>
            {!hasData && <button onClick={onLoadDemo} className="button-secondary button-on-dark-secondary focus-ring"><Sparkles size={17} /> Try the £1,800 demo</button>}
          </div>
          <p className="mt-6 flex items-center gap-2 text-xs text-cora-200"><ShieldCheck size={15} /> Unofficial concept prototype — no bank connection or real transfers</p>
        </div>
        <div className="welcome-orb welcome-orb-one" aria-hidden="true" />
        <div className="welcome-orb welcome-orb-two" aria-hidden="true" />
      </section>

      <section className="grid gap-4 md:grid-cols-3" aria-label="Plan shortcuts">
        <HomeCard icon={MessageCircleMore} title="Talk it through" body="Tell Cora what changed. Review the exact proposal before saving." action="Open Cora" onClick={() => onNavigate('cora')} />
        <HomeCard icon={WalletCards} title="See the whole plan" body={hasData ? `${formatMoney(plan.totalAllocated)} allocated from ${formatMoney(plan.expectedIncome)} expected this month.` : 'Your income, Pots and savings will appear here once added.'} action="Open overview" onClick={() => onNavigate('overview')} />
        <HomeCard icon={CalendarClock} title="Check the timing" body="Follow one continuous balance across paydays, bills and month boundaries." action="Open calendar" onClick={() => onNavigate('calendar')} />
      </section>
    </div>
  );
}

function HomeCard({ icon: Icon, title, body, action, onClick }: { icon: typeof Sparkles; title: string; body: string; action: string; onClick: () => void }) {
  return <article className="card"><span className="summary-icon summary-purple"><Icon size={19} /></span><h2 className="mt-5 text-lg font-bold text-cora-950">{title}</h2><p className="mt-2 min-h-12 text-sm leading-6 text-slate-600">{body}</p><button onClick={onClick} className="mt-5 inline-flex items-center gap-1 text-sm font-bold text-cora-700 focus-ring">{action}<ChevronRight size={16} /></button></article>;
}
