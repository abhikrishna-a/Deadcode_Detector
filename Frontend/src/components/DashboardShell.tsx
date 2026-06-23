import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  LayoutDashboard, FileSearch, MessageCircle, Shield,
  LogOut, Clock, Settings, GitPullRequest, Users, Bot,
  ChevronLeft, ChevronRight
} from 'lucide-react';
import { User } from '../types';

interface DashNavItem {
  id: string;
  label: string;
  icon: any;
  roles: ('senior' | 'junior')[];
}

const NAV_ITEMS: DashNavItem[] = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard, roles: ['senior', 'junior'] },
  { id: 'review', label: 'Review Queue', icon: GitPullRequest, roles: ['senior'] },
  { id: 'junior', label: 'My Submissions', icon: UploadIcon, roles: ['junior'] },
  { id: 'analyzer', label: 'Scanner', icon: FileSearch, roles: ['junior'] },
  { id: 'history', label: 'History', icon: Clock, roles: ['senior'] },
  { id: 'chat', label: 'AI Inspector', icon: MessageCircle, roles: ['senior', 'junior'] },
  { id: 'team', label: 'Team Chat', icon: Users, roles: ['senior', 'junior'] },
  { id: 'assist', label: 'AI Assist', icon: Bot, roles: ['junior'] },
  { id: 'admin', label: 'Admin', icon: Shield, roles: ['senior'] },
];

function UploadIcon(props: any) {
  return (
    <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  );
}

interface DashboardShellProps {
  user: User;
  onLogout: () => void;
  children: (activeTab: string, onNavigate: (tab: string) => void) => React.ReactNode;
}

export default function DashboardShell({ user, onLogout, children }: DashboardShellProps) {
  const [activeTab, setActiveTab] = useState<string>('overview');
  const [collapsed, setCollapsed] = useState(false);

  const visibleItems = NAV_ITEMS.filter(item => item.roles.includes(user.role));

  return (
    <div className="min-h-screen bg-[#060608] flex text-neutral-200">
      {/* Sidebar */}
      <aside
        className={`relative flex-shrink-0 flex flex-col border-r border-white/[0.04] bg-[#0a0a0d] transition-all duration-200 ${
          collapsed ? 'w-16' : 'w-56'
        }`}
      >
        {/* Collapse toggle */}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="absolute -right-3 top-6 w-6 h-6 rounded-full bg-[#0a0a0d] border border-white/[0.06] flex items-center justify-center text-zinc-500 hover:text-zinc-300 z-10 cursor-pointer"
        >
          {collapsed ? <ChevronRight size={12} /> : <ChevronLeft size={12} />}
        </button>

        {/* Logo */}
        <div className="flex items-center gap-3 px-4 h-14 border-b border-white/[0.04]">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-cyan-400 to-purple-600 flex items-center justify-center shadow-lg shadow-cyan-500/10 flex-shrink-0">
            <span className="font-display font-black text-[10px] text-white">GC</span>
          </div>
          {!collapsed && (
            <div className="flex flex-col">
              <span className="font-display font-bold text-sm text-zinc-100 tracking-tight leading-none">GhostCode</span>
              <span className="text-[9px] text-zinc-600 font-mono tracking-wider mt-0.5 uppercase">Audit</span>
            </div>
          )}
        </div>

        {/* Navigation */}
        <nav className="flex-1 flex flex-col gap-1 px-3 py-4 overflow-y-auto">
          {visibleItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`relative flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all cursor-pointer focus:outline-none ${
                  isActive
                    ? 'text-white bg-white/[0.06]'
                    : 'text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.03]'
                } ${collapsed ? 'justify-center' : ''}`}
                title={collapsed ? item.label : undefined}
              >
                {isActive && (
                  <motion.div
                    layoutId="sidebarActiveIndicator"
                    transition={{ type: 'spring', damping: 20, stiffness: 350 }}
                    className="absolute inset-0 rounded-lg bg-white/[0.06]"
                  />
                )}
                <Icon size={16} className={`flex-shrink-0 ${isActive ? 'text-cyan-400' : ''}`} />
                {!collapsed && <span className="truncate">{item.label}</span>}
                {isActive && !collapsed && (
                  <div className="ml-auto w-1.5 h-1.5 rounded-full bg-cyan-400" />
                )}
              </button>
            );
          })}
        </nav>

      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
         {/* Top bar */}
        <header className="sticky top-0 z-40 h-14 border-b border-white/[0.04] bg-[#060608]/80 backdrop-blur-xl flex items-center justify-between px-6">
          <div className="text-sm font-medium text-zinc-400">
            {visibleItems.find(i => i.id === activeTab)?.label || 'GhostCode'}
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 px-2.5 py-1 rounded-lg bg-white/[0.02] border border-white/[0.04]">
              <div className="w-6 h-6 rounded-md bg-gradient-to-r from-cyan-400 to-purple-600 flex items-center justify-center text-[8px] font-extrabold text-white font-mono flex-shrink-0">
                {user.username[0].toUpperCase()}
              </div>
              <div className="flex flex-col leading-tight">
                <span className="text-[10px] font-semibold text-zinc-200 truncate max-w-[80px]">{user.username}</span>
                <span className="text-[8px] text-zinc-500 font-mono tracking-wide capitalize">{user.role}</span>
              </div>
            </div>
            <button
              onClick={() => setActiveTab('settings')}
              className="flex items-center justify-center w-7 h-7 rounded-lg text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.03] transition-all cursor-pointer"
              title="Settings"
            >
              <Settings size={13} />
            </button>
            <button
              onClick={onLogout}
              className="flex items-center justify-center w-7 h-7 rounded-lg text-rose-400 hover:bg-rose-500/5 transition-all cursor-pointer"
              title="Disconnect"
            >
              <LogOut size={13} />
            </button>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto">
          <div className="max-w-7xl mx-auto px-6 py-8">
            <AnimatePresence mode="wait">
              {children(activeTab, setActiveTab)}
            </AnimatePresence>
          </div>
        </main>
      </div>
    </div>
  );
}
