import React, { useMemo, useState } from 'react';
import { AlertCircle, Eye, Plus, Save, Trash2, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import type { Skill, SkillEditorMode, SkillValidationError } from './types';

interface SkillEditorProps {
  mode: SkillEditorMode;
  skill?: Skill;
  onSave: (skill: Omit<Skill, 'state'>) => Promise<void>;
  onCancel: () => void;
  className?: string;
}

type EditableSkill = Omit<Skill, 'state'>;

const createInitialState = (skill?: Skill): EditableSkill => ({
  id: skill?.id ?? '',
  name: skill?.name ?? '',
  description: skill?.description ?? '',
  system_prompt: skill?.system_prompt ?? '',
  version: skill?.version ?? '1.0.0',
  author: skill?.author ?? '',
  tags: skill?.tags ?? [],
  dependencies: skill?.dependencies ?? [],
  compatibility: skill?.compatibility ?? '',
});

export const SkillEditor: React.FC<SkillEditorProps> = ({
  mode,
  skill,
  onSave,
  onCancel,
  className,
}) => {
  const { t } = useTranslation();
  const isViewMode = mode.type === 'view';
  const [formData, setFormData] = useState<EditableSkill>(createInitialState(skill));
  const [errors, setErrors] = useState<SkillValidationError[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [newTag, setNewTag] = useState('');
  const [newDependency, setNewDependency] = useState('');

  const heading = useMemo(() => {
    if (mode.type === 'create') {
      return {
        title: t('skillEditor.createTitle'),
        subtitle: t('skillEditor.createSubtitle'),
      };
    }
    if (mode.type === 'edit') {
      return {
        title: t('skillEditor.editTitle'),
        subtitle: t('skillEditor.editSubtitle', { name: skill?.name ?? '' }),
      };
    }
    return {
      title: t('skillEditor.viewTitle'),
      subtitle: t('skillEditor.viewSubtitle'),
    };
  }, [mode.type, skill?.name, t]);

  const validate = () => {
    const validationErrors: SkillValidationError[] = [];

    if (!formData.id.trim()) {
      validationErrors.push({ field: 'id', message: t('skillEditor.validation.id') });
    }
    if (!formData.name.trim()) {
      validationErrors.push({ field: 'name', message: t('skillEditor.validation.name') });
    }
    if (!formData.description.trim()) {
      validationErrors.push({
        field: 'description',
        message: t('skillEditor.validation.description'),
      });
    }
    if (!formData.system_prompt.trim()) {
      validationErrors.push({
        field: 'system_prompt',
        message: t('skillEditor.validation.systemPrompt'),
      });
    }
    if (!formData.version.trim()) {
      validationErrors.push({ field: 'version', message: t('skillEditor.validation.version') });
    }

    setErrors(validationErrors);
    return validationErrors.length === 0;
  };

  const getFieldError = (field: keyof EditableSkill) => {
    return errors.find(error => error.field === field)?.message;
  };

  const handleSave = async () => {
    if (!validate()) {
      return;
    }

    setIsSaving(true);
    try {
      await onSave(formData);
    } catch (error) {
      setErrors([
        {
          field: 'system_prompt',
          message: error instanceof Error ? error.message : String(error),
        },
      ]);
    } finally {
      setIsSaving(false);
    }
  };

  const addTag = () => {
    const value = newTag.trim();
    if (!value || formData.tags.includes(value)) {
      return;
    }
    setFormData(current => ({ ...current, tags: [...current.tags, value] }));
    setNewTag('');
  };

  const removeTag = (tag: string) => {
    setFormData(current => ({
      ...current,
      tags: current.tags.filter(item => item !== tag),
    }));
  };

  const addDependency = () => {
    const value = newDependency.trim();
    if (!value || formData.dependencies.includes(value)) {
      return;
    }
    setFormData(current => ({
      ...current,
      dependencies: [...current.dependencies, value],
    }));
    setNewDependency('');
  };

  const removeDependency = (dependency: string) => {
    setFormData(current => ({
      ...current,
      dependencies: current.dependencies.filter(item => item !== dependency),
    }));
  };

  return (
    <div className={cn('theme-backdrop fixed inset-0 z-50 flex items-center justify-center p-4', className)}>
      <div className="theme-panel-elevated theme-border theme-shadow flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-xl border">
        <div className="theme-panel-muted theme-border flex items-center justify-between border-b px-6 py-4">
          <div>
            <h2 className="theme-text text-lg font-semibold">{heading.title}</h2>
            <p className="theme-text-subtle mt-1 text-sm">{heading.subtitle}</p>
          </div>

          <div className="flex items-center gap-2">
            {!isViewMode && (
              <button
                type="button"
                onClick={() => setShowPreview(current => !current)}
                className={cn(
                  'theme-focus-ring-accent inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium',
                  showPreview ? 'theme-button-primary' : 'theme-button-secondary'
                )}
              >
                <Eye size={14} />
                {showPreview ? t('skillEditor.editTab') : t('skillEditor.previewTab')}
              </button>
            )}
            <button
              type="button"
              onClick={onCancel}
              className="theme-button-ghost theme-focus-ring-accent rounded-md p-2"
              title={t('skillEditor.close')}
              aria-label={t('skillEditor.close')}
            >
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {showPreview ? (
            <PreviewPanel skill={formData} />
          ) : (
            <div className="space-y-6">
              <section className="space-y-4">
                <h3 className="theme-text-muted text-xs font-semibold uppercase tracking-[0.1em]">
                  {t('skillEditor.sections.basic')}
                </h3>
                <div className="grid gap-4 md:grid-cols-2">
                  <FormField
                    label={t('skillEditor.fields.id')}
                    value={formData.id}
                    onChange={value => setFormData(current => ({ ...current, id: value }))}
                    disabled={isViewMode}
                  error={getFieldError('id')}
                    placeholder={t('skillEditor.placeholders.id')}
                    description={t('skillEditor.fields.idHint')}
                  />
                  <FormField
                    label={t('skillEditor.fields.name')}
                    value={formData.name}
                    onChange={value => setFormData(current => ({ ...current, name: value }))}
                    disabled={isViewMode}
                  error={getFieldError('name')}
                    placeholder={t('skillEditor.placeholders.name')}
                  />
                </div>
                <FormField
                  label={t('skillEditor.fields.description')}
                  value={formData.description}
                  onChange={value =>
                    setFormData(current => ({ ...current, description: value }))
                  }
                  disabled={isViewMode}
                  error={getFieldError('description')}
                  placeholder={t('skillEditor.placeholders.description')}
                  textarea
                  rows={4}
                />
              </section>

              <section className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="theme-text-muted text-xs font-semibold uppercase tracking-[0.1em]">
                    {t('skillEditor.fields.systemPrompt')}
                  </h3>
                  <span className="theme-text-subtle text-xs">
                    {t('skillEditor.characterCount', { count: formData.system_prompt.length })}
                  </span>
                </div>
                <FormField
                  value={formData.system_prompt}
                  onChange={value =>
                    setFormData(current => ({ ...current, system_prompt: value }))
                  }
                  disabled={isViewMode}
                  error={getFieldError('system_prompt')}
                  placeholder={t('skillEditor.placeholders.systemPrompt')}
                  textarea
                  rows={10}
                  monospace
                />
              </section>

              <section className="grid gap-4 md:grid-cols-2">
                <FormField
                  label={t('skillEditor.fields.version')}
                  value={formData.version}
                  onChange={value =>
                    setFormData(current => ({ ...current, version: value }))
                  }
                  disabled={isViewMode}
                  error={getFieldError('version')}
                  placeholder={t('skillEditor.placeholders.version')}
                  description={t('skillEditor.fields.versionHint')}
                />
                <FormField
                  label={t('skillEditor.fields.author')}
                  value={formData.author || ''}
                  onChange={value =>
                    setFormData(current => ({ ...current, author: value }))
                  }
                  disabled={isViewMode}
                  placeholder={t('skillEditor.placeholders.author')}
                />
              </section>

              <TagSection
                label={t('skillEditor.fields.tags')}
                values={formData.tags}
                newValue={newTag}
                onNewValueChange={setNewTag}
                onAdd={addTag}
                onRemove={removeTag}
                inputPlaceholder={t('skillEditor.fields.tagsPlaceholder')}
                disabled={isViewMode}
              />

              <TagSection
                label={t('skillEditor.fields.dependencies')}
                values={formData.dependencies}
                newValue={newDependency}
                onNewValueChange={setNewDependency}
                onAdd={addDependency}
                onRemove={removeDependency}
                inputPlaceholder={t('skillEditor.fields.dependenciesPlaceholder')}
                disabled={isViewMode}
                monospace
              />

              <FormField
                label={t('skillEditor.fields.compatibility')}
                value={formData.compatibility || ''}
                onChange={value =>
                  setFormData(current => ({ ...current, compatibility: value }))
                }
                disabled={isViewMode}
                placeholder={t('skillEditor.placeholders.compatibility')}
                description={t('skillEditor.fields.compatibilityHint')}
              />
            </div>
          )}
        </div>

        {!isViewMode && (
          <div className="theme-panel-muted theme-border flex items-center justify-between border-t px-6 py-4">
            <div className="theme-text-subtle flex items-center gap-2 text-sm">
              {errors.length > 0 && (
                <>
                  <AlertCircle size={16} className="theme-text-danger" />
                  <span>{t('skillEditor.errorsSummary', { count: errors.length })}</span>
                </>
              )}
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={onCancel}
                className="theme-button-secondary theme-focus-ring-accent rounded-md px-4 py-2 text-sm font-medium"
              >
                {t('skillEditor.cancel')}
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={isSaving}
                className="theme-button-primary theme-focus-ring-accent inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium disabled:opacity-50"
              >
                {isSaving ? (
                  <>
                    <Save size={14} className="animate-pulse" />
                    {t('skillEditor.saving')}
                  </>
                ) : (
                  <>
                    <Save size={14} />
                    {t('skillEditor.save')}
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

const PreviewPanel: React.FC<{ skill: EditableSkill }> = ({ skill }) => {
  const { t } = useTranslation();

  return (
    <div className="space-y-5">
      <section className="theme-panel-muted theme-border rounded-lg border p-4">
        <h3 className="theme-text text-lg font-semibold">{skill.name || t('skillEditor.previewFallbackName')}</h3>
        <p className="theme-text-subtle mt-2 text-sm leading-relaxed">
          {skill.description || t('skillEditor.previewFallbackDescription')}
        </p>
        <div className="theme-text-subtle mt-3 flex flex-wrap items-center gap-3 text-xs">
          <span>ID: {skill.id || '-'}</span>
          <span>•</span>
          <span>{t('skillEditor.previewVersion', { version: skill.version || '-' })}</span>
          {skill.author && (
            <>
              <span>•</span>
              <span>{t('skillEditor.previewAuthor', { author: skill.author })}</span>
            </>
          )}
        </div>
      </section>

      <section className="space-y-3">
        <h4 className="theme-text-muted text-xs font-semibold uppercase tracking-[0.1em]">
          {t('skillEditor.fields.systemPrompt')}
        </h4>
        <div className="theme-code-surface theme-border overflow-auto rounded-lg border p-4">
          <pre className="theme-text-muted whitespace-pre-wrap text-xs leading-relaxed">
            {skill.system_prompt}
          </pre>
        </div>
      </section>

      {skill.tags.length > 0 && (
        <section className="space-y-3">
          <h4 className="theme-text-muted text-xs font-semibold uppercase tracking-[0.1em]">
            {t('skillEditor.fields.tags')}
          </h4>
          <div className="flex flex-wrap gap-2">
            {skill.tags.map(tag => (
              <span
                key={tag}
                className="theme-panel-muted theme-border theme-text-subtle rounded-full border px-2.5 py-1 text-xs"
              >
                {tag}
              </span>
            ))}
          </div>
        </section>
      )}
    </div>
  );
};

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
  monospace = false,
}) => {
  const baseClassName = cn(
    'theme-input-surface theme-border theme-text theme-focus-accent w-full rounded-md border px-3 py-2 text-sm',
    monospace && 'font-mono',
    error && 'theme-border-danger',
    disabled && 'cursor-not-allowed opacity-50'
  );

  return (
    <div className="space-y-1.5">
      {label && <label className="theme-text-muted block text-sm font-medium">{label}</label>}
      {textarea ? (
        <textarea
          value={value}
          onChange={event => onChange(event.target.value)}
          disabled={disabled}
          placeholder={placeholder}
          rows={rows}
          className={cn(baseClassName, 'resize-y')}
        />
      ) : (
        <input
          type="text"
          value={value}
          onChange={event => onChange(event.target.value)}
          disabled={disabled}
          placeholder={placeholder}
          className={baseClassName}
        />
      )}
      {error ? (
        <p className="theme-text-danger text-xs">{error}</p>
      ) : description ? (
        <p className="theme-text-subtle text-xs">{description}</p>
      ) : null}
    </div>
  );
};

interface TagSectionProps {
  label: string;
  values: string[];
  newValue: string;
  onNewValueChange: (value: string) => void;
  onAdd: () => void;
  onRemove: (value: string) => void;
  inputPlaceholder: string;
  disabled: boolean;
  monospace?: boolean;
}

const TagSection: React.FC<TagSectionProps> = ({
  label,
  values,
  newValue,
  onNewValueChange,
  onAdd,
  onRemove,
  inputPlaceholder,
  disabled,
  monospace = false,
}) => {
  const { t } = useTranslation();

  return (
    <section className="space-y-3">
      <h3 className="theme-text-muted text-xs font-semibold uppercase tracking-[0.1em]">
        {label}
      </h3>
      <div className="flex flex-wrap gap-2">
        {values.map(value => (
          <span
            key={value}
            className="theme-panel-muted theme-border theme-text rounded-full border px-3 py-1 text-xs"
          >
            <span className={cn(monospace && 'font-mono')}>{value}</span>
            {!disabled && (
              <button
                type="button"
                onClick={() => onRemove(value)}
                className="theme-button-ghost ml-2 rounded-full p-0.5"
                aria-label={t('skillEditor.removeItem')}
              >
                <Trash2 size={10} />
              </button>
            )}
          </span>
        ))}
      </div>
      {!disabled && (
        <div className="flex gap-2">
          <input
            type="text"
            value={newValue}
            onChange={event => onNewValueChange(event.target.value)}
            onKeyDown={event => {
              if (event.key === 'Enter') {
                event.preventDefault();
                onAdd();
              }
            }}
            placeholder={inputPlaceholder}
            className={cn(
              'theme-input-surface theme-border theme-text theme-focus-accent flex-1 rounded-md border px-3 py-2 text-sm',
              monospace && 'font-mono'
            )}
          />
          <button
            type="button"
            onClick={onAdd}
            className="theme-button-secondary theme-focus-ring-accent inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium"
          >
            <Plus size={14} />
            {t('skillEditor.add')}
          </button>
        </div>
      )}
    </section>
  );
};
