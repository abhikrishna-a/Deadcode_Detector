import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { authAPI } from '../../../api/auth';
import { useAuthStore } from '../../../store/authStore';
import Btn from '../../ui/Btn';
import Toast from '../../ui/Toast';
import { parseApiError } from '../../../lib/apiError';

export default function AdminTab() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);
  const currentUser = useAuthStore((s) => s.user);

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

      <h2 style={{ fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 22, color: '#fff5eb', marginBottom: 8 }}>
        User Management
      </h2>
      <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: '#6b7280', marginBottom: 28, letterSpacing: 0.5 }}>
        MANAGE USER ROLES — ADMIN ACCESS ONLY
      </p>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '60px 0', color: '#6b7280' }}>
          <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 13 }}>Loading users...</p>
        </div>
      ) : users.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 0', color: '#6b7280' }}>
          <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 13 }}>No users found.</p>
        </div>
      ) : (
        <div style={{
          background: 'rgba(255,255,255,0.02)',
          border: '1px solid rgba(249,115,22,0.1)',
          borderRadius: 16, overflow: 'hidden',
        }}>
          {/* Table Header */}
          <div style={{
            display: 'grid', gridTemplateColumns: '2fr 2fr 1fr 1.2fr 1.5fr',
            gap: 12, padding: '14px 20px',
            borderBottom: '1px solid rgba(249,115,22,0.08)',
            fontFamily: "'DM Mono', monospace", fontSize: 10, color: '#6b7280',
            textTransform: 'uppercase', letterSpacing: 0.5,
          }}>
            <span>Username</span>
            <span>Email</span>
            <span>Role</span>
            <span>MFA Status</span>
            <span>Actions</span>
          </div>

          {/* Table Rows */}
          {users.map((u, idx) => (
            <motion.div
              key={u.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.03 }}
              style={{
                display: 'grid', gridTemplateColumns: '2fr 2fr 1fr 1.2fr 1.5fr',
                gap: 12, padding: '14px 20px',
                borderBottom: idx < users.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none',
                alignItems: 'center',
                transition: 'background 0.15s',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.02)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
            >
              <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 13, color: '#f5ede0' }}>
                {u.username}
              </span>
              <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, color: '#6b7280' }}>
                {u.email}
              </span>
              <span>
                <span style={{
                  background: u.role === 'admin' ? 'rgba(249,115,22,0.15)' : 'rgba(255,255,255,0.05)',
                  border: `1px solid ${u.role === 'admin' ? 'rgba(249,115,22,0.3)' : 'rgba(255,255,255,0.1)'}`,
                  borderRadius: 12, padding: '2px 10px',
                  fontSize: 10, color: u.role === 'admin' ? '#fb923c' : '#6b7280',
                  fontFamily: "'DM Mono', monospace",
                }}>
                  {u.role}
                </span>
              </span>
              <span style={{
                fontFamily: "'DM Mono', monospace", fontSize: 12,
                color: u.is_mfa_enabled ? '#4ade80' : '#6b7280',
              }}>
                {u.is_mfa_enabled ? 'Enabled' : 'Disabled'}
              </span>
              <span>
                {currentUser && u.id === currentUser.id ? (
                  <span style={{ fontSize: 11, color: '#6b7280', fontFamily: "'DM Mono', monospace" }}>
                    Cannot change own role
                  </span>
                ) : (
                  <button
                    onClick={() => handleRoleChange(u.id, u.role === 'admin' ? 'viewer' : 'admin')}
                    style={{
                      background: u.role === 'admin'
                        ? 'rgba(248,113,113,0.1)'
                        : 'rgba(249,115,22,0.15)',
                      border: `1px solid ${u.role === 'admin' ? 'rgba(248,113,113,0.35)' : 'rgba(249,115,22,0.35)'}`,
                      color: u.role === 'admin' ? '#f87171' : '#fb923c',
                      borderRadius: 8, padding: '6px 14px', fontSize: 11,
                      cursor: 'pointer', fontFamily: "'DM Mono', monospace",
                      transition: 'all 0.2s',
                    }}
                    onMouseEnter={e => {
                      e.currentTarget.style.background = u.role === 'admin'
                        ? 'rgba(248,113,113,0.2)' : 'rgba(249,115,22,0.25)';
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.background = u.role === 'admin'
                        ? 'rgba(248,113,113,0.1)' : 'rgba(249,115,22,0.15)';
                    }}
                  >
                    {u.role === 'admin' ? 'Demote to Viewer' : 'Promote to Admin'}
                  </button>
                )}
              </span>
            </motion.div>
          ))}

          {/* Footer */}
          <div style={{
            padding: '12px 20px',
            borderTop: '1px solid rgba(249,115,22,0.08)',
            fontFamily: "'DM Mono', monospace", fontSize: 10, color: '#6b7280',
          }}>
            {users.length} user{users.length !== 1 ? 's' : ''} total
          </div>
        </div>
      )}
    </motion.div>
  );
}
