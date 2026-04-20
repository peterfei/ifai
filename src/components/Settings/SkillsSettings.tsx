/**
 * 技能设置界面 - 完整版
 * Phase 7: 完整 UI 重构
 * 集成新的技能管理系统
 */

import React, { useEffect, useState } from 'react';
import { ShieldCheck, Download, X } from 'lucide-react';
import { SkillsManagement } from './Skills/SkillsManagement';
import { SkillInstaller } from './Skills/SkillInstaller';
import { SkillEditor } from './Skills/SkillEditor';
import { useSkillStore } from '@/stores/skillStore.enhanced';
import { invoke } from '@tauri-apps/api/core';
import { useFileStore } from '@/stores/fileStore';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import type { SkillEditorMode, Skill } from './Skills/types';

export const SkillsSettings: React.FC = () => {
  // 🔥 FIX: 使用选择器确保订阅正确
  const availableSkills = useSkillStore(state => state.availableSkills);
  const isLoading = useSkillStore(state => state.isLoading);
  const fetchSkills = useSkillStore(state => state.fetchSkills);
  const installSkill = useSkillStore(state => state.installSkill);
  const createSkill = useSkillStore(state => state.createSkill);
  const updateSkill = useSkillStore(state => state.updateSkill);

  const [showInstaller, setShowInstaller] = useState(false);
  const [showEditor, setShowEditor] = useState(false);
  const [editorMode, setEditorMode] = useState<SkillEditorMode>({ type: 'create' });
  const [selectedSkill, setSelectedSkill] = useState<Skill | undefined>();
  const [isInstallingDemo, setIsInstallingDemo] = useState(false);

  // 初始加载
  useEffect(() => {
    if (availableSkills.length === 0) {
      fetchSkills();
    }
  }, []);

  // 安装示例技能
  const installDemo = async () => {
    const rootPath = useFileStore.getState().rootPath;
    if (!rootPath) {
      toast.error('无法获取项目路径', {
        description: '请先打开一个项目'
      });
      return;
    }

    setIsInstallingDemo(true);
    try {
      // 使用新的安装逻辑，安装内置示例技能
      await invoke('install_skill', {
        projectRoot: rootPath,
        skillId: 'builtin-examples',
        source: 'builtin'
      });

      // 显示成功提示
      toast.success('示例技能安装成功！', {
        description: '已安装4个实用技能：代码审查、测试生成、文档撰写、调试专家'
      });

      // 刷新技能列表
      await fetchSkills();
    } catch (e) {
      console.error('Failed to install demo skills:', e);
      // 显示错误提示
      toast.error('安装失败', {
        description: String(e)
      });
    } finally {
      setIsInstallingDemo(false);
    }
  };

  // 处理技能安装
  const handleInstall = async (skillId: string, version?: string) => {
    try {
      await installSkill(skillId, version);
      toast.success('技能安装成功', {
        description: `${skillId} 已成功安装`
      });
      setShowInstaller(false);
    } catch (error) {
      console.error('Failed to install skill:', error);
      toast.error('技能安装失败', {
        description: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  };

  // 处理技能保存
  const handleSaveSkill = async (skill: Omit<Skill, 'state'>) => {
    try {
      if (editorMode.type === 'create') {
        await createSkill(skill);
        toast.success('技能创建成功', {
          description: `${skill.name} 已成功创建`
        });
      } else if (editorMode.type === 'edit' && selectedSkill) {
        await updateSkill(selectedSkill.id, skill);
        toast.success('技能更新成功', {
          description: `${skill.name} 已成功更新`
        });
      }
      setShowEditor(false);
      setSelectedSkill(undefined);
    } catch (error) {
      console.error('Failed to save skill:', error);
      toast.error('保存失败', {
        description: error instanceof Error ? error.message : String(error)
      });
    }
  };

  // 处理编辑器关闭
  const handleEditorClose = () => {
    setShowEditor(false);
    setSelectedSkill(undefined);
    setEditorMode({ type: 'create' });
  };

  return (
    <div className="flex flex-col h-full bg-[#252526] text-gray-300">
      {/* 空状态提示 */}
      {!isLoading && availableSkills.length === 0 && (
        <div className="flex items-center justify-center h-full p-6">
          <div className="flex flex-col items-center justify-center py-12 border border-dashed border-gray-700 rounded-lg bg-[#1e1e1e] max-w-md">
            <ShieldCheck size={48} className="text-gray-600 mb-4" />
            <p className="text-gray-400 mb-2">未发现可用技能</p>
            <p className="text-xs text-gray-500 mb-6 text-center">
              IfAI 会自动扫描项目根目录下 .ifai/skills 中的技能插件。
              您可以安装内置示例来快速开始体验。
            </p>
            <div className="flex items-center gap-3">
              <button
                onClick={installDemo}
                disabled={isInstallingDemo}
                className={cn(
                  'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all',
                  'bg-blue-600 hover:bg-blue-700 text-white',
                  'disabled:opacity-50 disabled:cursor-not-allowed'
                )}
              >
                {isInstallingDemo ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    安装中...
                  </>
                ) : (
                  <>
                    <Download size={16} />
                    安装示例技能
                  </>
                )}
              </button>
              <button
                onClick={() => setShowInstaller(true)}
                className={cn(
                  'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all',
                  'bg-gray-800 hover:bg-gray-700 text-gray-400 border border-gray-700'
                )}
              >
                <Download size={16} />
                浏览技能库
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 主技能管理界面 */}
      {availableSkills.length > 0 && <SkillsManagement />}

      {/* 技能安装器 */}
      {showInstaller && (
        <SkillInstaller
          onClose={() => setShowInstaller(false)}
          onInstall={handleInstall}
        />
      )}

      {/* 技能编辑器 */}
      {showEditor && (
        <SkillEditor
          mode={editorMode}
          skill={selectedSkill}
          onSave={handleSaveSkill}
          onCancel={handleEditorClose}
        />
      )}
    </div>
  );
};
