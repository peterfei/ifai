
import React from 'react';
import { motion } from 'framer-motion';
import { Settings, Check, ChevronRight, Eye, EyeOff, Bug } from 'lucide-react';
import { useSettingsStore } from '../../stores/settingsStore';
import { useTranslation } from 'react-i18next';

type TransparencyLevel = 'minimal' | 'standard' | 'verbose' | 'debug';

interface ModelCapsulePanelProps {
  onClose: () => void;
  setSettingsOpen: (open: boolean) => void;
}

export const ModelCapsulePanel: React.FC<ModelCapsulePanelProps> = ({ onClose, setSettingsOpen }) => {
  const { t } = useTranslation();
  const providers = useSettingsStore(state => state.providers);
  const currentProviderId = useSettingsStore(state => state.currentProviderId);
  const currentModel = useSettingsStore(state => state.currentModel);
  const setCurrentProviderAndModel = useSettingsStore(state => state.setCurrentProviderAndModel);
  const transparencyLevel = useSettingsStore(state => state.transparencyLevel);
  const updateSettings = useSettingsStore(state => state.updateSettings);

  const cycleTransparency = () => {
    const levels: TransparencyLevel[] = ['standard', 'verbose', 'debug', 'standard'];
    const currentIdx = levels.indexOf(transparencyLevel);
    const next = levels[(currentIdx + 1) % levels.length];
    updateSettings({ transparencyLevel: next });
  };

  const transparencyLabels: Record<TransparencyLevel, { icon: React.ReactNode; label: string }> = {
    minimal: { icon: <EyeOff size={12} />, label: t('modelCapsule.transparency.minimal') },
    standard: { icon: <Eye size={12} />, label: t('modelCapsule.transparency.standard') },
    verbose: { icon: <Eye size={12} />, label: t('modelCapsule.transparency.verbose') },
    debug: { icon: <Bug size={12} />, label: t('modelCapsule.transparency.debug') },
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
        <span className="theme-text-subtle text-[10px] font-bold uppercase tracking-widest px-2">{t('modelCapsule.selectModel')}</span>
      </div>
      
      <div className="max-h-[300px] overflow-y-auto p-1.5 space-y-1">
        {providers.filter(p => p.enabled).map(provider => (
          <div key={provider.id} className="space-y-1">
            <div className="theme-text flex items-center gap-2 px-2 py-1 text-[11px] font-bold">
              <span className="theme-text-accent">{provider.name}</span>
              <div className="h-px flex-1 bg-[var(--accent-soft-border)]" />
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
                  className={`theme-border w-full flex items-center justify-between rounded-lg px-3 py-2 text-xs transition-all ${
                    isActive 
                      ? 'border-[var(--accent-soft-border)] bg-[var(--selected-bg)] text-[var(--text-primary)]'
                      : 'border-transparent theme-text-subtle theme-soft-hover hover:text-[var(--text-primary)]'
                  }`}
                >
                  <span className="truncate">{model}</span>
                  {isActive && <Check size={12} className="theme-text-accent" />}
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
          title={`${t('modelCapsule.transparency.label')}: ${transparencyLabels[transparencyLevel].label}`}
        >
          {transparencyLabels[transparencyLevel].icon}
          <span>{t('modelCapsule.transparency.label')}: {transparencyLabels[transparencyLevel].label}</span>
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
          <span>{t('modelCapsule.advancedSettings')}</span>
          <ChevronRight size={10} className="ml-auto" />
        </button>
      </div>
    </motion.div>
  );
};
