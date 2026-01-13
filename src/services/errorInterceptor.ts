/**
 * I18N-002: Error Interceptor Service
 *
 * Intercepts backend errors and automatically translates them to user-facing messages.
 * Integrates with toast/notification systems to display translated errors.
 */

import i18n from '../i18n/config';
import { toast } from 'sonner';
import {
  BackendError,
  errorCodeMapper,
  translateBackendError,
  ErrorCode,
  ERROR_CODES
} from './errorCodeMapper';

/**
 * Translated error interface
 */
export interface TranslatedError {
  code: string;
  message: string;
  originalMessage: string;
  details?: any;
}

/**
 * Error Interceptor Service
 *
 * Intercepts errors from backend services and translates them
 * to user-facing messages based on current language.
 */
export class ErrorInterceptor {
  private currentLanguage: string;

  constructor() {
    this.currentLanguage = i18n.language;

    // Listen for language changes
    i18n.on('languageChanged', (lng) => {
      this.currentLanguage = lng;
    });
  }

  /**
   * Intercept and translate a backend error
   *
   * @param error - Backend error object
   * @returns Translated error object
   */
  intercept(error: BackendError | Error | string): TranslatedError {
    let backendError: BackendError;

    // Normalize different error types to BackendError
    if (typeof error === 'string') {
      backendError = {
        code: ERROR_CODES.ERR_UNKNOWN_ERROR,
        message: error
      };
    } else if (error instanceof Error) {
      backendError = {
        code: (error as any).code || ERROR_CODES.ERR_UNKNOWN_ERROR,
        message: error.message
      };
    } else {
      backendError = error;
    }

    // Translate the error
    const translatedMessage = translateBackendError(backendError);

    return {
      code: backendError.code,
      message: translatedMessage,
      originalMessage: backendError.message,
      details: backendError.details
    };
  }

  /**
   * Get translated message for toast notification
   *
   * @param code - Error code
   * @param originalMessage - Original message (fallback)
   * @returns Translated message for toast
   */
  getToastMessage(code: string, originalMessage?: string): string {
    return errorCodeMapper.translate(
      code,
      this.currentLanguage,
      originalMessage
    );
  }

  /**
   * Show error toast with translated message
   *
   * @param error - Error object, code, or message
   */
  showError(error: BackendError | Error | string): void {
    const translated = this.intercept(error);

    toast.error(translated.message, {
      description: translated.details ? JSON.stringify(translated.details) : undefined,
      id: `error-${translated.code}`  // Prevent duplicate toasts
    });
  }

  /**
   * Show success toast with translated message
   *
   * @param message - Message or i18n key
   * @param params - Interpolation parameters
   */
  showSuccess(message: string, params?: Record<string, any>): void {
    const translated = i18n.t(message, params);

    toast.success(translated);
  }

  /**
   * Show info toast with translated message
   *
   * @param message - Message or i18n key
   * @param params - Interpolation parameters
   */
  showInfo(message: string, params?: Record<string, any>): void {
    const translated = i18n.t(message, params);

    toast.info(translated);
  }

  /**
   * Show warning toast with translated message
   *
   * @param message - Message or i18n key
   * @param params - Interpolation parameters
   */
  showWarning(message: string, params?: Record<string, any>): void {
    const translated = i18n.t(message, params);

    toast.warning(translated);
  }

  /**
   * Translate an error code directly
   *
   * @param code - Error code
   * @param params - Interpolation parameters
   * @returns Translated message
   */
  translate(code: string, params?: Record<string, any>): string {
    return errorCodeMapper.translate(code, this.currentLanguage, undefined, params);
  }

  /**
   * Wrap an async function with automatic error interception
   *
   * @param fn - Async function to wrap
   * @returns Wrapped function that shows error toasts
   */
  wrapAsync<T extends (...args: any[]) => Promise<any>>(
    fn: T
  ): T {
    return (async (...args: Parameters<T>) => {
      try {
        return await fn(...args);
      } catch (error) {
        this.showError(error as Error);
        throw error;  // Re-throw for further handling
      }
    }) as T;
  }
}

// Singleton instance
export const errorInterceptor = new ErrorInterceptor();

/**
 * Convenience function to show error toast
 */
export function showError(error: BackendError | Error | string): void {
  errorInterceptor.showError(error);
}

/**
 * Convenience function to translate error
 */
export function translateError(code: string, params?: Record<string, any>): string {
  return errorInterceptor.translate(code, params);
}

/**
 * Convenience function to wrap async function with error handling
 */
export function withErrorHandling<T extends (...args: any[]) => Promise<any>>(
  fn: T
): T {
  return errorInterceptor.wrapAsync(fn);
}

/**
 * React hook for error interception
 *
 * @returns Error interceptor methods
 */
export function useErrorInterceptor() {
  return {
    showError: errorInterceptor.showError.bind(errorInterceptor),
    showSuccess: errorInterceptor.showSuccess.bind(errorInterceptor),
    showInfo: errorInterceptor.showInfo.bind(errorInterceptor),
    showWarning: errorInterceptor.showWarning.bind(errorInterceptor),
    translate: errorInterceptor.translate.bind(errorInterceptor),
    intercept: errorInterceptor.intercept.bind(errorInterceptor),
    wrapAsync: errorInterceptor.wrapAsync.bind(errorInterceptor)
  };
}
