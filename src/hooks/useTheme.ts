import { useEffect, useState } from 'react';

const THEME_KEY = 'cora-smart-pots:theme';

function initialTheme(): boolean {
  const stored = localStorage.getItem(THEME_KEY);
  if (stored === 'dark') return true;
  if (stored === 'light') return false;
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
}

export function useTheme() {
  const [darkMode, setDarkMode] = useState(initialTheme);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode);
    document.documentElement.style.colorScheme = darkMode ? 'dark' : 'light';
    localStorage.setItem(THEME_KEY, darkMode ? 'dark' : 'light');
  }, [darkMode]);

  return { darkMode, toggleDarkMode: () => setDarkMode((current) => !current) };
}
