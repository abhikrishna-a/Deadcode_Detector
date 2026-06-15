import { useState, useMemo, useEffect } from 'react';
import { motion } from 'motion/react';
import { Search, Shield, ShieldCheck, Mail, Info, Loader2 } from 'lucide-react';
import { User } from '../../api/types';
import { authAPI } from '../../api/auth';

interface AdminTabProps {
  key?: string;
  currentUser: User;
  onShowToast: (msg: string, type: 'success' | 'error' | 'info') => void;
}

export default function AdminTab({ currentUser, onShowToast }: AdminTabProps) {
  const [users, setUsers] = useState<User[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [togglingId, setTogglingId] = useState<number | null>(null);

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    setLoading(true);
    try {
      const data = await authAPI.getAdminUsers();
      setUsers(data);
    } catch (err: any) {
      onShowToast(err?.message || 'Failed to load users', 'error');
    } finally {
      setLoading(false);
    }
  };

  const filteredUsers = useMemo(() => {
    if (!searchQuery) return users;
    const q = searchQuery.toLowerCase();
    return users.filter(u => 
      u.username.toLowerCase().includes(q) || 
      u.email.toLowerCase().includes(q)
    );
  }, [users, searchQuery]);

  const toggleUserRole = async (userId: number) => {
    if (userId === currentUser.id) {
      onShowToast('You cannot change your own role.', 'error');
      return;
    }

    setTogglingId(userId);
    try {
      const user = users.find(u => u.id === userId);
      if (!user) return;
      const nextRole = user.role === 'admin' ? 'viewer' : 'admin';
      const updated = await authAPI.updateUserRole(userId, nextRole as 'admin' | 'viewer');
      setUsers(prev => prev.map(u => u.id === userId ? updated : u));
      onShowToast(`User "${updated.username}" is now ${updated.role.toUpperCase()}`, 'success');
    } catch (err: any) {
      onShowToast(err?.message || 'Failed to update role', 'error');
    } finally {
      setTogglingId(null);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -15 }}
      transition={{ duration: 0.3 }}
      className="space-y-6 text-left"
    >
      {/* Tab description */}
      <div className="space-y-2">
        <h2 className="font-display font-bold text-xl text-neutral-150 tracking-tight flex items-center gap-2">
          <ShieldCheck className="text-teal-400" /> User Credentials Registry
        </h2>
        <p className="text-zinc-500 text-xs font-sans">
          Promote code audit leads to administrative rights. Demote inactive tester logs from access panels.
        </p>
      </div>

      {/* Filter panel */}
      <div className="relative">
        <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-650">
          <Search size={14} />
        </span>
        <input
          type="text"
          placeholder="Filter accounts by name or email identity..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 text-xs text-zinc-300 bg-zinc-950/40 border border-white/[0.06] focus:border-violet-500/60 rounded-xl outline-none transition-all placeholder:text-zinc-650"
        />
      </div>

      {/* Pristine Obsidian accounts table representation */}
      <div 
        style={{
          background: 'linear-gradient(135deg, rgba(16, 15, 23, 0.6), rgba(8, 8, 12, 0.7))',
          border: '1px solid rgba(255, 255, 255, 0.03)',
          boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.03)'
        }}
        className="rounded-2xl overflow-hidden backdrop-blur-md"
      >
        {/* Table Columns Header */}
        <div className="grid grid-cols-12 gap-4 px-6 py-3.5 border-b border-white/[0.04] text-[10px] font-mono tracking-wider text-neutral-500 uppercase font-semibold">
          <div className="col-span-4">Audit Identity</div>
          <div className="col-span-3">Email Address</div>
          <div className="col-span-2">Security Level</div>
          <div className="col-span-2">MFA Anchor</div>
          <div className="col-span-1 text-right">Actions</div>
        </div>

        {/* Rows wrapper */}
        <div className="divide-y divide-white/[0.02]">
          {loading ? (
            <div className="flex items-center justify-center py-10 text-neutral-500 gap-2">
              <Loader2 size={14} className="animate-spin text-cyan-400" />
              <span className="text-xs font-mono">Loading user registry...</span>
            </div>
          ) : filteredUsers.length === 0 ? (
            <div className="text-center py-10 text-neutral-600">
              No matching records identified.
            </div>
          ) : (
            filteredUsers.map((userCheck, index) => {
              const isAdmin = userCheck.role === 'admin';
              const isSelf = userCheck.username === currentUser.username;
              return (
                <div 
                  key={userCheck.id} 
                  className="grid grid-cols-12 gap-4 px-6 py-4 items-center hover:bg-white/[0.01] transition-colors"
                >
                  {/* Avatar & Username */}
                  <div className="col-span-4 flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center font-mono font-bold text-xs ${
                      isAdmin 
                        ? 'bg-teal-500/10 text-teal-400 border border-teal-500/15' 
                        : 'bg-zinc-900 border border-white/[0.03] text-zinc-400'
                    }`}>
                      {userCheck.username[0].toUpperCase()}
                    </div>
                    <div>
                      <span className="font-mono text-zinc-150 font-bold block text-xs">
                        {userCheck.username}
                      </span>
                      <span className="text-[9px] font-mono text-neutral-500">
                        UID: #{userCheck.id} {isSelf && '(You)'}
                      </span>
                    </div>
                  </div>

                  {/* Email */}
                  <div className="col-span-3 flex items-center gap-2 text-zinc-400 text-xs font-sans">
                    <Mail size={12} className="text-neutral-500" />
                    <span className="truncate max-w-[180px]">{userCheck.email}</span>
                  </div>

                  {/* Level Badger */}
                  <div className="col-span-2">
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[9px] font-mono uppercase font-bold border ${
                      isAdmin 
                        ? 'text-teal-400 bg-teal-500/5 border-teal-500/15' 
                        : 'text-zinc-500 bg-zinc-950/40 border-white/[0.02]'
                    }`}>
                      {isAdmin ? <ShieldCheck size={10} /> : <Shield size={10} />}
                      {userCheck.role}
                    </span>
                  </div>

                  {/* MFA Badge */}
                  <div className="col-span-2">
                    <span className={`text-[10px] font-mono font-medium ${
                      userCheck.is_mfa_enabled ? 'text-violet-400' : 'text-neutral-600'
                    }`}>
                      {userCheck.is_mfa_enabled ? 'ACTIVE_TOTP' : 'DEACTIVATED'}
                    </span>
                  </div>

                  {/* Role mutation trigger buttons */}
                  <div className="col-span-1 text-right">
                    {isSelf ? (
                      <span className="text-[10px] text-zinc-650 font-sans italic pr-2">Locked</span>
                    ) : (
                      <button
                        onClick={() => toggleUserRole(userCheck.id)}
                        disabled={togglingId === userCheck.id}
                        className={`px-3 py-1.5 rounded-lg text-[10px] font-semibold tracking-tight transition-all cursor-pointer disabled:opacity-40 ${
                          isAdmin 
                            ? 'border border-rose-500/20 text-rose-450 hover:bg-rose-500/5' 
                            : 'border border-teal-500/25 text-teal-400 hover:bg-teal-500/5'
                        }`}
                      >
                        {togglingId === userCheck.id ? (
                          <Loader2 size={12} className="animate-spin inline" />
                        ) : isAdmin ? (
                          'Demote'
                        ) : (
                          'Promote'
                        )}
                      </button>
                    )}
                  </div>

                </div>
              );
            })
          )}
        </div>

        {/* Footer info counts */}
        <div className="bg-zinc-950/20 px-6 py-2 border-t border-white/[0.02] flex justify-between items-center text-[9px] font-mono text-zinc-600 tracking-wider">
          <span>REGISTRY: {users.length} MEMBERS</span>
          <span>ADMINS: {users.filter(u => u.role === 'admin').length} ACTIVE</span>
        </div>
      </div>

      {/* Safety guideline memo */}
      <div className="p-4 border border-teal-500/[0.08] bg-teal-500/[0.01] rounded-xl flex gap-3 text-left">
        <Info size={15} className="text-teal-400 flex-shrink-0 mt-0.5" />
        <div className="space-y-1">
          <span className="text-xs font-semibold text-neutral-300 block">Workspace Demotion Barriers</span>
          <p className="text-[11px] text-neutral-500 font-sans leading-normal">
            To prevent system state locks or security lock-outs, demotions on your administrator session account are block-shielded. Designate alternate anchors in secondary registries.
          </p>
        </div>
      </div>
    </motion.div>
  );
}
export {};
