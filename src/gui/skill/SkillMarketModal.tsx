/**
 * SkillMarketModal — 全屏弹窗容器
 *
 * 编排 5 区域：Header + CategoryPills + RecommendedSection + Grid + Footer
 * 容器代码 ≤ 150 行（有效行）。
 */

import React, { useMemo } from 'react';
import { getCategoryPills, getCategory } from './SKILL_CATEGORY_DSL';
import { useSkillMarket } from './useSkillMarket';
import { HeaderSearchBar } from './HeaderSearchBar';
import { CategoryPills } from './CategoryPills';
import { CompactSkillCard } from './CompactSkillCard';
import type { DisplaySkill } from './CompactSkillCard';
import { RecommendCard } from './RecommendCard';
import type { RecommendSkill } from './RecommendCard';
import { SortSelector } from './SortSelector';
import type { SortOption } from './SortSelector';
import { SkillMarketFooter } from './SkillMarketFooter';
import { SkillDetailPanel } from './SkillDetailPanel';

// ==================== 类型定义 ====================

export interface SkillMarketModalProps {
  isOpen: boolean;
  onClose: () => void;
  skills: DisplaySkill[];
  installedCount: number;
}

// ==================== 主组件 ====================

export function SkillMarketModal({
  isOpen,
  onClose,
  skills,
  installedCount,
}: SkillMarketModalProps) {
  const {
    selectedCategory,
    sortBy,
    selectedSkillId,
    filteredSkills,
    showRecommend,
    setCategory,
    setSearch,
    setSort,
    selectSkill,
  } = useSkillMarket(skills);

  const pills = useMemo(() => getCategoryPills(), []);
  const pillLabels = useMemo(() => pills.map((p) => p.label), [pills]);

  const handleCategorySelect = (label: string) => {
    const cat = pills.find((p) => p.label === label);
    if (cat) setCategory(cat.id);
  };

  const selectedLabel = pills.find((p) => p.id === selectedCategory)?.label ?? '全部';

  // 推荐技能：featured 排前 2
  const recommendSkills = useMemo<RecommendSkill[]>(() => {
    const featured = skills
      .filter((s) => (s as any).featured)
      .slice(0, 2)
      .map((s) => ({
        ...s,
        badge: 'recommended' as const,
        isInstalled: s.isInstalled,
      }));
    // 如果不够 2 个，用热门补
    if (featured.length < 2) {
      const rest = skills
        .filter((s) => !(s as any).featured)
        .slice(0, 2 - featured.length)
        .map((s) => ({
          ...s,
          badge: 'popular' as const,
          isInstalled: s.isInstalled,
        }));
      return [...featured, ...rest];
    }
    return featured;
  }, [skills]);

  const selectedSkill = selectedSkillId
    ? skills.find((s) => s.id === selectedSkillId) ?? null
    : null;

  const handleClose = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose();
  };

  if (!isOpen) return null;

  return (
    <div
      onClick={handleClose}
      className="fixed inset-0 z-50 animate-overlay"
      style={{
        background: 'rgba(0,0,0,0.7)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="absolute inset-4 md:inset-x-[10%] md:inset-y-[6%] flex flex-col rounded-2xl overflow-hidden animate-modal"
        style={{
          border: '1px solid rgba(0,122,204,0.1)',
          background: [
            'radial-gradient(ellipse 80% 60% at 30% 0%, rgba(0,122,204,0.1), transparent)',
            'radial-gradient(ellipse 50% 30% at 80% 100%, rgba(0,122,204,0.04), transparent)',
            '#1a1a1a',
          ].join(', '),
          boxShadow: [
            '0 32px 80px rgba(0,0,0,0.5)',
            '0 0 0 1px rgba(0,122,204,0.08)',
          ].join(', '),
        }}
      >
        {/* Header */}
        <div className="flex-shrink-0 flex items-center justify-between px-6 py-4 border-b border-white/[0.05]">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center text-sm shadow-lg shadow-brand-500/20">
              🎮
            </div>
            <div>
              <h2 className="text-sm font-semibold text-white/90">技能广场</h2>
              <p className="text-[11px] text-white/40">
                发现并安装 AI 技能，增强你的开发工作流
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <HeaderSearchBar onSearch={setSearch} />
            <button
              onClick={onClose}
              className="w-7 h-7 rounded-lg hover:bg-white/[0.06] flex items-center justify-center text-white/30 hover:text-white/60 transition-all text-sm"
            >
              ✕
            </button>
          </div>
        </div>

        {/* CategoryPills */}
        <CategoryPills
          categories={pillLabels}
          selected={selectedLabel}
          totalCount={filteredSkills.length}
          onSelect={handleCategorySelect}
        />

        {/* RecommendedSection */}
        {showRecommend && recommendSkills.length > 0 && (
          <div className="flex-shrink-0 px-6 py-3 border-b border-white/[0.04]">
            <div className="flex items-center gap-2 mb-2.5">
              <span className="text-[11px] font-medium text-amber-300/80">
                ⭐ 为你推荐
              </span>
              <span className="text-[10px] text-white/25">
                基于当前项目
              </span>
            </div>
            <div className="flex gap-3 overflow-hidden">
              {recommendSkills.map((s) => (
                <RecommendCard
                  key={s.id}
                  skill={s}
                  onSelect={(id) => selectSkill(id)}
                  onInstall={(id) => selectSkill(id)}
                />
              ))}
            </div>
          </div>
        )}

        {/* All Skills Grid */}
        <div className="flex-1 px-6 py-3 min-h-0 overflow-y-auto">
          <div className="flex items-center justify-between mb-2.5">
            <span className="text-[11px] font-medium text-white/50">全部技能</span>
            <SortSelector sortBy={sortBy} onChange={setSort as (s: SortOption) => void} />
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            {filteredSkills.map((s) => (
              <CompactSkillCard
                key={s.id}
                skill={s}
                onSelect={(id) => selectSkill(id)}
                onInstall={(id) => selectSkill(id)}
              />
            ))}
          </div>
        </div>

        {/* Footer */}
        <SkillMarketFooter
          installedCount={installedCount}
          lastUpdated={`今天 ${new Date().getHours().toString().padStart(2, '0')}:${new Date().getMinutes().toString().padStart(2, '0')}`}
          onManageInstalled={() => {}}
          onExploreMore={() => {}}
        />

        {/* SkillDetailPanel */}
        {selectedSkill && (
          <SkillDetailPanel
            skill={selectedSkill}
            onClose={() => selectSkill(null)}
            onInstall={(id) => selectSkill(id)}
            onUninstall={() => {}}
          />
        )}
      </div>
    </div>
  );
}
