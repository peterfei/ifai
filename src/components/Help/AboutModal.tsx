/**
 * v0.3.0: 关于页面组件
 *
 * 显示应用的版本信息、文档链接等
 */

import React from 'react';
import { X, Github, Book, FileText, MessageCircle, Heart } from 'lucide-react';
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
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-gray-800 rounded-lg shadow-xl max-w-md w-full overflow-hidden flex flex-col">
        {/* 标题栏 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700">
          <h2 className="text-lg font-semibold text-white">{t('help.about')}</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* 内容区域 */}
        <div className="p-6">
          {/* Logo 和标题 */}
          <div className="flex items-center justify-center mb-6">
            <div className="text-center">
              <h1 className="text-3xl font-bold text-white mb-2">IfAI Editor</h1>
              <p className="text-gray-400 text-sm">{t('help.tagline')}</p>
              <div className="mt-3 inline-block px-3 py-1 bg-purple-600 bg-opacity-20 text-purple-400 text-xs rounded-full border border-purple-500">
                v{version}
              </div>
            </div>
          </div>

          {/* 描述 */}
          <p className="text-gray-300 text-sm text-center mb-6">
            {t('help.description')}
          </p>

          {/* 链接列表 */}
          <div className="space-y-2 mb-6">
            <button
              onClick={() => openLink('https://github.com/peterfei/ifai/wiki')}
              className="w-full flex items-center justify-between px-4 py-3 rounded-lg bg-gray-700 hover:bg-gray-600 transition-colors group"
            >
              <div className="flex items-center gap-3">
                <Book size={18} className="text-gray-400 group-hover:text-white" />
                <span className="text-gray-300 text-sm">{t('help.documentation')}</span>
              </div>
              <span className="text-gray-500 text-xs">Wiki</span>
            </button>

            <button
              onClick={() => openLink('https://github.com/peterfei/ifai')}
              className="w-full flex items-center justify-between px-4 py-3 rounded-lg bg-gray-700 hover:bg-gray-600 transition-colors group"
            >
              <div className="flex items-center gap-3">
                <Github size={18} className="text-gray-400 group-hover:text-white" />
                <span className="text-gray-300 text-sm">{t('help.repository')}</span>
              </div>
              <span className="text-gray-500 text-xs">GitHub</span>
            </button>

            <button
              onClick={() => openLink('https://github.com/peterfei/ifai/discussions')}
              className="w-full flex items-center justify-between px-4 py-3 rounded-lg bg-gray-700 hover:bg-gray-600 transition-colors group"
            >
              <div className="flex items-center gap-3">
                <MessageCircle size={18} className="text-gray-400 group-hover:text-white" />
                <span className="text-gray-300 text-sm">{t('help.community')}</span>
              </div>
              <span className="text-gray-500 text-xs">Discussions</span>
            </button>
          </div>

          {/* 许可证信息 */}
          <div className="text-center">
            <p className="text-gray-500 text-xs">
              © {currentYear} IfAI Editor. {t('help.allRightsReserved')}
            </p>
            <p className="text-gray-600 text-xs mt-1">
              Made By Peterfei
            </p>
          </div>

          {/* 报告问题按钮 */}
          <div className="mt-4">
            <button
              onClick={() => openLink('https://github.com/peterfei/ifai/issues')}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 transition-colors text-white text-sm"
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
