import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

// Per-area locale files: each area owns its own JSON pair so parallel work
// never conflicts on one giant translation file.
import enCommon from './locales/en/common.json';
import enNav from './locales/en/nav.json';
import enLayout from './locales/en/layout.json';
import enAuth from './locales/en/auth.json';
import enSettings from './locales/en/settings.json';
import enErrors from './locales/en/errors.json';
import enStudent from './locales/en/student.json';
import enAdvisor from './locales/en/advisor.json';
import enAdmin from './locales/en/admin.json';
import enChat from './locales/en/chat.json';

import arCommon from './locales/ar/common.json';
import arNav from './locales/ar/nav.json';
import arLayout from './locales/ar/layout.json';
import arAuth from './locales/ar/auth.json';
import arSettings from './locales/ar/settings.json';
import arErrors from './locales/ar/errors.json';
import arStudent from './locales/ar/student.json';
import arAdvisor from './locales/ar/advisor.json';
import arAdmin from './locales/ar/admin.json';
import arChat from './locales/ar/chat.json';

const merge = (...parts: Array<Record<string, unknown>>): Record<string, unknown> =>
  Object.assign({}, ...parts);

/**
 * Bilingual runtime (English default / LTR, Arabic / RTL).
 *
 * Convention: the string authored in the source *is* the key. `en/<area>.json`
 * maps that source string to its English rendering, while `ar/<area>.json`
 * holds only the entries where the Arabic source copy should read differently
 * from the code literal (everything else renders the Arabic source unchanged).
 * Because keys carry no separators, source strings may safely contain dots,
 * colons and interpolation placeholders.
 */
export type Lang = 'en' | 'ar';

export const LANGUAGES: ReadonlyArray<Lang> = ['en', 'ar'];
export const DIR: Record<Lang, 'ltr' | 'rtl'> = { en: 'ltr', ar: 'rtl' };
export const INTL_LOCALE: Record<Lang, string> = { en: 'en-GB', ar: 'ar-EG' };

const STORAGE_KEY = 'locale';

export function readStoredLang(): Lang {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    if (value === 'ar' || value === 'en') return value;
  } catch {
    /* storage unavailable — fall back to English */
  }
  return 'en';
}

i18n.use(initReactI18next).init({
  resources: {
    en: {
      translation: merge(
        enCommon,
        enNav,
        enLayout,
        enAuth,
        enSettings,
        enErrors,
        enStudent,
        enAdvisor,
        enAdmin,
        enChat,
      ),
    },
    ar: {
      translation: merge(
        arCommon,
        arNav,
        arLayout,
        arAuth,
        arSettings,
        arErrors,
        arStudent,
        arAdvisor,
        arAdmin,
        arChat,
      ),
    },
  },
  lng: readStoredLang(),
  // No fallback language: an untranslated key renders the source string, so
  // Arabic copy is never silently replaced by English.
  fallbackLng: false,
  supportedLngs: ['en', 'ar'],
  keySeparator: false,
  nsSeparator: false,
  interpolation: { escapeValue: false },
  returnNull: false,
  returnEmptyString: false,
  react: { useSuspense: false },
});

/** Intl locale for the active language (numbers, dates, relative formats). */
export function currentLocale(): string {
  return INTL_LOCALE[(i18n.language as Lang) ?? 'en'] ?? INTL_LOCALE.en;
}

export function isRtl(lang: string | undefined): boolean {
  return lang === 'ar';
}

export default i18n;
