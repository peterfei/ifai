import React from 'react';
import { PromptList } from './PromptList';
import { PromptEditor } from './PromptEditor';
import { usePromptStore } from '../../stores/promptStore';
import { useSettingsStore } from '../../stores/settingsStore';
import clsx from 'clsx';
import { isDarkTheme } from '../../utils/theme';

export const PromptManager: React.FC = () => {
  const selectedPrompt = usePromptStore(state => state.selectedPrompt);
  const theme = useSettingsStore(state => state.theme);
  const dark = isDarkTheme(theme);

  return (
    <div className={clsx('theme-panel flex h-full w-full overflow-hidden transition-colors')} data-theme={theme}>
      <PromptList />
      {/* Force remount on path change to ensure fresh editor state */}
      <PromptEditor key={selectedPrompt?.path || 'empty'} />
    </div>
  );
};
