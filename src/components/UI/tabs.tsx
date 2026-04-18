import React, { useState } from 'react';
import clsx from 'clsx';

interface TabsProps {
  defaultValue?: string;
  value?: string;
  onValueChange?: (value: string) => void;
  children: React.ReactNode;
  className?: string;
}

interface TabsListProps {
  children: React.ReactNode;
  className?: string;
}

interface TabsTriggerProps {
  value: string;
  children: React.ReactNode;
  className?: string;
}

interface TabsContentProps {
  value: string;
  children: React.ReactNode;
  className?: string;
}

const TabsContext = React.createContext<{
  activeTab: string;
  setActiveTab: (value: string) => void;
}>({
  activeTab: '',
  setActiveTab: () => {},
});

export const Tabs: React.FC<TabsProps> = ({ defaultValue, value, onValueChange, children, className }) => {
  const [internalValue, setInternalValue] = useState(defaultValue || '');
  const activeTab = value !== undefined ? value : internalValue;

  const setActiveTab = (newValue: string) => {
    if (value === undefined) {
      setInternalValue(newValue);
    }
    if (onValueChange) {
      onValueChange(newValue);
    }
  };

  return (
    <TabsContext.Provider value={{ activeTab, setActiveTab }}>
      <div className={className}>{children}</div>
    </TabsContext.Provider>
  );
};

export const TabsList: React.FC<TabsListProps> = ({ children, className }) => (
  <div className={clsx('theme-panel-muted theme-border inline-flex h-8 items-center justify-center rounded-[var(--radius-md)] border p-0.5', className)}>
    {children}
  </div>
);

export const TabsTrigger: React.FC<TabsTriggerProps> = ({ value, children, className }) => {
  const { activeTab, setActiveTab } = React.useContext(TabsContext);

  return (
    <button
      onClick={() => setActiveTab(value)}
      className={clsx(
        'theme-focus-ring-accent inline-flex h-7 items-center justify-center whitespace-nowrap rounded-[var(--radius-sm)] px-3 py-1 text-[12px] font-medium transition-all disabled:pointer-events-none disabled:opacity-50',
        activeTab === value
          ? 'theme-panel-elevated theme-text'
          : 'theme-text-muted theme-soft-hover',
        className
      )}
    >
      {children}
    </button>
  );
};

export const TabsContent: React.FC<TabsContentProps> = ({ value, children, className }) => {
  const { activeTab } = React.useContext(TabsContext);

  if (activeTab !== value) return null;

  return (
    <div className={clsx('theme-focus-ring-accent mt-2', className)}>
      {children}
    </div>
  );
};
