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
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation();
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
      validationErrors.push({ field: 'id', message: t('settings.skillEditor.validation.id') });
    }

    if (!formData.name?.trim()) {
      validationErrors.push({ field: 'name', message: t('settings.skillEditor.validation.name') });
    }

    if (!formData.description?.trim()) {
      validationErrors.push({ field: 'description', message: t('settings.skillEditor.validation.description') });
    }

    if (!formData.system_prompt?.trim()) {
      validationErrors.push({ field: 'system_prompt', message: t('settings.skillEditor.validation.systemPrompt') });
    }

    if (!formData.version?.trim()) {
      validationErrors.push({ field: 'version', message: t('settings.skillEditor.validation.version') });
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
              {mode.type === 'create' ? t('settings.skillEditor.createTitle') : mode.type === 'edit' ? t('settings.skillEditor.editTitle') : t('settings.skillEditor.viewTitle')}
            </h2>
            <p className="text-sm text-gray-500 mt-1">
              {mode.type === 'create' && t('settings.skillEditor.createSubtitle')}
              {mode.type === 'edit' && t('settings.skillEditor.editSubtitle', { name: skill?.name })}
              {mode.type === 'view' && t('settings.skillEditor.viewSubtitle')}
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
                {showPreview ? t('settings.skillEditor.editTab') : t('settings.skillEditor.previewTab')}
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
              t={t}
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
                  <span>{t('settings.skillEditor.errorsSummary', { count: errors.length })}</span>
                </>
              )}
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={onCancel}
                className="px-6 py-2.5 rounded-lg text-sm font-medium bg-gray-800 hover:bg-gray-700 text-gray-400 border border-gray-700 transition-all"
              >
                {t('settings.skillEditor.cancel')}
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
                    {t('settings.skillEditor.saving')}
                  </>
                ) : (
                  <>
                    <Save size={16} />
                    {t('settings.skillEditor.save')}
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
  t: (key: string) => string;
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
  t,
}) => {
  const disabled = mode.type === 'view';

  return (
    <div className="space-y-6">
      {/* 基本信息 */}
      <div className="space-y-4">
        <h3 className="text-sm font-medium text-gray-400">{t('settings.skillEditor.sections.basic')}</h3>
        <div className="grid grid-cols-2 gap-4">
          <FormField
            label={t('settings.skillEditor.fields.id')}
            value={formData.id}
            onChange={(v) => setFormData({ ...formData, id: v })}
            disabled={disabled}
            error={getFieldError('id')}
            placeholder={t('settings.skillEditor.placeholders.id')}
            description={t('settings.skillEditor.fields.idHint')}
          />
          <FormField
            label={t('settings.skillEditor.fields.name')}
            value={formData.name}
            onChange={(v) => setFormData({ ...formData, name: v })}
            disabled={disabled}
            error={getFieldError('name')}
            placeholder={t('settings.skillEditor.placeholders.name')}
          />
        </div>
        <FormField
          label={t('settings.skillEditor.fields.description')}
          value={formData.description}
          onChange={(v) => setFormData({ ...formData, description: v })}
          disabled={disabled}
          error={getFieldError('description')}
          placeholder={t('settings.skillEditor.placeholders.description')}
          textarea
        />
      </div>

      {/* 系统提示词 */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium text-gray-400">{t('settings.skillEditor.fields.systemPrompt')}</h3>
          <span className="text-xs text-gray-500">
            {t('settings.skillEditor.characterCount', { count: formData.system_prompt?.length || 0 })}
          </span>
        </div>
        <FormField
          value={formData.system_prompt}
          onChange={(v) => setFormData({ ...formData, system_prompt: v })}
          disabled={disabled}
          error={getFieldError('system_prompt')}
          placeholder={t('settings.skillEditor.placeholders.systemPrompt')}
          textarea
          rows={8}
          monospace
        />
      </div>

      {/* 版本和作者 */}
      <div className="grid grid-cols-2 gap-4">
        <FormField
          label={t('settings.skillEditor.fields.version')}
          value={formData.version}
          onChange={(v) => setFormData({ ...formData, version: v })}
          disabled={disabled}
          error={getFieldError('version')}
          placeholder={t('settings.skillEditor.placeholders.version')}
          description={t('settings.skillEditor.fields.versionHint')}
        />
        <FormField
          label={t('settings.skillEditor.fields.author')}
          value={formData.author || ''}
          onChange={(v) => setFormData({ ...formData, author: v })}
          disabled={disabled}
          placeholder={t('settings.skillEditor.placeholders.author')}
        />
      </div>

      {/* 标签 */}
      <div className="space-y-3">
        <h3 className="text-sm font-medium text-gray-400">{t('settings.skillEditor.fields.tags')}</h3>
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
              placeholder={t('settings.skillEditor.placeholders.tagsPlaceholder')}
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
        <h3 className="text-sm font-medium text-gray-400">{t('settings.skillEditor.fields.dependencies')}</h3>
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
              placeholder={t('settings.skillEditor.placeholders.dependenciesPlaceholder')}
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
        label={t('settings.skillEditor.fields.compatibility')}
        value={formData.compatibility || ''}
        onChange={(v) => setFormData({ ...formData, compatibility: v })}
        disabled={disabled}
        placeholder={t('settings.skillEditor.placeholders.compatibility')}
        description={t('settings.skillEditor.fields.compatibilityHint')}
      />
    </div>
  );
};

// ==================== 预览模式 ====================

const PreviewMode: React.FC<{ skill: Partial<Skill> }> = ({ skill }) => {
  const { t } = useTranslation();

  return (
    <div className="space-y-6">
      <div className="p-4 bg-gray-950 rounded-lg border border-gray-800">
        <h3 className="text-lg font-bold text-white mb-2">{skill.name || t('settings.skillEditor.previewFallbackName')}</h3>
        <p className="text-sm text-gray-400 mb-4">{skill.description || t('settings.skillEditor.previewFallbackDescription')}</p>
        <div className="flex items-center gap-3 text-xs text-gray-500">
          <span>ID: {skill.id}</span>
          <span>•</span>
          <span>{t('settings.skillEditor.previewVersion', { version: skill.version })}</span>
          {skill.author && (
            <>
              <span>•</span>
              <span>{t('settings.skillEditor.previewAuthor', { author: skill.author })}</span>
            </>
          )}
        </div>
      </div>

      <div className="p-4 bg-gray-950 rounded-lg border border-gray-800">
        <h4 className="text-sm font-medium text-gray-400 mb-2">{t('settings.skillEditor.fields.systemPrompt')}</h4>
        <pre className="text-sm text-gray-300 whitespace-pre-wrap font-mono">
          {skill.system_prompt}
        </pre>
      </div>

      {(skill.tags?.length || 0) > 0 && (
        <div>
          <h4 className="text-sm font-medium text-gray-400 mb-2">{t('settings.skillEditor.fields.tags')}</h4>
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
