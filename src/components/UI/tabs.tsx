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
  <div className={clsx('theme-panel-muted inline-flex h-10 items-center justify-center rounded-md p-1', className)}>
    {children}
  </div>
);

export const TabsTrigger: React.FC<TabsTriggerProps> = ({ value, children, className }) => {
  const { activeTab, setActiveTab } = React.useContext(TabsContext);

  return (
    <button
      onClick={() => setActiveTab(value)}
      className={clsx(
        'inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium transition-all focus:outline-none focus:ring-2 focus:ring-blue-500/30 disabled:pointer-events-none disabled:opacity-50',
        activeTab === value
          ? 'theme-panel theme-text shadow-sm'
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
    <div className={clsx('mt-2 focus:outline-none focus:ring-2 focus:ring-blue-500/30', className)}>
      {children}
    </div>
  );
};
