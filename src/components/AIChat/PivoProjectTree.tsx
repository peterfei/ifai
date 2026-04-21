
import React, { useState, useMemo } from "react";
import { Folder, File, ChevronRight, ChevronDown, Star, Code, Eye, EyeOff, FileText } from "lucide-react";
import { useTranslation } from "react-i18next";

interface TreeNode {
  name: string;
  type: "file" | "directory";
  children?: TreeNode[];
  fullPath?: string; // 🏆 添加完整路径，用于匹配 keyFiles
}

interface ProjectTreeProps {
  structure: any;
  keyFiles?: Record<string, string>;
}

// 🏆 截断文件内容的最大长度
const MAX_CONTENT_PREVIEW_LENGTH = 500;

// 🏆 关键文件预览组件 - 显示截断后的文件内容
const KeyFilePreview: React.FC<{ path: string; content: string }> = ({ path, content }) => {
  const { t } = useTranslation();
  const [isExpanded, setIsExpanded] = useState(false);
  const isTruncated = content.length > MAX_CONTENT_PREVIEW_LENGTH;

  const displayContent = isTruncated && !isExpanded
    ? content.substring(0, MAX_CONTENT_PREVIEW_LENGTH)
    : content;

  return (
    <div className="mt-2 rounded border theme-border theme-code-surface overflow-hidden">
      <div
        className="flex items-center justify-between px-3 py-1.5 theme-panel-muted border-b theme-border cursor-pointer theme-hoverable"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-2">
          <Code size={12} className="theme-text-accent" />
          <span className="text-xs theme-text-muted font-mono">{path}</span>
        </div>
        <div className="flex items-center gap-2">
          {isTruncated && !isExpanded && (
            <span className="text-[10px] theme-text-subtle">
              {t('aiChat.projectTree.characters', { count: content.length })}
            </span>
          )}
          {isTruncated ? (
            isExpanded ? (
              <EyeOff size={12} className="theme-text-subtle" />
            ) : (
              <Eye size={12} className="theme-text-subtle" />
            )
          ) : null}
        </div>
      </div>
      <pre className="p-3 text-xs theme-text-muted font-mono overflow-x-auto max-h-[300px] overflow-y-auto">
        <code>
          {displayContent}
          {isTruncated && !isExpanded && (
            <span className="theme-text-accent">
              {`\n\n${t('aiChat.projectTree.truncatedHint')}`}
            </span>
          )}
        </code>
      </pre>
    </div>
  );
};

const TreeItem: React.FC<{
  node: TreeNode;
  level: number;
  keyFilesPaths: string[];
  keyFiles: Record<string, string>;
}> = ({ node, level, keyFilesPaths, keyFiles }) => {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(level < 1); // 默认展开第一层
  const [showContentPreview, setShowContentPreview] = useState(false);
  const hasChildren = node.children && node.children.length > 0;
  const isKeyFile = keyFilesPaths.some(p => p.endsWith(node.name) || p === node.fullPath);
  const keyFileContent = isKeyFile && node.fullPath ? keyFiles[node.fullPath] : null;

  return (
    <div className="select-none">
      <div
        className={`flex items-center py-1 px-2 rounded cursor-pointer transition-colors ${
          'theme-soft-hover'
        } ${
          isKeyFile ? "theme-text-accent" : "theme-text-muted"
        }`}
        style={{ paddingLeft: `${level * 12 + 8}px` }}
        onClick={() => setIsOpen(!isOpen)}
      >
        <span className="w-4 h-4 mr-1 flex items-center justify-center">
          {hasChildren ? (
            isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />
          ) : null}
        </span>
        <span className="mr-2">
          {node.type === "directory" ? (
            <Folder size={16} className="theme-text-warning" />
          ) : (
            <File size={16} className="theme-text-subtle" />
          )}
        </span>
        <span className="text-sm font-medium truncate">{node.name}</span>
        {isKeyFile && <Star size={12} className="ml-2 text-[var(--warning-color)] fill-[var(--warning-soft-bg)]" />}
      </div>

      {hasChildren && isOpen && (
        <div className="border-l theme-border ml-[18px]">
          {node.children!.map((child, i) => (
            <TreeItem
              key={i}
              node={child}
              level={level + 1}
              keyFilesPaths={keyFilesPaths}
              keyFiles={keyFiles}
            />
          ))}
        </div>
      )}

      {/* 🏆 关键文件内容预览 */}
      {isKeyFile && keyFileContent && isOpen && !hasChildren && (
        <div style={{ paddingLeft: `${level * 12 + 20}px` }} className="mt-1">
          <button
            onClick={() => setShowContentPreview(!showContentPreview)}
            className="flex items-center gap-1.5 px-2 py-1 text-[10px] theme-text-accent hover:bg-[var(--accent-soft-bg)] rounded transition-colors"
          >
            <Code size={10} />
            <span>{showContentPreview ? t('aiChat.projectTree.hidePreview') : t('aiChat.projectTree.showPreview')}</span>
          </button>
          {showContentPreview && (
            <KeyFilePreview path={node.fullPath || node.name} content={keyFileContent} />
          )}
        </div>
      )}
    </div>
  );
};

