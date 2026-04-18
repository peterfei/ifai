import type { TFunction } from 'i18next';
import type { ToolDescriptionResponse } from '../types/tool';

const humanizeToolName = (name: string): string =>
  name
    .replace(/_/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());

const toolCategoryClasses: Record<string, string> = {
  File: 'theme-badge-info',
  Search: 'theme-badge-accent',
  Command: 'theme-badge-warning',
  Network: 'theme-badge-success',
  System: 'theme-panel-muted theme-border theme-text border',
  Other: 'theme-panel theme-border theme-text-muted border',
};

const toolPermissionClasses: Record<string, string> = {
  ReadOnly: 'theme-badge-success',
  WorkspaceWrite: 'theme-badge-info',
  Prompt: 'theme-badge-warning',
  DangerFullAccess: 'theme-badge-danger',
  Allow: 'theme-badge-accent',
};

const getArrayTranslation = (
  t: TFunction,
  key: string,
  fallback: string[]
): string[] => {
  const value = t(key, {
    returnObjects: true,
    defaultValue: fallback,
  });

  return Array.isArray(value) ? value.map((item) => String(item)) : fallback;
};

const getRecordTranslation = (
  t: TFunction,
  key: string,
  fallback: Record<string, string>
): Record<string, string> => {
  const value = t(key, {
    returnObjects: true,
    defaultValue: fallback,
  });

  if (!value || Array.isArray(value) || typeof value !== 'object') {
    return fallback;
  }

  return Object.entries(value as Record<string, unknown>).reduce<Record<string, string>>(
    (result, [entryKey, entryValue]) => {
      result[entryKey] = String(entryValue);
      return result;
    },
    {}
  );
};

export const getLocalizedToolCategoryLabel = (
  category: string,
  t: TFunction
) => t(`toolExplorer.categories.${category}`, { defaultValue: category });

export const getLocalizedToolPermissionLabel = (
  permission: string,
  t: TFunction
) => t(`toolExplorer.permissions.${permission}`, { defaultValue: permission });

export const getLocalizedToolName = (
  tool: ToolDescriptionResponse,
  t: TFunction
) =>
  t(`toolExplorer.tools.${tool.name}.label`, {
    defaultValue: humanizeToolName(tool.name),
  });

export const getLocalizedToolDescription = (
  tool: ToolDescriptionResponse,
  t: TFunction
) =>
  t(`toolExplorer.tools.${tool.name}.description`, {
    defaultValue: tool.description,
  });

export const getLocalizedToolExamples = (
  tool: ToolDescriptionResponse,
  t: TFunction
) =>
  getArrayTranslation(
    t,
    `toolExplorer.tools.${tool.name}.examples`,
    tool.examples
  );

export const getLocalizedToolParameterDescriptions = (
  tool: ToolDescriptionResponse,
  t: TFunction
) => ({
  ...tool.parameter_descriptions,
  ...getRecordTranslation(
    t,
    `toolExplorer.tools.${tool.name}.parameters`,
    tool.parameter_descriptions
  ),
});

const localizeSchemaNode = (
  node: unknown,
  translationKey: string,
  t: TFunction
): unknown => {
  if (!node || typeof node !== 'object') {
    return node;
  }

  if (Array.isArray(node)) {
    return node.map((item, index) =>
      localizeSchemaNode(item, `${translationKey}.${index}`, t)
    );
  }

  const schemaNode = node as Record<string, unknown>;
  const localizedNode: Record<string, unknown> = { ...schemaNode };

  if (typeof schemaNode.description === 'string') {
    localizedNode.description = t(`${translationKey}.description`, {
      defaultValue: schemaNode.description,
    });
  }

  if (schemaNode.properties && typeof schemaNode.properties === 'object') {
    localizedNode.properties = Object.entries(
      schemaNode.properties as Record<string, unknown>
    ).reduce<Record<string, unknown>>((result, [propertyKey, propertyValue]) => {
      result[propertyKey] = localizeSchemaNode(
        propertyValue,
        `${translationKey}.properties.${propertyKey}`,
        t
      );
      return result;
    }, {});
  }

  if (schemaNode.items) {
    localizedNode.items = localizeSchemaNode(
      schemaNode.items,
      `${translationKey}.items`,
      t
    );
  }

  return localizedNode;
};

export const getLocalizedToolInputSchema = (
  tool: ToolDescriptionResponse,
  t: TFunction
) =>
  localizeSchemaNode(
    tool.input_schema,
    `toolExplorer.tools.${tool.name}.schema`,
    t
  );

export const getToolCategoryClass = (category: string): string =>
  toolCategoryClasses[category] || toolCategoryClasses.Other;

export const getToolPermissionClass = (permission: string): string =>
  toolPermissionClasses[permission] || 'theme-panel theme-border theme-text-muted border';

export const getLocalizedToolSearchText = (
  tool: ToolDescriptionResponse,
  t: TFunction
) => {
  const localizedName = getLocalizedToolName(tool, t);
  const localizedDescription = getLocalizedToolDescription(tool, t);
  const localizedCategory = getLocalizedToolCategoryLabel(tool.category, t);
  const localizedPermission = getLocalizedToolPermissionLabel(
    tool.required_permission,
    t
  );
  const localizedExamples = getLocalizedToolExamples(tool, t);
  const localizedParameterDescriptions = getLocalizedToolParameterDescriptions(
    tool,
    t
  );
  const localizedSchema = getLocalizedToolInputSchema(tool, t);

  return [
    tool.name,
    localizedName,
    tool.description,
    localizedDescription,
    tool.category,
    localizedCategory,
    tool.required_permission,
    localizedPermission,
    ...tool.examples,
    ...localizedExamples,
    ...Object.values(tool.parameter_descriptions),
    ...Object.values(localizedParameterDescriptions),
    JSON.stringify(localizedSchema),
  ]
    .join(' ')
    .toLowerCase();
};
