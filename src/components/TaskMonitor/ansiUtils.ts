/**
 * ANSI Utilities
 *
 * Utilities for parsing and rendering ANSI escape sequences
 * and terminal color codes in React components.
 */

// ============================================================================
// ANSI Color Codes
// ============================================================================

export const ANSI_COLOR_MAP: Record<string, string> = {
  // Foreground colors
  '30': '#000000', // Black
  '31': '#f14c4c', // Red
  '32': '#4ec9b0', // Green
  '33': '#dcdcaa', // Yellow
  '34': '#569cd6', // Blue
  '35': '#c586c0', // Magenta
  '36': '#569cd6', // Cyan
  '37': '#cccccc', // White

  // Bright foreground colors
  '90': '#858585', // Bright black (gray)
  '91': '#f14c4c', // Bright red
  '92': '#4ec9b0', // Bright green
  '93': '#dcdcaa', // Bright yellow
  '94': '#569cd6', // Bright blue
  '95': '#c586c0', // Bright magenta
  '96': '#569cd6', // Bright cyan
  '97': '#ffffff', // Bright white

  // Background colors
  '40': '#000000',
  '41': '#f14c4c',
  '42': '#4ec9b0',
  '43': '#dcdcaa',
  '44': '#569cd6',
  '45': '#c586c0',
  '46': '#569cd6',
  '47': '#cccccc',
};

// ============================================================================
// Parsing Functions
// ============================================================================

/**
 * Strip all ANSI escape sequences from text
 */
export function stripANSI(text: string): string {
  return text.replace(/\x1b\[[0-9;]*m/g, '');
}

/**
 * Escape HTML special characters
 */
export function escapeHtml(text: string): string {
  const htmlEntities: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  };
  return text.replace(/[&<>"']/g, (char) => htmlEntities[char] || char);
}

/**
 * Parse ANSI escape sequences to styled HTML
 */
export function parseANSIToHTML(text: string): {
  html: string;
  hasColor: boolean;
} {
  if (!text) return { html: '', hasColor: false };

  const stack: string[] = [];
  let result = '';
  let hasColor = false;

  // Regex for ANSI escape sequences: \x1b[Xm where X is one or more numbers separated by ;
  const ansiRegex = /\x1b\[([0-9;]*)m/g;

  let lastIndex = 0;
  let match;

  while ((match = ansiRegex.exec(text)) !== null) {
    // Add text before this escape sequence
    result += escapeHtml(text.slice(lastIndex, match.index));

    // Parse the ANSI code(s)
    const codes = match[1].split(';');

    for (const code of codes) {
      if (code === '0') {
        // Reset - close all open spans
        while (stack.length > 0) {
          result += '</span>';
          stack.pop();
        }
      } else if (code === '1') {
        // Bold
        result += '<span style="font-weight: bold;">';
        stack.push('bold');
      } else if (code === '4') {
        // Underline
        result += '<span style="text-decoration: underline;">';
        stack.push('underline');
      } else if (code in ANSI_COLOR_MAP) {
        // Color
        const color = ANSI_COLOR_MAP[code];
        const isBg = code.startsWith('4');
        const style = isBg ? `background-color: ${color}` : `color: ${color}`;
        result += `<span style="${style};">`;
        stack.push(style);
        hasColor = true;
      }
    }

    lastIndex = ansiRegex.lastIndex;
  }

  // Add remaining text
  result += escapeHtml(text.slice(lastIndex));

  // Close any unclosed spans
  while (stack.length > 0) {
    result += '</span>';
    stack.pop();
  }

  return { html: result, hasColor };
}

/**
 * Parse ANSI to React spans (alternative implementation)
 */
export function parseANSIToSpans(
  text: string
): Array<{ type: 'text' | 'styled'; content: string; style?: any }> {
  const parts: Array<{ type: 'text' | 'styled'; content: string; style?: any }> = [];
  const ansiRegex = /\x1b\[([0-9;]*)m/g;

  let lastIndex = 0;
  let currentStyle: any = {};

  let match;
  while ((match = ansiRegex.exec(text)) !== null) {
    // Add text before this escape sequence
    if (match.index > lastIndex) {
      const textContent = text.slice(lastIndex, match.index);
      if (Object.keys(currentStyle).length > 0) {
        parts.push({ type: 'styled', content: textContent, style: { ...currentStyle } });
      } else {
        parts.push({ type: 'text', content: textContent });
      }
    }

    // Parse ANSI code
    const code = match[1];
    if (code === '0') {
      currentStyle = {};
    } else if (code === '1') {
      currentStyle.fontWeight = 'bold';
    } else if (code in ANSI_COLOR_MAP) {
      const color = ANSI_COLOR_MAP[code];
      if (code.startsWith('4')) {
        currentStyle.backgroundColor = color;
      } else {
        currentStyle.color = color;
      }
    }

    lastIndex = ansiRegex.lastIndex;
  }

  // Add remaining text
  if (lastIndex < text.length) {
    const textContent = text.slice(lastIndex);
    if (Object.keys(currentStyle).length > 0) {
      parts.push({ type: 'styled', content: textContent, style: { ...currentStyle } });
    } else {
      parts.push({ type: 'text', content: textContent });
    }
  }

  return parts;
}

/**
 * Format timestamp for logs
 */
export function formatLogTimestamp(timestamp: number, includeMs: boolean = true): string {
  const date = new Date(timestamp);
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  const seconds = date.getSeconds().toString().padStart(2, '0');
  const ms = date.getMilliseconds().toString().padStart(3, '0');

  return includeMs
    ? `${hours}:${minutes}:${seconds}.${ms}`
    : `${hours}:${minutes}:${seconds}`;
}

/**
 * Detect if text contains ANSI codes
 */
export function hasANSICodes(text: string): boolean {
  return /\x1b\[[0-9;]*m/.test(text);
}

/**
 * Convert ANSI codes to plain text with removal
 */
export function ansiToPlainText(text: string): string {
  return stripANSI(text);
}
