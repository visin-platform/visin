import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { CODE_LANGUAGE_KEY, CodeLanguageContext } from '../codeLanguage';

const stored = () => {
  try {
    return window.localStorage.getItem(CODE_LANGUAGE_KEY);
  } catch {
    // Storage blocked (private mode, site data off): no remembered choice.
    return null;
  }
};

export default function CodeLanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<string | null>(stored);

  const setLanguage = useCallback((next: string) => {
    setLanguageState(next);
    try {
      window.localStorage.setItem(CODE_LANGUAGE_KEY, next);
    } catch {
      // Not remembered; the choice still holds for this visit.
    }
  }, []);

  const value = useMemo(() => ({ language, setLanguage }), [language, setLanguage]);
  return <CodeLanguageContext.Provider value={value}>{children}</CodeLanguageContext.Provider>;
}
