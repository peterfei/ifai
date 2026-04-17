/**
 * v0.3.0: 关于页面组件
 *
 * 显示应用的版本信息、文档链接等
 */

import React from 'react';
import { X, Github, Book, FileText, MessageCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { open } from '@tauri-apps/plugin-shell';

interface AboutModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AboutModal: React.FC<AboutModalProps> = ({ isOpen, onClose }) => {
  const { t } = useTranslation();

  if (!isOpen) return null;

  // 从 package.json 读取版本信息
  const version = '0.3.0'; // 可以从 env 或 package.json 动态读取
  const currentYear = new Date().getFullYear();

  const openLink = async (url: string) => {
    try {
      await open(url);
    } catch (error) {
      console.error('Failed to open link:', error);
      // 降级到 window.open
      window.open(url, '_blank');
    }
  };

  return (
    <div className="theme-backdrop fixed inset-0 z-[220] flex items-center justify-center">
      <div className="theme-panel-elevated theme-border theme-shadow flex w-full max-w-md flex-col overflow-hidden rounded-lg border">
        {/* 标题栏 */}
        <div className="theme-border flex items-center justify-between border-b px-6 py-4">
          <h2 className="theme-text text-lg font-semibold">{t('help.about')}</h2>
          <button
            onClick={onClose}
            className="theme-button-ghost rounded p-1"
          >
            <X size={20} />
          </button>
        </div>

        {/* 内容区域 */}
        <div className="p-6">
          {/* Logo 和标题 */}
          <div className="flex items-center justify-center mb-6">
            <div className="text-center">
              <h1 className="theme-text mb-2 text-3xl font-bold">IfAI Editor</h1>
              <p className="theme-text-subtle text-sm">{t('help.tagline')}</p>
              <div className="mt-3 inline-block rounded-full border border-blue-500/20 bg-blue-500/10 px-3 py-1 text-xs text-blue-500">
                v{version}
              </div>
            </div>
          </div>

          {/* 描述 */}
          <p className="theme-text-muted mb-6 text-center text-sm">
            {t('help.description')}
          </p>

          {/* 链接列表 */}
          <div className="space-y-2 mb-6">
            <button
              onClick={() => openLink('https://github.com/peterfei/ifai/wiki')}
              className="theme-panel-muted theme-hoverable group flex w-full items-center justify-between rounded-lg px-4 py-3 transition-colors"
            >
              <div className="flex items-center gap-3">
                <Book size={18} className="theme-text-subtle transition-colors group-hover:text-[var(--text-primary)]" />
                <span className="theme-text-muted text-sm">{t('help.documentation')}</span>
              </div>
              <span className="theme-text-subtle text-xs">Wiki</span>
            </button>

            <button
              onClick={() => openLink('https://github.com/peterfei/ifai')}
              className="theme-panel-muted theme-hoverable group flex w-full items-center justify-between rounded-lg px-4 py-3 transition-colors"
            >
              <div className="flex items-center gap-3">
                <Github size={18} className="theme-text-subtle transition-colors group-hover:text-[var(--text-primary)]" />
                <span className="theme-text-muted text-sm">{t('help.repository')}</span>
              </div>
              <span className="theme-text-subtle text-xs">GitHub</span>
            </button>

            <button
              onClick={() => openLink('https://github.com/peterfei/ifai/discussions')}
              className="theme-panel-muted theme-hoverable group flex w-full items-center justify-between rounded-lg px-4 py-3 transition-colors"
            >
              <div className="flex items-center gap-3">
                <MessageCircle size={18} className="theme-text-subtle transition-colors group-hover:text-[var(--text-primary)]" />
                <span className="theme-text-muted text-sm">{t('help.community')}</span>
              </div>
              <span className="theme-text-subtle text-xs">Discussions</span>
            </button>
          </div>

          {/* 许可证信息 */}
          <div className="text-center">
            <p className="theme-text-subtle text-xs">
              © {currentYear} IfAI Editor. {t('help.allRightsReserved')}
            </p>
            <p className="theme-text-subtle mt-1 text-xs opacity-80">
              Made By Peterfei
            </p>
          </div>

          {/* 报告问题按钮 */}
          <div className="mt-4">
            <button
              onClick={() => openLink('https://github.com/peterfei/ifai/issues')}
              className="theme-button-primary flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm"
            >
              <FileText size={16} />
              <span>{t('help.reportIssue')}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
