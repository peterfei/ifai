/**
 * SKILL_CATEGORY_DSL — 技能分类统一 DSL
 *
 * 单一事实来源：所有组件通过此 DSL 访问分类，禁止硬编码分类字符串。
 * builtinSkills.ts 不做修改，DSL 作为适配层覆盖其上。
 */

// ==================== 类型定义 ====================

export interface SkillCategory {
  id: string;
  label: string;
  icon: string;
  color: string;
  order: number;
}

export interface Categorizable {
  id?: string;
  tags?: string[];
  category?: string;
  [key: string]: unknown;
}

// ==================== DSL 定义 ====================

const CATEGORIES: Record<string, SkillCategory> = {
  all:           { id: 'all',          label: '全部',     icon: 'Grid',      color: '#6B7280', order: 0 },
  development:   { id: 'development',  label: '编码辅助', icon: 'Code',      color: '#3B82F6', order: 1 },
  refactoring:   { id: 'refactoring',  label: '重构',     icon: 'GitBranch', color: '#10B981', order: 2 },
  testing:       { id: 'testing',      label: '测试',     icon: 'TestTube',  color: '#F59E0B', order: 3 },
  deployment:    { id: 'deployment',   label: '部署',     icon: 'Rocket',    color: '#EC4899', order: 4 },
  codeReview:    { id: 'codeReview',   label: '代码审查', icon: 'Eye',       color: '#8B5CF6', order: 5 },
  documentation: { id: 'documentation',label: '文档',     icon: 'FileText',  color: '#06B6D4', order: 6 },
  security:      { id: 'security',     label: '安全',     icon: 'Shield',    color: '#EF4444', order: 7 },
} as const;

// builtinSkills.ts 的旧分类 → DSL 分类的映射
const OLD_CATEGORY_MAP: Record<string, string> = {
  development:   'development',
  testing:       'testing',
  documentation: 'documentation',
  pivo:          'codeReview',
  ai:            'development',
  automation:    'deployment',
};

// 标签 → DSL 分类的推断映射
const TAG_CATEGORY_MAP: Record<string, string> = {
  // development
  code:           'development',
  coding:         'development',
  programming:    'development',
  typescript:     'development',
  javascript:     'development',
  // refactoring
  refactor:       'refactoring',
  refactoring:    'refactoring',
  // testing
  test:           'testing',
  testing:        'testing',
  e2e:            'testing',
  unit:           'testing',
  // deployment
  deploy:         'deployment',
  deployment:     'deployment',
  devops:         'deployment',
  docker:         'deployment',
  // code review
  review:         'codeReview',
  'code-review':  'codeReview',
  'code review':  'codeReview',
  // documentation
  doc:            'documentation',
  docs:           'documentation',
  document:       'documentation',
  documentation:  'documentation',
  // security
  security:       'security',
  secure:         'security',
  safety:         'security',
};

// ID 关键词 → DSL 分类的推断映射
const ID_CATEGORY_MAP: Record<string, string> = {
  deploy:         'deployment',
  security:       'security',
  review:         'codeReview',
  doc:            'documentation',
  test:           'testing',
  refactor:       'refactoring',
  lint:           'development',
  docker:         'deployment',
};

// ==================== 公开 API ====================

/** 通过 ID 查询分类，不存在返回 undefined */
export function getCategory(id: string): SkillCategory | undefined {
  return CATEGORIES[id];
}

/** 返回按 order 升序排列的所有分类（不含 'all'） */
export function getAllCategories(): SkillCategory[] {
  return Object.values(CATEGORIES)
    .filter((c) => c.id !== 'all')
    .sort((a, b) => a.order - b.order);
}

/** 返回含 "全部" 的分类列表，供 CategoryPills 组件消费 */
export function getCategoryPills(): SkillCategory[] {
  const all = CATEGORIES['all'];
  const rest = getAllCategories();
  return [all, ...rest];
}

/**
 * 从技能对象推断 DSL 分类 ID。
 * 优先级：category 旧映射 > tags 匹配 > id 关键词匹配 > 'development' fallback
 */
export function inferCategory(skill: Categorizable): string {
  // 1. 优先检查旧 category 字段的直接映射
  if (skill.category && OLD_CATEGORY_MAP[skill.category]) {
    return OLD_CATEGORY_MAP[skill.category];
  }

  // 2. 检查 tags
  if (skill.tags && skill.tags.length > 0) {
    for (const tag of skill.tags) {
      const lower = tag.toLowerCase();
      if (TAG_CATEGORY_MAP[lower]) {
        return TAG_CATEGORY_MAP[lower];
      }
    }
  }

  // 3. 检查 id
  if (skill.id) {
    const lower = skill.id.toLowerCase();
    for (const [keyword, categoryId] of Object.entries(ID_CATEGORY_MAP)) {
      if (lower.includes(keyword)) {
        return categoryId;
      }
    }
  }

  // 4. fallback
  return 'development';
}

/** 按 DSL 分类 ID 过滤技能列表 */
export function getSkillsByCategory<T extends Categorizable>(
  skills: T[],
  categoryId: string
): T[] {
  if (categoryId === 'all') return skills;
  return skills.filter((s) => inferCategory(s) === categoryId);
}
