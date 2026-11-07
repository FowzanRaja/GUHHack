import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';

// Light mode only. Clear any theme left over from the earlier dark-mode experiment
// (financial data lives under a separate key and is untouched).
document.documentElement.classList.remove('dark');
document.documentElement.style.colorScheme = 'light';
try {
  for (const key of ['theme', 'cora-theme', 'cora-smart-pots:theme', 'color-theme']) localStorage.removeItem(key);
} catch {
  // Storage can be unavailable in private windows; the light theme still applies.
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
