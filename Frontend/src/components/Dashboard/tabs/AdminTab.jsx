import { useState, useEffect, useCallback, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Search, UserCheck, UserX } from 'lucide-react';
import { authAPI } from '../../../api/auth';
import { useAuthStore } from '../../../store/authStore';
import Btn from '../../ui/Btn';
import Toast from '../../ui/Toast';
import { parseApiError } from '../../../lib/apiError';

export default function AdminTab() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const currentUser = useAuthStore((s) => s.user);

  const filteredUsers = useMemo(() => {
    if (!searchQuery) return users;
    const q = searchQuery.toLowerCase();
    return users.filter(u =>
      u.username?.toLowerCase().includes(q) ||
      u.email?.toLowerCase().includes(q)
    );
  }, [users, searchQuery]);

  const showToast = (message, type = 'info') => setToast({ message, type });
  const clearToast = () => setToast(null);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const data = await authAPI.getAdminUsers();
      setUsers(data);
    } catch (err) {
      showToast(parseApiError(err), 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const handleRoleChange = async (userId, newRole) => {
    try {
      const updated = await authAPI.updateUserRole(userId, newRole);
      setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, role: updated.role } : u)));
      showToast(`User role updated to ${newRole}.`, 'success');
    } catch (err) {
      showToast(parseApiError(err), 'error');
    }
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
    >
      {toast && <Toast message={toast.message} type={toast.type} onClose={clearToast} />}

      <h2 style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontWeight: 800, fontSize: 22, color: '#e7e5e4', marginBottom: 8 }}>
        User Management
      </h2>
      <p style={{ fontFamily: "'Inter', sans-serif", fontSize: 11, color: '#78716c', marginBottom: 16, letterSpacing: 0.5 }}>
        MANAGE USER ROLES — ADMIN ACCESS ONLY
      </p>

      <div style={{ marginBottom: 20, position: 'relative' }}>
        <Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#57534e', pointerEvents: 'none' }} />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search users..."
          style={{
            width: '100%', padding: '10px 14px 10px 36px',
            background: '#292524', border: '1px solid #44403c',
            borderRadius: 10, fontSize: 13, color: '#e7e5e4',
            fontFamily: "'Inter', sans-serif", outline: 'none',
            transition: 'border-color 0.2s',
          }}
          onFocus={(e) => { e.target.style.borderColor = '#059669'; }}
          onBlur={(e) => { e.target.style.borderColor = '#44403c'; }}
        />
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '60px 0', color: '#78716c' }}>
          <p style={{ fontFamily: "'Inter', sans-serif", fontSize: 13 }}>Loading users...</p>
        </div>
      ) : users.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 0', color: '#78716c' }}>
          <p style={{ fontFamily: "'Inter', sans-serif", fontSize: 13 }}>No users found.</p>
        </div>
      ) : (
        <div style={{
          background: '#1c1917',
          border: '1px solid #44403c',
          borderRadius: 16, overflow: 'hidden',
        }}>
          {/* Table Header */}
          <div style={{
            display: 'grid', gridTemplateColumns: '2fr 2fr 1fr 1.2fr 1.5fr',
            gap: 12, padding: '14px 20px',
            borderBottom: '1px solid #353230',
            fontFamily: "'Inter', sans-serif", fontSize: 10, color: '#78716c',
            textTransform: 'uppercase', letterSpacing: 0.5,
          }}>
            <span>Username</span>
            <span>Email</span>
            <span>Role</span>
            <span>MFA Status</span>
            <span>Actions</span>
          </div>

          {/* Table Rows */}
          {filteredUsers.map((u, idx) => (
            <motion.div
              key={u.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.03 }}
              style={{
                display: 'grid', gridTemplateColumns: '2fr 2fr 1fr 1.2fr 1.5fr',
                gap: 12, padding: '14px 20px',
                borderBottom: idx < users.length - 1 ? '1px solid #353230' : 'none',
                alignItems: 'center',
                transition: 'background 0.15s',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = '#292524'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
            >
              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 13, color: '#e7e5e4' }}>
                {u.username}
              </span>
              <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 12, color: '#78716c' }}>
                {u.email}
              </span>
              <span>
                <span style={{
                  background: u.role === 'admin' ? 'rgba(5,150,105,0.15)' : 'rgba(255,255,255,0.05)',
                  border: `1px solid ${u.role === 'admin' ? 'rgba(5,150,105,0.3)' : 'rgba(255,255,255,0.1)'}`,
                  borderRadius: 12, padding: '2px 10px',
                  fontSize: 10, color: u.role === 'admin' ? '#34d399' : '#78716c',
                  fontFamily: "'Inter', sans-serif",
                }}>
                  {u.role}
                </span>
              </span>
              <span style={{
                fontFamily: "'Inter', sans-serif", fontSize: 12,
                color: u.is_mfa_enabled ? '#4ade80' : '#78716c',
              }}>
                {u.is_mfa_enabled ? 'Enabled' : 'Disabled'}
              </span>
              <span>
                {currentUser && u.id === currentUser.id ? (
                  <span style={{ fontSize: 11, color: '#78716c', fontFamily: "'Inter', sans-serif" }}>
                    Cannot change own role
                  </span>
                ) : (
                  <button
                    onClick={() => handleRoleChange(u.id, u.role === 'admin' ? 'viewer' : 'admin')}
                    style={{
                      background: u.role === 'admin'
                        ? 'rgba(248,113,113,0.1)'
                        : 'rgba(5,150,105,0.15)',
                      border: `1px solid ${u.role === 'admin' ? 'rgba(248,113,113,0.35)' : 'rgba(5,150,105,0.35)'}`,
                      color: u.role === 'admin' ? '#f87171' : '#34d399',
                      borderRadius: 8, padding: '6px 12px', fontSize: 11,
                      cursor: 'pointer', fontFamily: "'Inter', sans-serif",
                      display: 'flex', alignItems: 'center', gap: 4,
                      transition: 'all 0.2s',
                    }}
                    onMouseEnter={e => {
                      e.currentTarget.style.background = u.role === 'admin'
                        ? 'rgba(248,113,113,0.2)' : 'rgba(5,150,105,0.25)';
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.background = u.role === 'admin'
                        ? 'rgba(248,113,113,0.1)' : 'rgba(5,150,105,0.15)';
                    }}
                  >
                    {u.role === 'admin' ? <><UserX size={12} /> Demote</> : <><UserCheck size={12} /> Promote</>}
                  </button>
                )}
              </span>
            </motion.div>
          ))}

          {/* Footer */}
          <div style={{
            padding: '12px 20px',
            borderTop: '1px solid #353230',
            fontFamily: "'Inter', sans-serif", fontSize: 10, color: '#78716c',
          }}>
            {users.length} user{users.length !== 1 ? 's' : ''} total
          </div>
        </div>
      )}
    </motion.div>
  );
}
