import { useMemo, useState } from 'react';
import { Layout, type NavSection } from './components/Layout';
import { useFinancialState } from './hooks/useFinancialState';
import { calculatePlan } from './lib/engine';
import { makeId } from './lib/id';
import type { SavingsGoal } from './types';
import { Overview } from './views/Overview';
import { CoraView } from './views/CoraView';
import { CalendarView } from './views/CalendarView';
import { GoalsView } from './views/GoalsView';

export default function App() {
  const { state, update, loadDemo, reset, announcement } = useFinancialState();
  const [active, setActive] = useState<NavSection>('overview');
  const plan = useMemo(() => calculatePlan(state), [state]);
  const hasPlan = state.incomes.length > 0 || state.expenses.length > 0 || state.goals.length > 0;

  function saveGoal(goal: SavingsGoal) {
    update({ ...state, goals: state.goals.some((item) => item.id === goal.id) ? state.goals.map((item) => item.id === goal.id ? goal : item) : [...state.goals, goal] }, `${goal.name} goal saved.`);
  }

  function loadDemoWithConfirmation() {
    if (hasPlan && !window.confirm('Load the original demo? This will replace the current local plan and Cora conversation.')) return;
    loadDemo();
    setActive('overview');
  }

  function resetDemoWithConfirmation() {
    if (!window.confirm('Reset the demo to its original income, expenses, goal, calendar and conversation? Your demo changes will be replaced.')) return;
    loadDemo();
    setActive('overview');
  }

  function clearPlanWithConfirmation() {
    if (!window.confirm('Clear this local financial plan and conversation and start again? This cannot be undone.')) return;
    reset();
    setActive('overview');
  }

  return (
    <Layout
      active={active}
      onNavigate={setActive}
      onDemo={loadDemoWithConfirmation}
      onResetDemo={resetDemoWithConfirmation}
      onClearPlan={clearPlanWithConfirmation}
      hasPlan={hasPlan}
      simplified={state.simplifiedMode}
      onToggleSimplified={() => update({ ...state, simplifiedMode: !state.simplifiedMode }, `High contrast mode ${state.simplifiedMode ? 'off' : 'on'}.`)}
      isDemo={state.isDemo}
    >
      <div className="sr-only" aria-live="polite">{announcement}</div>
      {active === 'overview' && (
        <Overview
          state={state}
          plan={plan}
          onNavigate={setActive}
          onLoadDemo={loadDemoWithConfirmation}
          onSetAllocation={(id, value) => update({ ...state, allocationOverrides: { ...state.allocationOverrides, [id]: value } }, 'Pot allocation updated.')}
          onAddPot={(name, allocation) => update({ ...state, manualPots: [...state.manualPots, { id: makeId('pot'), name, allocation, priority: 'flexible', colour: '#0f766e' }] }, `${name} Pot added.`)}
        />
      )}
      {active === 'cora' && <CoraView state={state} onStateChange={update} />}
      {active === 'calendar' && <CalendarView state={state} />}
      {active === 'goals' && (
        <GoalsView
          state={state}
          onSave={saveGoal}
          onDelete={(id) => update({ ...state, goals: state.goals.filter((goal) => goal.id !== id) }, 'Savings goal removed.')}
          onAskCora={() => setActive('cora')}
        />
      )}
    </Layout>
  );
}
