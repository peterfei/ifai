import React from 'react';
import {
  CircleOff,
  Compass,
  FolderOpen,
  MessageSquare,
  Search,
  Sparkles,
  Terminal,
} from 'lucide-react';

interface ToolCategoryIconProps {
  icon: string;
  className?: string;
}

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  folder: FolderOpen,
  sparkles: Sparkles,
  search: Search,
  terminal: Terminal,
  message: MessageSquare,
  compass: Compass,
  none: CircleOff,
};

export const ToolCategoryIcon: React.FC<ToolCategoryIconProps> = ({
  icon,
  className = 'h-4 w-4',
}) => {
  const Icon = iconMap[icon] || CircleOff;
  return <Icon className={className} aria-hidden="true" />;
};

export default ToolCategoryIcon;
