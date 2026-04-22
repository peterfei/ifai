import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import zhCN from './locales/zh-CN.json';
import enUS from './locales/en-US.json';
import ruRU from './locales/ru-RU.json';

// 🔥 v0.3.0 修复：同步读取 localStorage 中的语言设置
// 这样可以避免在 Vite 生产构建中，组件在语言检测完成前就渲染的竞态条件
const getInitialLanguage = (): string | undefined => {
  try {
    // 优先读取 localStorage 中保存的语言
    const saved = localStorage.getItem('i18nextLng');
    if (saved && (saved === 'zh-CN' || saved === 'en-US' || saved === 'en' || saved === 'zh' || saved === 'ru-RU' || saved === 'ru')) {
      console.log('[i18n] Initial language from localStorage:', saved);
      return saved;
    }
  } catch (e) {
    console.warn('[i18n] Failed to read localStorage:', e);
  }
  // 返回 undefined，让 LanguageDetector 继续检测
  return undefined;
};

// Initialize i18n with global defaults
i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      'zh-CN': { translation: zhCN },
      'zh': { translation: zhCN }, // Fallback for 'zh'
      'en': { translation: enUS },
      'en-US': { translation: enUS },
      'ru-RU': { translation: ruRU },
      'ru': { translation: ruRU }, // Fallback for 'ru'
    },
    // 🔥 v0.3.0 修复：使用同步读取的初始语言，避免竞态条件
    // 如果 localStorage 中有保存的语言，直接使用；否则让 LanguageDetector 检测
    lng: getInitialLanguage(),
    fallbackLng: 'en-US',
    detection: {
      // 语言检测顺序：localStorage -> navigator -> htmlTag
      order: ['localStorage', 'navigator'],
      // localStorage 中存储语言的 key
      caches: ['localStorage'],
      // localStorage key 名称
      lookupLocalStorage: 'i18nextLng'
    },
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
