import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import i18n, { DIR, readStoredLang, type Lang } from './index';

const TITLE_KEY = 'Smart Academic Advisor | Badr University in Assiut';

interface LanguageContextValue {
  lang: Lang;
  dir: 'ltr' | 'rtl';
  setLang: (lang: Lang) => void;
  /** Swaps between English and Arabic. */
  toggleLang: () => void;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>(readStoredLang);

  // Keep i18next, <html lang/dir>, the document title and storage in sync.
  useEffect(() => {
    void i18n.changeLanguage(lang);
    const root = document.documentElement;
    root.setAttribute('lang', lang);
    root.setAttribute('dir', DIR[lang]);
    document.title = i18n.t(TITLE_KEY);
    try {
      localStorage.setItem('locale', lang);
    } catch {
      /* storage unavailable — the session simply forgets the choice */
    }
  }, [lang]);

  const setLang = useCallback((next: Lang) => setLangState(next), []);
  const toggleLang = useCallback(() => setLangState((value) => (value === 'en' ? 'ar' : 'en')), []);

  const value = useMemo(
    () => ({ lang, dir: DIR[lang], setLang, toggleLang }),
    [lang, setLang, toggleLang],
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage(): LanguageContextValue {
  const context = useContext(LanguageContext);
  if (!context) throw new Error('useLanguage must be used inside <LanguageProvider>');
  return context;
}
