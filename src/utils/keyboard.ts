export const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;

export const formatKeybinding = (keys: string): string => {
  return keys
    .split('+')
    .map((part) => {
      if (part === 'Mod') return isMac ? 'Cmd' : 'Ctrl';
      if (part.length === 1) return part.toUpperCase();
      return part.charAt(0).toUpperCase() + part.slice(1);
    })
    .join('+');
};

export const matchesKeybinding = (e: KeyboardEvent, keybinding: string): boolean => {
  if (!keybinding) return false;
  
  const parts = keybinding.split('+');
  const key = parts[parts.length - 1].toLowerCase();
  const modifiers = new Set(parts.slice(0, parts.length - 1));

  // Check key
  // e.key for 's' is 's'. for 'Enter' is 'Enter'. for '\' is '\'.
  if (e.key.toLowerCase() !== key) return false;

  // Check modifiers
  const isModPressed = isMac ? e.metaKey : e.ctrlKey;
  const isCtrlPressed = e.ctrlKey;
  const isMetaPressed = e.metaKey;
  const isAltPressed = e.altKey;
  const isShiftPressed = e.shiftKey;

  // Strict check: required modifiers must be pressed, others must NOT be pressed
  
  // Mod (Cmd on Mac, Ctrl on Win)
  if (modifiers.has('Mod')) {
      if (!isModPressed) return false;
  } else {
      // If Mod is NOT required:
      // On Mac: Cmd should not be pressed
      // On Win: Ctrl should not be pressed (unless strictly asking for Ctrl?)
      // Simplification: if 'Mod' isn't in list, ensure primary modifier isn't pressed.
      if (isModPressed) return false; 
  }

  // Shift
  if (modifiers.has('Shift')) {
      if (!isShiftPressed) return false;
  } else {
      if (isShiftPressed) return false;
  }

  // Alt
  if (modifiers.has('Alt')) {
      if (!isAltPressed) return false;
  } else {
      if (isAltPressed) return false;
  }

  // Ctrl (Explicit Control key, distinct from Mod on Mac)
  if (modifiers.has('Ctrl') || modifiers.has('Control')) {
      if (isMac && !isCtrlPressed) return false; // On Mac, check real Ctrl
      // On Windows, Mod IS Ctrl, so this is redundant or handled by Mod. 
      // If config says 'Ctrl+C' on Windows, it means Copy. 'Mod+C' means Copy.
      // If config says 'Mod+Ctrl+C', that's weird on Windows.
      // Let's assume explicit 'Ctrl' is mostly for Mac usage or specific Ctrl+Alt combos.
  } 

  return true;
};
