import { useMemo, useState } from 'react';
import { Layout, type NavSection } from './components/Layout';
import { useFinancialState } from './hooks/useFinancialState';
import { useTheme } from './hooks/useTheme';
import { calculatePlan } from './lib/engine';
import { makeId } from './lib/id';
import type { SavingsGoal } from './types';
import { Overview } from './views/Overview';
import { CoraView } from './views/CoraView';
import { CalendarView } from './views/CalendarView';
import { HomeView } from './views/HomeView';

export default function App() {
  const { state, update, loadDemo, reset, announcement } = useFinancialState();
  const { darkMode, toggleDarkMode } = useTheme();
  const [active, setActive] = useState<NavSection>('home');
  const plan = useMemo(() => calculatePlan(state), [state]);
  const hasPlan = state.incomes.length > 0 || state.expenses.length > 0 || state.goals.length > 0;

  function saveGoal(goal: SavingsGoal) {
    update({ ...state, goals: state.goals.some((item) => item.id === goal.id) ? state.goals.map((item) => item.id === goal.id ? goal : item) : [...state.goals, goal] }, `${goal.name} goal saved.`);
  }

  function loadDemoWithConfirmation() {
    if (hasPlan && !window.confirm('Load the original demo? This will replace the current local plan and Cora conversation.')) return;
    loadDemo();
    setActive('home');
  }

  function resetDemoWithConfirmation() {
    if (!window.confirm('Reset the demo to its original income, expenses, goal, calendar and conversation? Your demo changes will be replaced.')) return;
    loadDemo();
    setActive('home');
  }

  function clearPlanWithConfirmation() {
    if (!window.confirm('Clear this local financial plan and conversation and start again? This cannot be undone.')) return;
    reset();
    setActive('home');
  }

  return (
    <Layout
      active={active}
      onNavigate={setActive}
      onDemo={loadDemoWithConfirmation}
      onResetDemo={resetDemoWithConfirmation}
      onClearPlan={clearPlanWithConfirmation}
      hasPlan={hasPlan}
      darkMode={darkMode}
      onToggleDarkMode={toggleDarkMode}
      isDemo={state.isDemo}
    >
      <div className="sr-only" aria-live="polite">{announcement}</div>
      {active === 'home' && <HomeView state={state} plan={plan} onNavigate={setActive} onLoadDemo={loadDemoWithConfirmation} />}
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
      {active === 'cora' && <CoraView state={state} onStateChange={update} onSaveGoal={saveGoal} onDeleteGoal={(id) => update({ ...state, goals: state.goals.filter((goal) => goal.id !== id) }, 'Savings goal removed.')} />}
      {active === 'calendar' && <CalendarView state={state} />}
    </Layout>
  );
}
