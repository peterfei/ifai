/**
 * I18N-001: Error Code Mapping Service
 *
 * Provides translation for error codes returned by backend services.
 * Ensures that all error messages are properly internationalized.
 */

import i18n from '../i18n/config';

/**
 * Standard error codes that may be returned by backend services
 */
export const ERROR_CODES = {
  // File system errors
  ERR_FILE_NOT_FOUND: 'ERR_FILE_NOT_FOUND',
  ERR_FILE_READ_FAILED: 'ERR_FILE_READ_FAILED',
  ERR_FILE_WRITE_FAILED: 'ERR_FILE_WRITE_FAILED',
  ERR_FOLDER_OPEN_FAILED: 'ERR_FOLDER_OPEN_FAILED',
  ERR_FILE_CREATE_FAILED: 'ERR_FILE_CREATE_FAILED',
  ERR_FILE_DELETE_FAILED: 'ERR_FILE_DELETE_FAILED',

  // Network errors
  ERR_NETWORK: 'ERR_NETWORK',
  ERR_UNAUTHORIZED: 'ERR_UNAUTHORIZED',
  ERR_FORBIDDEN: 'ERR_FORBIDDEN',
  ERR_TIMEOUT: 'ERR_TIMEOUT',
  ERR_SERVER_ERROR: 'ERR_SERVER_ERROR',

  // Parse/Validation errors
  ERR_PARSE_FAILED: 'ERR_PARSE_FAILED',
  ERR_VALIDATION_FAILED: 'ERR_VALIDATION_FAILED',
  ERR_INVALID_JSON: 'ERR_INVALID_JSON',
  ERR_INVALID_FORMAT: 'ERR_INVALID_FORMAT',

  // Application errors
  ERR_OPERATION_FAILED: 'ERR_OPERATION_FAILED',
  ERR_UNKNOWN_ERROR: 'ERR_UNKNOWN_ERROR',
} as const;

export type ErrorCode = typeof ERROR_CODES[keyof typeof ERROR_CODES];

/**
 * Error details interface
 */
export interface ErrorDetails {
  path?: string;
  fileName?: string;
  operation?: string;
  line?: number;
  [key: string]: any;
}

/**
 * Backend error interface
 */
export interface BackendError {
  code: ErrorCode | string;
  message: string;
  details?: ErrorDetails;
}

/**
 * Error Code Mapper Service
 *
 * Translates error codes to user-facing messages based on current language.
 */
export class ErrorCodeMapper {
  /**
   * Check if an error code is known
   */
  has(code: string): boolean {
    return Object.values(ERROR_CODES).includes(code as ErrorCode);
  }

  /**
   * Get translation key for an error code
   */
  private getTranslationKey(code: string): string {
    return `errors.${code}`;
  }

  /**
   * Translate an error code to a user-facing message
   *
   * @param code - Error code
   * @param language - Target language (defaults to current i18n language)
   * @param fallbackMessage - Fallback message if translation not found
   * @param params - Interpolation parameters
   */
  translate(
    code: string,
    language?: string,
    fallbackMessage?: string,
    params?: Record<string, any>
  ): string {
    const translationKey = this.getTranslationKey(code);

    try {
      // Use i18next to translate
      const translation = i18n.t(translationKey, {
        lng: language || i18n.language,
        ...params
      });

      // If translation key is returned as-is, use fallback
      if (translation === translationKey) {
        return fallbackMessage || code;
      }

      return translation;
    } catch (error) {
      console.error(`[ErrorCodeMapper] Failed to translate error code: ${code}`, error);
      return fallbackMessage || code;
    }
  }

  /**
   * Get translation for an error code (alias for translate)
   */
  getTranslation(code: string, language: string): string | undefined {
    const translationKey = this.getTranslationKey(code);

    try {
      const translation = i18n.t(translationKey, { lng: language });

      // If translation key is returned as-is, translation doesn't exist
      if (translation === translationKey) {
        return undefined;
      }

      return translation;
    } catch {
      return undefined;
    }
  }
}

// Singleton instance
export const errorCodeMapper = new ErrorCodeMapper();

/**
 * Convenience function to translate an error code
 */
export function translateErrorCode(
  code: string,
  params?: Record<string, any>
): string {
  return errorCodeMapper.translate(code, undefined, undefined, params);
}

/**
 * Convenience function to translate a backend error
 */
export function translateBackendError(error: BackendError): string {
  return errorCodeMapper.translate(
    error.code,
    undefined,
    error.message,  // Use original message as fallback
    error.details
  );
}
