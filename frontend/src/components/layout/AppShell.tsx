'use client';

import React, { useState } from 'react';
import { Sidebar } from './Sidebar';
import { TopHeader } from './TopHeader';
import { CreateTaskModal } from '../tasks/CreateTaskModal';

interface AppShellProps {
  children: React.ReactNode;
  breadcrumbs?: Array<{ label: string; href?: string }>;
  onQuickAction?: () => void;
}

export function AppShell({ children, breadcrumbs, onQuickAction }: AppShellProps) {
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [isCreateTaskOpen, setIsCreateTaskOpen] = useState(false);

  const handleQuickAction = () => {
    if (onQuickAction) {
      onQuickAction();
    } else {
      setIsCreateTaskOpen(true);
    }
  };

  return (
    <div className="min-h-screen bg-surface flex">
      {/* Persistent Left Sidebar */}
      <Sidebar
        onQuickAction={handleQuickAction}
        isOpenMobile={isMobileSidebarOpen}
        onCloseMobile={() => setIsMobileSidebarOpen(false)}
      />

      {/* Top Header & Main Canvas */}
      <div className="flex-1 flex flex-col min-w-0 lg:ml-sidebar-width">
        <TopHeader
          breadcrumbs={breadcrumbs}
          onToggleMobileSidebar={() => setIsMobileSidebarOpen(!isMobileSidebarOpen)}
        />

        <main className="flex-1 mt-row-height-standard p-4 md:p-6 lg:p-8 overflow-y-auto max-w-[1600px] w-full mx-auto">
          {children}
        </main>
      </div>

      {/* Reusable Create Task Modal */}
      <CreateTaskModal
        isOpen={isCreateTaskOpen}
        onClose={() => setIsCreateTaskOpen(false)}
      />
    </div>
  );
}
