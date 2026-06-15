import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { LayoutDashboard, FileSearch, MessageCircle, Shield, LogOut, Terminal, Clock, Settings } from 'lucide-react';
import { User, AnalysisResult } from '../types';

const NAV_ITEMS = [
  { id: 'overview', label: 'Monitor', icon: LayoutDashboard },
  { id: 'analyzer', label: 'Scanner Workspace', icon: FileSearch },
  { id: 'history', label: 'History', icon: Clock },
  { id: 'chat', label: 'AI Inspector', icon: MessageCircle },
];

interface DashboardShellProps {
  user: User;
  onLogout: () => void;
  children: (activeTab: string, onNavigate: (tab: string) => void) => React.ReactNode;
}

export default function DashboardShell({ user, onLogout, children }: DashboardShellProps) {
  const [activeTab, setActiveTab] = useState<string>('overview');

  const showAdminTab = user.role === 'admin';

  return (
    <div className="min-h-screen bg-transparent flex flex-col text-neutral-200">
      {/* Upper header segment with fine reflection lines */}
      <header className="sticky top-0 z-40 glass-card border-t-0 border-x-0 rounded-none bg-transparent backdrop-blur-xl px-8 h-16 flex items-center justify-between">
        {/* Glow accent band */}
        <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-cyan-500/25 to-transparent" />

        {/* Logo and metadata status values */}
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-400 to-purple-600 flex items-center justify-center shadow-lg shadow-cyan-500/10">
            <span className="font-display font-black text-xs text-white">GC</span>
          </div>
          <div className="flex flex-col">
            <span className="font-display font-bold text-sm text-zinc-100 tracking-tight leading-none">GhostCode</span>
            <span className="text-[10px] text-zinc-500 font-mono tracking-wider mt-0.5 uppercase">Audit Console</span>
          </div>
        </div>

        {/* Dynamic navigation links list */}
        <nav className="hidden md:flex items-center gap-1.5">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isSelected = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`relative px-4 py-2 text-xs font-semibold rounded-xl flex items-center gap-2 cursor-pointer transition-all duration-300 focus:outline-none ${
                  isSelected 
                    ? 'text-white' 
                    : 'text-neutral-500 hover:text-neutral-300'
                }`}
              >
                {/* Active slider indicator */}
                {isSelected && (
                  <motion.div
                    layoutId="activeTabSlidingIndicator"
                    transition={{ type: 'spring', damping: 20, stiffness: 350 }}
                    style={{
                      background: 'rgba(34, 211, 238, 0.08)',
                      border: '1px solid rgba(34, 211, 238, 0.15)',
                    }}
                    className="absolute inset-0 rounded-xl pointer-events-none"
                  />
                )}
                <Icon size={14} className={isSelected ? 'text-cyan-400' : ''} />
                <span>{item.label}</span>
              </button>
            );
          })}

          {showAdminTab && (
            <button
              onClick={() => setActiveTab('admin')}
              className={`relative px-4 py-2 text-xs font-semibold rounded-xl flex items-center gap-2 cursor-pointer transition-all duration-300 focus:outline-none ${
                activeTab === 'admin' 
                  ? 'text-white' 
                  : 'text-neutral-500 hover:text-neutral-300'
              }`}
            >
              {activeTab === 'admin' && (
                <motion.div
                  layoutId="activeTabSlidingIndicator"
                  transition={{ type: 'spring', damping: 20, stiffness: 350 }}
                  style={{
                    background: 'rgba(13, 148, 136, 0.08)',
                    border: '1px solid rgba(13, 148, 136, 0.18)',
                  }}
                  className="absolute inset-0 rounded-xl pointer-events-none"
                />
              )}
              <Shield size={14} className={activeTab === 'admin' ? 'text-teal-400' : ''} />
              <span>Admin Users</span>
            </button>
          )}
        </nav>

        {/* Right side profile block and terminal checkouts */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveTab('settings')}
            className={`p-2 rounded-xl transition-all cursor-pointer focus:outline-none flex items-center justify-center ${
              activeTab === 'settings'
                ? 'text-cyan-400 bg-cyan-400/10 border border-cyan-400/20'
                : 'text-zinc-500 hover:text-zinc-300 border border-transparent'
            }`}
            title="Account Settings"
          >
            <Settings size={15} />
          </button>

          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-full bg-gradient-to-r from-cyan-400 to-purple-600 flex items-center justify-center text-xs font-extrabold text-white font-mono shadow-md shadow-cyan-500/10">
              {user.username[0].toUpperCase()}
            </div>
            <div className="hidden sm:flex flex-col text-left">
              <span className="text-xs font-semibold text-zinc-200">{user.username}</span>
              <span className="text-[10px] text-zinc-500 font-mono tracking-wide capitalize">{user.role} workspace</span>
            </div>
          </div>

          {/* Secure Logout action */}
          <button
            onClick={onLogout}
            className="p-2 rounded-xl text-rose-400 border border-rose-500/10 hover:border-rose-500/25 bg-rose-500/[0.02] hover:bg-rose-500/5 transition-all cursor-pointer focus:outline-none flex items-center gap-1.5 text-xs font-semibold pr-3"
            title="Disconnect node"
          >
            <LogOut size={13} />
            <span className="hidden xs:inline">Disconnect</span>
          </button>
        </div>
      </header>

      {/* Main viewport */}
      <main className="flex-1 w-full max-w-7xl mx-auto px-6 py-8 flex flex-col min-h-0">
        <AnimatePresence mode="wait">
          {children(activeTab, setActiveTab)}
        </AnimatePresence>
      </main>

      {/* Floating diagnostics terminal rail footer */}
      <footer className="px-8 py-3.5 glass-card border-x-0 border-b-0 rounded-none bg-transparent text-center flex justify-between items-center text-[10px] text-neutral-600 font-mono tracking-wider">
        <div className="flex items-center gap-2 select-none">
          <Terminal size={12} className="text-zinc-500" />
          <span>GHOSTCODE_KERNEL_ACTIVE: True</span>
        </div>
        <div className="flex items-center gap-4">
          <span>PORT: 3000 (SECURED_SSL)</span>
          <span className="text-emerald-400">● SECURE_MFA_ACTIVE</span>
        </div>
      </footer>
    </div>
  );
}
