import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import zhCN from './locales/zh-CN.json';
import enUS from './locales/en-US.json';

// Initialize i18n with global defaults
i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      'zh-CN': { translation: zhCN },
      'zh': { translation: zhCN }, // Fallback for 'zh'
      'en': { translation: enUS },
      'en-US': { translation: enUS }
    },
    lng: 'zh-CN', // Default to Chinese
    fallbackLng: 'en-US',
    interpolation: {
      escapeValue: false // React handles escaping
    }
  });

/**
 * Update language based on project config
 * Call this when a project is loaded
 */
export function updateLanguageFromProjectConfig(defaultLanguage?: string) {
  if (!defaultLanguage) return;

  const currentLang = i18n.language;

  // Only update if different
  if (currentLang !== defaultLanguage) {
    console.log('[i18n] Updating language from project config:', defaultLanguage);
    i18n.changeLanguage(defaultLanguage);
  }
}

/**
 * Watch project config changes and update language accordingly
 * This should be called after the app is initialized
 */
export function watchProjectConfigLanguage() {
  // Import dynamically to avoid circular dependency
  import('../stores/projectConfigStore').then(({ useProjectConfigStore }) => {
    // Initial language update
    const { config } = useProjectConfigStore.getState();
    if (config?.default_language) {
      updateLanguageFromProjectConfig(config.default_language);
    }

    // Watch for config changes
    useProjectConfigStore.subscribe((state, prevState) => {
      // Only react to config changes, not loading state changes
      if (state.config !== prevState.config) {
        const newLang = state.config?.default_language;
        if (newLang) {
          updateLanguageFromProjectConfig(newLang);
        }
      }
    });

    console.log('[i18n] Project config language watcher initialized');
  });
}

export default i18n;
