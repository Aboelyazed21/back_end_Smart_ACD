declare module 'arabic-persian-reshaper' {
  interface Shaper {
    convertArabic(text: string): string;
  }
  export const ArabicShaper: Shaper;
  export const PersianShaper: Shaper;
}
