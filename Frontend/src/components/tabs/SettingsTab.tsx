import { useState } from 'react';
import { motion } from 'motion/react';
import { User as UserIcon, Shield, KeyRound, Mail, Copy, Check, Loader2, Smartphone } from 'lucide-react';
import { User } from '../../api/types';
import { authAPI } from '../../api/auth';

interface SettingsTabProps {
  key?: string;
  currentUser: User;
  onShowToast: (msg: string, type: 'success' | 'error' | 'info') => void;
}

export default function SettingsTab({ currentUser, onShowToast }: SettingsTabProps) {
  const [mfaQr, setMfaQr] = useState<string | null>(null);
  const [mfaQrUri, setMfaQrUri] = useState<string | null>(null);
  const [mfaToken, setMfaToken] = useState('');
  const [mfaLoading, setMfaLoading] = useState(false);
  const [mfaActivating, setMfaActivating] = useState(false);
  const [mfaCopied, setMfaCopied] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetSending, setResetSending] = useState(false);

  const handleSetupMFA = async () => {
    setMfaLoading(true);
    try {
      const result = await authAPI.setupMFA();
      setMfaQr(result.qr_code_image);
      setMfaQrUri(result.qr_code_uri);
    } catch {
      onShowToast('Unable to start MFA setup. Please try again.', 'error');
    } finally {
      setMfaLoading(false);
    }
  };

  const handleActivateMFA = async () => {
    if (!mfaToken.trim()) return;
    setMfaActivating(true);
    try {
      await authAPI.activateMFA({ token: mfaToken.trim() });
      onShowToast('MFA activated successfully', 'success');
      setMfaQr(null);
      setMfaQrUri(null);
      setMfaToken('');
    } catch {
      onShowToast('Unable to activate MFA. Check your code and try again.', 'error');
    } finally {
      setMfaActivating(false);
    }
  };

  const handleCopyUri = () => {
    if (mfaQrUri) {
      navigator.clipboard.writeText(mfaQrUri);
      setMfaCopied(true);
      setTimeout(() => setMfaCopied(false), 2000);
    }
  };

  const handlePasswordReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetEmail.trim()) return;
    setResetSending(true);
    try {
      await authAPI.requestPasswordReset(resetEmail.trim());
      onShowToast('Password reset email sent if account exists', 'success');
      setResetEmail('');
    } catch {
      onShowToast('Unable to send reset email. Verify your email address.', 'error');
    } finally {
      setResetSending(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -15 }}
      transition={{ duration: 0.3 }}
      className="space-y-6 text-left max-w-3xl"
    >
      <div className="space-y-1">
        <h2 className="font-display font-bold text-xl text-neutral-200 tracking-tight flex items-center gap-2">
          <UserIcon className="text-cyan-400" size={20} /> Account Settings
        </h2>
        <p className="text-zinc-500 text-xs font-sans">
          Manage your profile, security, and authentication methods.
        </p>
      </div>

      {/* Profile Card */}
      <div
        style={{
          background: 'linear-gradient(135deg, rgba(16, 15, 23, 0.6), rgba(8, 8, 12, 0.7))',
          border: '1px solid rgba(255, 255, 255, 0.03)',
          boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.03)'
        }}
        className="rounded-2xl p-6 backdrop-blur-md space-y-4"
      >
        <h3 className="font-display font-semibold text-sm text-zinc-100 flex items-center gap-2">
          <UserIcon size={14} className="text-cyan-400" /> Profile
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1">
            <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">Username</span>
            <p className="text-sm font-mono text-zinc-200">{currentUser.username}</p>
          </div>
          <div className="space-y-1">
            <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">Email</span>
            <p className="text-sm font-mono text-zinc-200 flex items-center gap-2">
              <Mail size={12} className="text-zinc-600" />
              {currentUser.email}
            </p>
          </div>
          <div className="space-y-1">
            <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">Role</span>
            <p className="text-sm font-mono text-cyan-400 capitalize">{currentUser.role}</p>
          </div>
          <div className="space-y-1">
            <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">MFA Status</span>
            <p className={`text-sm font-mono ${currentUser.is_mfa_enabled ? 'text-emerald-400' : 'text-amber-400'}`}>
              {currentUser.is_mfa_enabled ? 'Active' : 'Not configured'}
            </p>
          </div>
        </div>
      </div>

      {/* MFA Setup */}
      <div
        style={{
          background: 'linear-gradient(135deg, rgba(16, 15, 23, 0.6), rgba(8, 8, 12, 0.7))',
          border: '1px solid rgba(255, 255, 255, 0.03)',
          boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.03)'
        }}
        className="rounded-2xl p-6 backdrop-blur-md space-y-4"
      >
        <h3 className="font-display font-semibold text-sm text-zinc-100 flex items-center gap-2">
          <Shield size={14} className="text-purple-400" /> Multi-Factor Authentication
        </h3>

        {currentUser.is_mfa_enabled ? (
          <div className="flex items-center gap-3 px-4 py-3 bg-emerald-500/5 border border-emerald-500/10 rounded-xl">
            <Shield size={18} className="text-emerald-400 flex-shrink-0" />
            <div>
              <p className="text-xs text-emerald-300 font-semibold">MFA is active</p>
              <p className="text-[11px] text-zinc-500 font-sans">Your account is secured with TOTP two-factor authentication.</p>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {!mfaQr ? (
              <button
                onClick={handleSetupMFA}
                disabled={mfaLoading}
                className="px-5 py-2.5 text-xs font-semibold rounded-xl bg-gradient-to-r from-purple-500 to-violet-600 text-white hover:opacity-90 disabled:opacity-40 transition-all cursor-pointer flex items-center gap-2"
              >
                {mfaLoading ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Smartphone size={14} />
                )}
                {mfaLoading ? 'Setting up...' : 'Enable MFA'}
              </button>
            ) : (
              <div className="space-y-4">
                <div className="flex items-start gap-4">
                  <img
                    src={`data:image/png;base64,${mfaQr}`}
                    alt="MFA QR Code"
                    className="w-36 h-36 rounded-xl border border-white/[0.06] bg-white"
                  />
                  <div className="space-y-2 flex-1">
                    <p className="text-xs text-zinc-300 font-sans">
                      Scan this QR code with your authenticator app (Google Authenticator, Authy, etc.),
                      then enter the 6-digit code below to activate.
                    </p>
                    <button
                      onClick={handleCopyUri}
                      className="text-[11px] font-mono text-zinc-500 hover:text-cyan-400 transition-colors flex items-center gap-1.5 cursor-pointer"
                    >
                      {mfaCopied ? <Check size={12} /> : <Copy size={12} />}
                      {mfaCopied ? 'Copied!' : 'Copy setup URI'}
                    </button>
                  </div>
                </div>

                <div className="flex gap-2 max-w-xs">
                  <input
                    type="text"
                    placeholder="Enter 6-digit code"
                    value={mfaToken}
                    onChange={e => setMfaToken(e.target.value)}
                    maxLength={6}
                    className="flex-1 px-3 py-2 text-xs text-zinc-300 bg-white/[0.01] border border-white/[0.06] focus:border-purple-400/40 rounded-xl outline-none transition-all placeholder:text-zinc-500 font-mono tracking-widest text-center"
                  />
                  <button
                    onClick={handleActivateMFA}
                    disabled={mfaActivating || mfaToken.length !== 6}
                    className="px-4 py-2 text-xs font-semibold rounded-xl bg-gradient-to-r from-purple-500 to-violet-600 text-white hover:opacity-90 disabled:opacity-40 transition-all cursor-pointer flex items-center gap-1.5"
                  >
                    {mfaActivating ? (
                      <Loader2 size={12} className="animate-spin" />
                    ) : (
                      'Verify'
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Password Reset */}
      <div
        style={{
          background: 'linear-gradient(135deg, rgba(16, 15, 23, 0.6), rgba(8, 8, 12, 0.7))',
          border: '1px solid rgba(255, 255, 255, 0.03)',
          boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.03)'
        }}
        className="rounded-2xl p-6 backdrop-blur-md space-y-4"
      >
        <h3 className="font-display font-semibold text-sm text-zinc-100 flex items-center gap-2">
          <KeyRound size={14} className="text-amber-400" /> Password Reset
        </h3>
        <p className="text-xs text-zinc-500 font-sans">
          Request a password reset link. It will be sent to your registered email if the account exists.
        </p>
        <form onSubmit={handlePasswordReset} className="flex gap-2 max-w-sm">
          <input
            type="email"
            placeholder="Enter your email"
            value={resetEmail}
            onChange={e => setResetEmail(e.target.value)}
            required
            className="flex-1 px-3 py-2 text-xs text-zinc-300 bg-white/[0.01] border border-white/[0.06] focus:border-amber-400/40 rounded-xl outline-none transition-all placeholder:text-zinc-500"
          />
          <button
            type="submit"
            disabled={resetSending || !resetEmail.trim()}
            className="px-4 py-2 text-xs font-semibold rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 text-white hover:opacity-90 disabled:opacity-40 transition-all cursor-pointer flex items-center gap-1.5"
          >
            {resetSending ? (
              <Loader2 size={12} className="animate-spin" />
            ) : (
              'Send'
            )}
          </button>
        </form>
      </div>
    </motion.div>
  );
}
