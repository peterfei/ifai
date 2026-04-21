import type { TFunction } from 'i18next';

export type BuiltinSkillCategory = 'development' | 'testing' | 'documentation' | 'pivo';

export type BuiltinSkillId =
  | 'code-review-pro'
  | 'test-generator-ai'
  | 'api-doc-writer'
  | 'bug-hunter'
  | 'pivo-healer'
  | 'pivo-implementer'
  | 'pivo-verifier'
  | 'code-refactor'
  | 'performance-optimizer'
  | 'security-auditor'
  | 'tech-writer'
  | 'docker-expert';

export interface BuiltinSkill {
  id: BuiltinSkillId;
  name: string;
  displayName: string;
  description: string;
  longDescription: string;
  version: string;
  author: string;
  category: BuiltinSkillCategory;
  tags: string[];
  systemPrompt: string;
  dependencies: string[];
  size: string;
  downloads: number;
  rating: number;
  featured: boolean;
  examples: string[];
  requirements?: string[];
}

interface BuiltinSkillDefinition {
  id: BuiltinSkillId;
  version: string;
  category: BuiltinSkillCategory;
  tagKeys: string[];
  dependencies: string[];
  size: string;
  downloads: number;
  rating: number;
  featured: boolean;
}

const builtinSkillDefinitions: BuiltinSkillDefinition[] = [
  {
    id: 'code-review-pro',
    version: '2.0.0',
    category: 'development',
    tagKeys: ['codeReview', 'quality', 'security', 'performance'],
    dependencies: [],
    size: '2.3 KB',
    downloads: 15234,
    rating: 4.8,
    featured: true,
  },
  {
    id: 'test-generator-ai',
    version: '3.1.0',
    category: 'testing',
    tagKeys: ['testing', 'automation', 'quality', 'ciCd'],
    dependencies: [],
    size: '3.1 KB',
    downloads: 12456,
    rating: 4.7,
    featured: true,
  },
  {
    id: 'api-doc-writer',
    version: '1.5.0',
    category: 'documentation',
    tagKeys: ['documentation', 'api', 'openapi', 'swagger'],
    dependencies: [],
    size: '1.8 KB',
    downloads: 8934,
    rating: 4.6,
    featured: false,
  },
  {
    id: 'bug-hunter',
    version: '2.2.0',
    category: 'development',
    tagKeys: ['debugging', 'troubleshooting', 'errorFixing'],
    dependencies: [],
    size: '2.0 KB',
    downloads: 11345,
    rating: 4.7,
    featured: true,
  },
  {
    id: 'pivo-healer',
    version: '1.4.0',
    category: 'pivo',
    tagKeys: ['pivo', 'diagnostics', 'recovery'],
    dependencies: [],
    size: '1.5 KB',
    downloads: 7120,
    rating: 4.5,
    featured: false,
  },
  {
    id: 'pivo-implementer',
    version: '1.6.0',
    category: 'pivo',
    tagKeys: ['pivo', 'delivery', 'implementation'],
    dependencies: [],
    size: '1.9 KB',
    downloads: 7450,
    rating: 4.6,
    featured: true,
  },
  {
    id: 'pivo-verifier',
    version: '1.3.0',
    category: 'pivo',
    tagKeys: ['pivo', 'verification', 'quality'],
    dependencies: [],
    size: '1.7 KB',
    downloads: 6980,
    rating: 4.6,
    featured: false,
  },
  {
    id: 'code-refactor',
    version: '2.4.0',
    category: 'development',
    tagKeys: ['refactor', 'architecture', 'maintainability'],
    dependencies: [],
    size: '2.4 KB',
    downloads: 9650,
    rating: 4.7,
    featured: true,
  },
  {
    id: 'performance-optimizer',
    version: '1.9.0',
    category: 'development',
    tagKeys: ['performance', 'profiling', 'optimization'],
    dependencies: [],
    size: '2.2 KB',
    downloads: 10420,
    rating: 4.8,
    featured: true,
  },
  {
    id: 'security-auditor',
    version: '2.1.0',
    category: 'development',
    tagKeys: ['security', 'audit', 'compliance'],
    dependencies: [],
    size: '2.0 KB',
    downloads: 11002,
    rating: 4.9,
    featured: true,
  },
  {
    id: 'tech-writer',
    version: '1.7.0',
    category: 'documentation',
    tagKeys: ['documentation', 'guides', 'knowledgeBase'],
    dependencies: [],
    size: '1.6 KB',
    downloads: 6543,
    rating: 4.5,
    featured: false,
  },
  {
    id: 'docker-expert',
    version: '2.1.0',
    category: 'development',
    tagKeys: ['docker', 'kubernetes', 'devops', 'container'],
    dependencies: [],
    size: '2.9 KB',
    downloads: 5432,
    rating: 4.7,
    featured: false,
  },
];

const getArray = (value: unknown): string[] => {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
};

export const getBuiltinSkills = (t: TFunction): BuiltinSkill[] => {
  const author = t('skillCatalog.common.ifaiTeam');

  return builtinSkillDefinitions.map((definition) => {
    const baseKey = `skillCatalog.skills.${definition.id}`;
    const requirements = getArray(
      t(`${baseKey}.requirements`, { returnObjects: true, defaultValue: [] })
    );
    const examples = getArray(
      t(`${baseKey}.examples`, { returnObjects: true, defaultValue: [] })
    );

    return {
      id: definition.id,
      name: definition.id,
      displayName: t(`${baseKey}.name`),
      description: t(`${baseKey}.description`),
      longDescription: t(`${baseKey}.longDescription`),
      version: definition.version,
      author,
      category: definition.category,
      tags: definition.tagKeys.map(tagKey => t(`skillCatalog.tags.${tagKey}`)),
      systemPrompt: t(`${baseKey}.systemPrompt`),
      dependencies: definition.dependencies,
      size: definition.size,
      downloads: definition.downloads,
      rating: definition.rating,
      featured: definition.featured,
      examples,
      requirements: requirements.length > 0 ? requirements : undefined,
    };
  });
};

export const getFeaturedBuiltinSkills = (t: TFunction): BuiltinSkill[] => {
  return getBuiltinSkills(t).filter(skill => skill.featured);
};
