/**
 * 技能编辑器
 * Phase 7: 完整 UI 重构
 */

import React, { useState } from 'react';
import {
  X,
  Save,
  Eye,
  Code,
  FileText,
  Plus,
  Trash2,
  Check,
  AlertCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Skill, SkillEditorMode, SkillValidationError } from './types';

interface SkillEditorProps {
  mode: SkillEditorMode;
  skill?: Skill;
  onSave: (skill: Omit<Skill, 'state'>) => Promise<void>;
  onCancel: () => void;
  className?: string;
}

export const SkillEditor: React.FC<SkillEditorProps> = ({
  mode,
  skill,
  onSave,
  onCancel,
  className,
}) => {
  const [formData, setFormData] = useState<Partial<Skill>>(
    skill || {
      id: '',
      name: '',
      description: '',
      system_prompt: '',
      version: '1.0.0',
      author: '',
      tags: [],
      dependencies: [],
      compatibility: '',
    }
  );

  const [errors, setErrors] = useState<SkillValidationError[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [newTag, setNewTag] = useState('');
  const [newDependency, setNewDependency] = useState('');

  const validateForm = (): boolean => {
    const validationErrors: SkillValidationError[] = [];

    if (!formData.id?.trim()) {
      validationErrors.push({ field: 'id', message: '技能 ID 不能为空' });
    }

    if (!formData.name?.trim()) {
      validationErrors.push({ field: 'name', message: '技能名称不能为空' });
    }

    if (!formData.description?.trim()) {
      validationErrors.push({ field: 'description', message: '技能描述不能为空' });
    }

    if (!formData.system_prompt?.trim()) {
      validationErrors.push({ field: 'system_prompt', message: '系统提示词不能为空' });
    }

    if (!formData.version?.trim()) {
      validationErrors.push({ field: 'version', message: '版本号不能为空' });
    }

    setErrors(validationErrors);
    return validationErrors.length === 0;
  };

  const handleSave = async () => {
    if (!validateForm()) return;

    setIsSaving(true);
    try {
      await onSave(formData as Omit<Skill, 'state'>);
    } catch (error) {
      setErrors([
        { field: 'system_prompt', message: String(error) },
      ]);
    } finally {
      setIsSaving(false);
    }
  };

  const addTag = () => {
    if (newTag && !formData.tags?.includes(newTag)) {
      setFormData({
        ...formData,
        tags: [...(formData.tags || []), newTag],
      });
      setNewTag('');
    }
  };

  const removeTag = (tag: string) => {
    setFormData({
      ...formData,
      tags: formData.tags?.filter(t => t !== tag) || [],
    });
  };

  const addDependency = () => {
    if (newDependency && !formData.dependencies?.includes(newDependency)) {
      setFormData({
        ...formData,
        dependencies: [...(formData.dependencies || []), newDependency],
      });
      setNewDependency('');
    }
  };

  const removeDependency = (dep: string) => {
    setFormData({
      ...formData,
      dependencies: formData.dependencies?.filter(d => d !== dep) || [],
    });
  };

  const getFieldError = (field: keyof Skill) => {
    return errors.find(e => e.field === field)?.message;
  };

  return (
    <div className={cn('fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4', className)}>
      <div className="bg-gray-900 rounded-lg border border-gray-700 w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* 头部 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
          <div>
            <h2 className="text-xl font-bold text-white">
              {mode.type === 'create' ? '创建技能' : mode.type === 'edit' ? '编辑技能' : '查看技能'}
            </h2>
            <p className="text-sm text-gray-500 mt-1">
              {mode.type === 'create' && '创建新的 AI 技能插件'}
              {mode.type === 'edit' && `编辑技能: ${skill?.name}`}
              {mode.type === 'view' && '查看技能详情'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {mode.type !== 'view' && (
              <button
                onClick={() => setShowPreview(!showPreview)}
                className={cn(
                  'flex items-center gap-2 px-4 py-2 rounded-lg text-sm transition-all',
                  showPreview
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-800 hover:bg-gray-700 text-gray-400'
                )}
              >
                <Eye size={16} />
                {showPreview ? '编辑' : '预览'}
              </button>
            )}
            <button
              onClick={onCancel}
              className="p-2 hover:bg-gray-800 rounded-lg transition-colors"
            >
              <X size={20} className="text-gray-400" />
            </button>
          </div>
        </div>

        {/* 内容 */}
        <div className="flex-1 overflow-y-auto p-6">
          {showPreview ? (
            <PreviewMode skill={formData as Skill} />
          ) : (
            <EditMode
              formData={formData}
              setFormData={setFormData}
              mode={mode}
              errors={errors}
              getFieldError={getFieldError}
              newTag={newTag}
              setNewTag={setNewTag}
              addTag={addTag}
              removeTag={removeTag}
              newDependency={newDependency}
              setNewDependency={setNewDependency}
              addDependency={addDependency}
              removeDependency={removeDependency}
            />
          )}
        </div>

        {/* 底部操作栏 */}
        {mode.type !== 'view' && (
          <div className="flex items-center justify-between px-6 py-4 border-t border-gray-800 bg-gray-950">
            <div className="flex items-center gap-2 text-sm text-gray-500">
              {errors.length > 0 && (
                <>
                  <AlertCircle size={16} className="text-red-500" />
                  <span>请修正 {errors.length} 个错误</span>
                </>
              )}
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={onCancel}
                className="px-6 py-2.5 rounded-lg text-sm font-medium bg-gray-800 hover:bg-gray-700 text-gray-400 border border-gray-700 transition-all"
              >
                取消
              </button>
              <button
                onClick={handleSave}
                disabled={isSaving}
                className={cn(
                  'flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-medium transition-all',
                  'bg-blue-600 hover:bg-blue-700 text-white',
                  'disabled:opacity-50 disabled:cursor-not-allowed'
                )}
              >
                {isSaving ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    保存中...
                  </>
                ) : (
                  <>
                    <Save size={16} />
                    保存
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// ==================== 编辑模式 ====================

interface EditModeProps {
  formData: Partial<Skill>;
  setFormData: (data: Partial<Skill>) => void;
  mode: SkillEditorMode;
  errors: SkillValidationError[];
  getFieldError: (field: keyof Skill) => string | undefined;
  newTag: string;
  setNewTag: (tag: string) => void;
  addTag: () => void;
  removeTag: (tag: string) => void;
  newDependency: string;
  setNewDependency: (dep: string) => void;
  addDependency: () => void;
  removeDependency: (dep: string) => void;
}

const EditMode: React.FC<EditModeProps> = ({
  formData,
  setFormData,
  mode,
  errors,
  getFieldError,
  newTag,
  setNewTag,
  addTag,
  removeTag,
  newDependency,
  setNewDependency,
  addDependency,
  removeDependency,
}) => {
  const disabled = mode.type === 'view';

  return (
    <div className="space-y-6">
      {/* 基本信息 */}
      <div className="space-y-4">
        <h3 className="text-sm font-medium text-gray-400">基本信息</h3>
        <div className="grid grid-cols-2 gap-4">
          <FormField
            label="技能 ID"
            value={formData.id}
            onChange={(v) => setFormData({ ...formData, id: v })}
            disabled={disabled}
            error={getFieldError('id')}
            placeholder="my-skill"
            description="唯一标识符，只能包含小写字母、数字和连字符"
          />
          <FormField
            label="技能名称"
            value={formData.name}
            onChange={(v) => setFormData({ ...formData, name: v })}
            disabled={disabled}
            error={getFieldError('name')}
            placeholder="我的技能"
          />
        </div>
        <FormField
          label="描述"
          value={formData.description}
          onChange={(v) => setFormData({ ...formData, description: v })}
          disabled={disabled}
          error={getFieldError('description')}
          placeholder="简要描述这个技能的功能"
          textarea
        />
      </div>

      {/* 系统提示词 */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium text-gray-400">系统提示词</h3>
          <span className="text-xs text-gray-500">
            {formData.system_prompt?.length || 0} / 10000 字符
          </span>
        </div>
        <FormField
          value={formData.system_prompt}
          onChange={(v) => setFormData({ ...formData, system_prompt: v })}
          disabled={disabled}
          error={getFieldError('system_prompt')}
          placeholder="You are a helpful assistant..."
          textarea
          rows={8}
          monospace
        />
      </div>

      {/* 版本和作者 */}
      <div className="grid grid-cols-2 gap-4">
        <FormField
          label="版本"
          value={formData.version}
          onChange={(v) => setFormData({ ...formData, version: v })}
          disabled={disabled}
          error={getFieldError('version')}
          placeholder="1.0.0"
          description="遵循语义化版本规范 (semver)"
        />
        <FormField
          label="作者"
          value={formData.author || ''}
          onChange={(v) => setFormData({ ...formData, author: v })}
          disabled={disabled}
          placeholder="Your Name"
        />
      </div>

      {/* 标签 */}
      <div className="space-y-3">
        <h3 className="text-sm font-medium text-gray-400">标签</h3>
        <div className="flex flex-wrap gap-2">
          {formData.tags?.map(tag => (
            <span
              key={tag}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-gray-800 text-sm text-gray-300 border border-gray-700"
            >
              {tag}
              {!disabled && (
                <button
                  onClick={() => removeTag(tag)}
                  className="hover:text-red-400 transition-colors"
                >
                  <X size={12} />
                </button>
              )}
            </span>
          ))}
        </div>
        {!disabled && (
          <div className="flex gap-2">
            <input
              type="text"
              value={newTag}
              onChange={(e) => setNewTag(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && addTag()}
              placeholder="添加标签..."
              className="flex-1 px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
            />
            <button
              onClick={addTag}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm"
            >
              <Plus size={16} />
            </button>
          </div>
        )}
      </div>

      {/* 依赖 */}
      <div className="space-y-3">
        <h3 className="text-sm font-medium text-gray-400">依赖技能</h3>
        <div className="space-y-2">
          {formData.dependencies?.map(dep => (
            <div
              key={dep}
              className="flex items-center justify-between p-3 bg-gray-950 rounded-lg border border-gray-800"
            >
              <span className="text-sm text-gray-300">{dep}</span>
              {!disabled && (
                <button
                  onClick={() => removeDependency(dep)}
                  className="text-gray-500 hover:text-red-400 transition-colors"
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          ))}
        </div>
        {!disabled && (
          <div className="flex gap-2">
            <input
              type="text"
              value={newDependency}
              onChange={(e) => setNewDependency(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && addDependency()}
              placeholder="添加依赖技能 ID..."
              className="flex-1 px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
            />
            <button
              onClick={addDependency}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm"
            >
              <Plus size={16} />
            </button>
          </div>
        )}
      </div>

      {/* 兼容性 */}
      <FormField
        label="兼容性表达式"
        value={formData.compatibility || ''}
        onChange={(v) => setFormData({ ...formData, compatibility: v })}
        disabled={disabled}
        placeholder="^1.0.0 || >=2.0.0"
        description="使用 semver 表达式指定兼容版本"
      />
    </div>
  );
};

// ==================== 预览模式 ====================

const PreviewMode: React.FC<{ skill: Partial<Skill> }> = ({ skill }) => {
  return (
    <div className="space-y-6">
      <div className="p-4 bg-gray-950 rounded-lg border border-gray-800">
        <h3 className="text-lg font-bold text-white mb-2">{skill.name}</h3>
        <p className="text-sm text-gray-400 mb-4">{skill.description}</p>
        <div className="flex items-center gap-3 text-xs text-gray-500">
          <span>ID: {skill.id}</span>
          <span>•</span>
          <span>版本: {skill.version}</span>
          {skill.author && (
            <>
              <span>•</span>
              <span>作者: {skill.author}</span>
            </>
          )}
        </div>
      </div>

      <div className="p-4 bg-gray-950 rounded-lg border border-gray-800">
        <h4 className="text-sm font-medium text-gray-400 mb-2">系统提示词</h4>
        <pre className="text-sm text-gray-300 whitespace-pre-wrap font-mono">
          {skill.system_prompt}
        </pre>
      </div>

      {(skill.tags?.length || 0) > 0 && (
        <div>
          <h4 className="text-sm font-medium text-gray-400 mb-2">标签</h4>
          <div className="flex flex-wrap gap-2">
            {skill.tags?.map(tag => (
              <span
                key={tag}
                className="px-3 py-1.5 rounded-full bg-gray-800 text-sm text-gray-300 border border-gray-700"
              >
                {tag}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// ==================== 表单字段组件 ====================

interface FormFieldProps {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  error?: string;
  placeholder?: string;
  description?: string;
  textarea?: boolean;
  rows?: number;
  monospace?: boolean;
}

const FormField: React.FC<FormFieldProps> = ({
  label,
  value,
  onChange,
  disabled,
  error,
  placeholder,
  description,
  textarea,
  rows = 3,
  monospace,
}) => {
  return (
    <div className="space-y-1.5">
      {label && (
        <label className="block text-sm font-medium text-gray-400">
          {label}
        </label>
      )}
      <div>
        {textarea ? (
          <textarea
            value={value}
            onChange={(e) => onChange(e.target.value)}
            disabled={disabled}
            placeholder={placeholder}
            rows={rows}
            className={cn(
              'w-full px-3 py-2 bg-gray-900 border rounded-lg text-sm placeholder-gray-500 focus:outline-none transition-all',
              monospace ? 'font-mono' : 'font-sans',
              error
                ? 'border-red-500 focus:border-red-500'
                : 'border-gray-700 focus:border-blue-500',
              disabled && 'opacity-50 cursor-not-allowed'
            )}
          />
        ) : (
          <input
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            disabled={disabled}
            placeholder={placeholder}
            className={cn(
              'w-full px-3 py-2 bg-gray-900 border rounded-lg text-sm placeholder-gray-500 focus:outline-none transition-all',
              monospace ? 'font-mono' : 'font-sans',
              error
                ? 'border-red-500 focus:border-red-500'
                : 'border-gray-700 focus:border-blue-500',
              disabled && 'opacity-50 cursor-not-allowed'
            )}
          />
        )}
      </div>
      {error && (
        <p className="text-xs text-red-400">{error}</p>
      )}
      {description && !error && (
        <p className="text-xs text-gray-500">{description}</p>
      )}
    </div>
  );
};
