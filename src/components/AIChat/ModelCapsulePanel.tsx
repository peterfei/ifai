
import React from 'react';
import { motion } from 'framer-motion';
import { Settings, Check, ChevronRight, Eye, EyeOff, Bug } from 'lucide-react';
import { useSettingsStore } from '../../stores/settingsStore';
import { isDarkTheme } from '../../utils/theme';

type TransparencyLevel = 'minimal' | 'standard' | 'verbose' | 'debug';

interface ModelCapsulePanelProps {
  onClose: () => void;
  setSettingsOpen: (open: boolean) => void;
}

export const ModelCapsulePanel: React.FC<ModelCapsulePanelProps> = ({ onClose, setSettingsOpen }) => {
  const theme = useSettingsStore(state => state.theme);
  const dark = isDarkTheme(theme);
  const providers = useSettingsStore(state => state.providers);
  const currentProviderId = useSettingsStore(state => state.currentProviderId);
  const currentModel = useSettingsStore(state => state.currentModel);
  const setCurrentProviderAndModel = useSettingsStore(state => state.setCurrentProviderAndModel);
  const transparencyLevel = useSettingsStore(state => state.transparencyLevel);
  const updateSettings = useSettingsStore(state => state.updateSettings);

  const currentProvider = providers.find(p => p.id === currentProviderId);

  const cycleTransparency = () => {
    const levels: TransparencyLevel[] = ['standard', 'verbose', 'debug', 'standard'];
    const currentIdx = levels.indexOf(transparencyLevel);
    const next = levels[(currentIdx + 1) % levels.length];
    updateSettings({ transparencyLevel: next });
  };

  const transparencyLabels: Record<TransparencyLevel, { icon: React.ReactNode; label: string }> = {
    minimal: { icon: <EyeOff size={12} />, label: '隐藏' },
    standard: { icon: <Eye size={12} />, label: '标准' },
    verbose: { icon: <Eye size={12} />, label: '详细' },
    debug: { icon: <Bug size={12} />, label: '调试' },
  };

  return (
    <motion.div
      data-testid="model-capsule-panel"
      initial={{ opacity: 0, y: 10, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 10, scale: 0.95 }}
      className="theme-panel-elevated theme-border theme-shadow w-full rounded-xl border z-[100] overflow-hidden backdrop-blur-2xl"
    >
      <div className="theme-panel-muted theme-border p-2 border-b">
        <span className="theme-text-subtle text-[10px] font-bold uppercase tracking-widest px-2">选择模型</span>
      </div>
      
      <div className="max-h-[300px] overflow-y-auto p-1.5 space-y-1">
        {providers.filter(p => p.enabled).map(provider => (
          <div key={provider.id} className="space-y-1">
            <div className="px-2 py-1 text-[11px] font-bold text-blue-500 flex items-center gap-2">
              <span>{provider.name}</span>
              <div className="h-px flex-1 bg-blue-500/15" />
            </div>
            {provider.models.map(model => {
              const isActive = provider.id === currentProviderId && model === currentModel;
              return (
                <button
                  key={model}
                  onClick={() => {
                    setCurrentProviderAndModel(provider.id, model);
                    onClose();
                  }}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs transition-all ${
                    isActive 
                      ? 'bg-blue-500/10 text-blue-500'
                      : 'theme-text-subtle theme-soft-hover hover:text-[var(--text-primary)]'
                  }`}
                >
                  <span className="truncate">{model}</span>
                  {isActive && <Check size={12} />}
                </button>
              );
            })}
          </div>
        ))}
      </div>

      <div className="theme-panel-muted theme-border p-1.5 border-t space-y-1">
        {/* AI Transparency 切换 */}
        <button
          onClick={cycleTransparency}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-[11px] theme-text-subtle theme-soft-hover hover:text-[var(--text-primary)] transition-all"
          title={`AI 透明度: ${transparencyLabels[transparencyLevel].label}`}
        >
          {transparencyLabels[transparencyLevel].icon}
          <span>AI 透明度: {transparencyLabels[transparencyLevel].label}</span>
          <span className="ml-auto text-[9px] theme-text-subtle font-mono">
            {transparencyLevel.toUpperCase()}
          </span>
        </button>

        <button
          onClick={() => {
            setSettingsOpen(true);
            onClose();
          }}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-[11px] theme-text-subtle theme-soft-hover hover:text-[var(--text-primary)] transition-all"
        >
          <Settings size={12} />
          <span>进阶模型设置</span>
          <ChevronRight size={10} className="ml-auto" />
        </button>
      </div>
    </motion.div>
  );
};
