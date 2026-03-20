
import React, { useState } from "react";
import { Folder, File, ChevronRight, ChevronDown, Star, Code, Eye, EyeOff } from "lucide-react";

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
  const [isExpanded, setIsExpanded] = useState(false);
  const isTruncated = content.length > MAX_CONTENT_PREVIEW_LENGTH;

  const displayContent = isTruncated && !isExpanded
    ? content.substring(0, MAX_CONTENT_PREVIEW_LENGTH)
    : content;

  return (
    <div className="mt-2 bg-black/30 rounded border border-white/10 overflow-hidden">
      <div
        className="flex items-center justify-between px-3 py-1.5 bg-white/5 border-b border-white/10 cursor-pointer hover:bg-white/10 transition-colors"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-2">
          <Code size={12} className="text-blue-400" />
          <span className="text-xs text-gray-300 font-mono">{path}</span>
        </div>
        <div className="flex items-center gap-2">
          {isTruncated && !isExpanded && (
            <span className="text-[10px] text-gray-500">
              ({content.length} 字符)
            </span>
          )}
          {isTruncated ? (
            isExpanded ? (
              <EyeOff size={12} className="text-gray-400" />
            ) : (
              <Eye size={12} className="text-gray-400" />
            )
          ) : null}
        </div>
      </div>
      <pre className="p-3 text-xs text-gray-400 font-mono overflow-x-auto max-h-[300px] overflow-y-auto">
        <code>
          {displayContent}
          {isTruncated && !isExpanded && (
            <span className="text-blue-400">
              {"\n\n... (已截断，点击展开查看全部)"}
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
  const [isOpen, setIsOpen] = useState(level < 1); // 默认展开第一层
  const [showContentPreview, setShowContentPreview] = useState(false);
  const hasChildren = node.children && node.children.length > 0;
  const isKeyFile = keyFilesPaths.some(p => p.endsWith(node.name) || p === node.fullPath);
  const keyFileContent = isKeyFile && node.fullPath ? keyFiles[node.fullPath] : null;

  return (
    <div className="select-none">
      <div
        className={`flex items-center py-1 px-2 hover:bg-white/5 rounded cursor-pointer transition-colors ${
          isKeyFile ? "text-blue-400" : "text-gray-300"
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
            <Folder size={16} className="text-amber-400/80" />
          ) : (
            <File size={16} className="text-gray-400" />
          )}
        </span>
        <span className="text-sm font-medium truncate">{node.name}</span>
        {isKeyFile && <Star size={12} className="ml-2 text-yellow-500 fill-yellow-500/20" />}
      </div>

      {hasChildren && isOpen && (
        <div className="border-l border-white/10 ml-[18px]">
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
            className="flex items-center gap-1.5 px-2 py-1 text-[10px] text-blue-400 hover:text-blue-300 hover:bg-blue-500/10 rounded transition-colors"
          >
            <Code size={10} />
            <span>{showContentPreview ? "隐藏" : "预览"}关键文件内容</span>
          </button>
          {showContentPreview && (
            <KeyFilePreview path={node.fullPath || node.name} content={keyFileContent} />
          )}
        </div>
      )}
    </div>
  );
};

export const PivoProjectTree: React.FC<ProjectTreeProps> = ({ structure, keyFiles = {} }) => {
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

  const treeData = parseStructure(structure);
  const keyFilesPaths = Object.keys(keyFiles);

  return (
    <div className="space-y-3">
      {/* 📁 文件树部分 */}
      <div className="bg-[#1e1e1e]/50 border border-white/10 rounded-lg p-3 font-mono max-h-[400px] overflow-y-auto custom-scrollbar">
        <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-3 px-1 flex justify-between items-center">
          <span>Project Topology</span>
          <span className="text-blue-400">{keyFilesPaths.length} key files</span>
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
        <div className="bg-[#1e1e1e]/30 border border-blue-500/20 rounded-lg p-3">
          <div className="text-[10px] uppercase tracking-wider text-blue-400 mb-2 px-1 flex justify-between items-center">
            <span>📝 Key Files Preview</span>
            <span className="text-gray-500">{keyFilesPaths.length} files</span>
          </div>
          <div className="space-y-2">
            {keyFilesPaths.slice(0, 3).map((path) => {
              const content = keyFiles[path];
              const previewLength = Math.min(100, content.length);
              const preview = content.substring(0, previewLength);

              return (
                <div
                  key={path}
                  className="bg-black/20 rounded border border-white/5 p-2 hover:border-white/10 transition-colors"
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-blue-300 font-mono truncate flex-1">{path}</span>
                    <span className="text-[10px] text-gray-500 ml-2">
                      {content.length} chars
                    </span>
                  </div>
                  <pre className="text-[10px] text-gray-500 font-mono overflow-hidden">
                    <code>{preview}{content.length > 100 ? '...' : ''}</code>
                  </pre>
                </div>
              );
            })}
            {keyFilesPaths.length > 3 && (
              <div className="text-center text-[10px] text-gray-500 py-1">
                ... and {keyFilesPaths.length - 3} more key files
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
