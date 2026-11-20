let language = 'en';
try {
  if (localStorage.getItem('fieldwork.language') === 'vi') language = 'vi';
} catch {}

export const getLanguage = () => language;
export const t = (vi, en) => language === 'vi' ? vi : en;

export function setLanguage(value) {
  if (value !== 'en' && value !== 'vi') return;
  language = value;
  try { localStorage.setItem('fieldwork.language', value); } catch {}
}
