import type { ReactNode } from 'react';
import { CalendarDays, Home, LayoutDashboard, MessageCircleMore, RotateCcw, Sparkles, Trash2 } from 'lucide-react';

export type NavSection = 'home' | 'overview' | 'cora' | 'calendar';

const navItems = [
  { id: 'home' as const, label: 'Home', icon: Home },
  { id: 'overview' as const, label: 'Overview', icon: LayoutDashboard },
  { id: 'cora' as const, label: 'Cora', icon: MessageCircleMore },
  { id: 'calendar' as const, label: 'Calendar', icon: CalendarDays },
];

interface LayoutProps {
  active: NavSection;
  onNavigate: (section: NavSection) => void;
  onDemo: () => void;
  onResetDemo: () => void;
  onClearPlan: () => void;
  hasPlan: boolean;
  isDemo: boolean;
  children: ReactNode;
}

export function Layout({ active, onNavigate, onDemo, onResetDemo, onClearPlan, hasPlan, isDemo, children }: LayoutProps) {
  return (
    <div className="min-h-screen">
      <a href="#main-content" className="skip-link">Skip to main content</a>
      <header className="sticky top-0 z-40 border-b border-white/10 bg-cora-950 text-white shadow-lg shadow-cora-950/10">
        <div className="mx-auto flex h-[4.75rem] max-w-[1500px] items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <button className="group flex min-w-0 items-center gap-3 rounded-xl text-left focus-ring" onClick={() => onNavigate('home')} aria-label="Cora Smart Pots home">
            <span className="brand-logo flex h-10 w-[112px] shrink-0 items-center justify-center overflow-hidden rounded-lg bg-white">
              <img src="/natwest-logo.png" alt="NatWest" className="w-[108px] max-w-none object-contain" />
            </span>
            <span className="hidden border-l border-white/20 pl-3 sm:block">
              <span className="block text-sm font-bold tracking-tight leading-none">Cora Smart Pots</span>
            </span>
          </button>

          <div className="hidden items-center gap-1 rounded-2xl bg-white/8 p-1 md:flex" aria-label="Primary navigation">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  onClick={() => onNavigate(item.id)}
                  className={`nav-button focus-ring ${active === item.id ? 'nav-button-active' : ''}`}
                  aria-current={active === item.id ? 'page' : undefined}
                >
                  <Icon size={17} aria-hidden="true" />
                  {item.label}
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-2">
            {isDemo ? (
              <button onClick={onResetDemo} className="header-action focus-ring" aria-label="Reset demo"><RotateCcw size={16} aria-hidden="true" /> <span className="hidden sm:inline">Reset demo</span></button>
            ) : (
              <button onClick={onDemo} className="header-action focus-ring"><Sparkles size={16} aria-hidden="true" /> Try a demo</button>
            )}
            {hasPlan && <button onClick={onClearPlan} className="icon-button focus-ring" title="Clear plan and start again" aria-label="Clear plan and start again"><Trash2 size={17} aria-hidden="true" /></button>}
          </div>
        </div>
      </header>

      <main id="main-content" className="mx-auto max-w-[1500px] px-4 pb-28 pt-6 sm:px-6 md:pb-10 lg:px-8 lg:pt-8">
        {children}
      </main>

      <nav className="fixed inset-x-3 bottom-3 z-40 grid grid-cols-4 rounded-2xl border border-cora-100 bg-white/95 p-1.5 shadow-soft backdrop-blur md:hidden" aria-label="Primary navigation">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              className={`mobile-nav-button focus-ring ${active === item.id ? 'mobile-nav-active' : ''}`}
              aria-current={active === item.id ? 'page' : undefined}
            >
              <Icon size={20} aria-hidden="true" />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      <footer className="mx-auto hidden max-w-[1500px] items-center justify-center border-t border-slate-200 px-8 py-6 text-xs text-slate-500 md:flex">
        <p>Hackathon demo · Simulated finances</p>
      </footer>
    </div>
  );
}
