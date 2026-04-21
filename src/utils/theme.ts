export type AppTheme = 'vs-dark' | 'light';

export const isDarkTheme = (theme: AppTheme): boolean => theme === 'vs-dark';

export const getThemeMode = (theme: AppTheme): 'dark' | 'light' =>
  isDarkTheme(theme) ? 'dark' : 'light';

export const getSonnerTheme = (theme: AppTheme): 'dark' | 'light' =>
  getThemeMode(theme);

export const getMonacoTheme = (theme: AppTheme): 'vs-dark' | 'light' =>
  isDarkTheme(theme) ? 'vs-dark' : 'light';

export const getMonacoBaseTheme = (theme: AppTheme): 'vs-dark' | 'vs' =>
  isDarkTheme(theme) ? 'vs-dark' : 'vs';

export const applyThemeToDocument = (theme: AppTheme): void => {
  if (typeof document === 'undefined') return;

  const root = document.documentElement;
  const dark = isDarkTheme(theme);

  root.dataset.theme = theme;
  root.classList.toggle('dark', dark);
  document.body.classList.toggle('dark', dark);
};
