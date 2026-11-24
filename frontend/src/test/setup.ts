import '@testing-library/jest-dom/vitest';
import i18n from '../i18n';

// The suite asserts the Arabic source copy (numbers, terms, meridiems, label
// maps), which is exactly what renders when the active language is Arabic.
// Production defaults to English; tests pin the language so expectations stay
// deterministic regardless of machine locale.
i18n.changeLanguage('ar');