// 🔥 PERFORMANCE FIX: 添加比较函数，使用 JSON 序列化进行深度比较
const arePivoProjectTreePropsEqual = (prevProps: ProjectTreeProps, nextProps: ProjectTreeProps) => {
    // 🐛 DEBUG: 添加日志追踪React.memo比较
    const prevStructureKeys = Object.keys(prevProps.structure || {}).length;
    const nextStructureKeys = Object.keys(nextProps.structure || {}).length;
    const prevKeyFilesKeys = Object.keys(prevProps.keyFiles || {}).length;
    const nextKeyFilesKeys = Object.keys(nextProps.keyFiles || {}).length;

    console.log('[PivoProjectTree] 🔍 React.memo comparing props:', {
        prevStructureKeys,
        nextStructureKeys,
        prevKeyFilesKeys,
        nextKeyFilesKeys
    });

    // 使用 JSON 序列化进行深度比较，避免对象引用不同导致的重新渲染
    try {
        const structureEqual = JSON.stringify(prevProps.structure) === JSON.stringify(nextProps.structure);
        const keyFilesEqual = JSON.stringify(prevProps.keyFiles) === JSON.stringify(nextProps.keyFiles);
        const result = structureEqual && keyFilesEqual;

        console.log('[PivoProjectTree] 📊 Comparison result:', {
            structureEqual,
            keyFilesEqual,
            shouldReuse: result
        });

        return result;
    } catch {
        // 如果序列化失败，使用浅比较作为后备
        const result = (
            prevProps.structure === nextProps.structure &&
            prevProps.keyFiles === nextProps.keyFiles
        );
        console.log('[PivoProjectTree] ⚠️ Fallback to shallow comparison:', result);
        return result;
    }
};

export const PivoProjectTree: React.FC<ProjectTreeProps> = React.memo(({ structure, keyFiles = {} }) => {
  const { t } = useTranslation();
  // 🔥 PERFORMANCE FIX: 使用 useMemo 缓存解析结果，避免重复计算
  const treeData = useMemo(() => {
    // 🐛 DEBUG: 添加日志追踪useMemo调用
    console.log('[PivoProjectTree] 🔍 treeData useMemo computing...', {
      structureKeys: Object.keys(structure || {}).length
    });

    // 🏆 修复：在解析时保存完整路径
    const parseStructure = (obj: any, name: string = "root", parentPath: string = ""): TreeNode => {
      const children: TreeNode[] = [];
      const currentPath = parentPath ? `${parentPath}/${name}` : name;

      for (const key in obj) {
        const itemPath = name === "root" ? key : `${currentPath}/${key}`;

        if (obj[key] === "file") {
          children.push({ name: key, type: "file", fullPath: itemPath });
        } else {
          // 递归解析目录
          children.push(parseStructure(obj[key], key, currentPath));
        }
      }

      children.sort((a, b) => {
        if (a.type !== b.type) return a.type === "directory" ? -1 : 1;
        return a.name.localeCompare(b.name);
      });

      return { name, type: "directory", children };
    };

    const result = parseStructure(structure);
    console.log('[PivoProjectTree] ✅ treeData computed successfully');
    return result;
  }, [structure]);

  const keyFilesPaths = useMemo(() => {
    console.log('[PivoProjectTree] 🔍 keyFilesPaths useMemo computing...', {
      keys: Object.keys(keyFiles || {}).length
    });
    const result = Object.keys(keyFiles);
    console.log('[PivoProjectTree] ✅ keyFilesPaths computed successfully');
    return result;
  }, [keyFiles]);

  return (
    <div className="space-y-3">
      {/* 📁 文件树部分 */}
      <div className="theme-panel-muted border theme-border rounded-lg p-3 font-mono max-h-[400px] overflow-y-auto custom-scrollbar">
        <div className="text-[10px] uppercase tracking-wider theme-text-subtle mb-3 px-1 flex justify-between items-center">
          <span>{t('aiChat.projectTree.topology')}</span>
          <span className="theme-text-accent">{t('aiChat.projectTree.keyFiles', { count: keyFilesPaths.length })}</span>
        </div>
        {treeData.children?.map((node, i) => (
          <TreeItem
            key={i}
            node={node}
            level={0}
            keyFilesPaths={keyFilesPaths}
            keyFiles={keyFiles}
          />
        ))}
      </div>

      {/* 🏆 关键文件内容摘要（可折叠） */}
      {keyFilesPaths.length > 0 && (
        <div className="theme-panel-muted border border-[var(--accent-soft-border)] rounded-lg p-3">
          <div className="text-[10px] uppercase tracking-wider theme-text-accent mb-2 px-1 flex justify-between items-center">
            <span className="flex items-center gap-1.5">
              <FileText size={12} />
              {t('aiChat.projectTree.keyFilesPreview')}
            </span>
            <span className="theme-text-subtle">{t('aiChat.projectTree.files', { count: keyFilesPaths.length })}</span>
          </div>
          <div className="space-y-2">
            {keyFilesPaths.slice(0, 3).map((path) => {
              const content = keyFiles[path];
              const previewLength = Math.min(100, content.length);
              const preview = content.substring(0, previewLength);

              return (
                <div
                  key={path}
                  className="theme-code-surface rounded border theme-border p-2 hover:border-[var(--accent-soft-border)] transition-colors"
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs theme-text-accent font-mono truncate flex-1">{path}</span>
                    <span className="text-[10px] theme-text-subtle ml-2">
                      {t('aiChat.projectTree.characters', { count: content.length })}
                    </span>
                  </div>
                  <pre className="text-[10px] theme-text-subtle font-mono overflow-hidden">
                    <code>{preview}{content.length > 100 ? '...' : ''}</code>
                  </pre>
                </div>
              );
            })}
            {keyFilesPaths.length > 3 && (
              <div className="text-center text-[10px] theme-text-subtle py-1">
                {t('aiChat.projectTree.moreKeyFiles', { count: keyFilesPaths.length - 3 })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}, arePivoProjectTreePropsEqual);
