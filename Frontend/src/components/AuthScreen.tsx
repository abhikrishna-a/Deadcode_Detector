import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Lock, Mail, User as UserIcon, Info } from 'lucide-react';
import { authAPI } from '../api/auth';
import { useAuthStore } from '../store/authStore';

interface AuthScreenProps {
  onSuccess: () => void;
  onBack: () => void;
}

export default function AuthScreen({ onSuccess, onBack }: AuthScreenProps) {
  const { login: storeLogin } = useAuthStore();
  const [mode, setMode] = useState<'login' | 'register' | 'forgot' | 'mfa_setup' | 'mfa_verify'>('login');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mfaCode, setMfaCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const [mfaQRImage, setMfaQRImage] = useState('');
  const [preAuthToken, setPreAuthToken] = useState('');
  const [forgotEmail, setForgotEmail] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [resetSent, setResetSent] = useState(false);
  const errorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    if (mode === 'mfa_setup' && preAuthToken && !mfaQRImage) {
      (async () => {
        setLoading(true);
        try {
          const response = await authAPI.setupMFA(preAuthToken);
          if (mounted) setMfaQRImage(response.qr_code_image);
        } catch {
          if (mounted) showError('Unable to generate QR code. Please try again.');
        }
        if (mounted) setLoading(false);
      })();
    }
    return () => { mounted = false; };
  }, [mode, preAuthToken]);

  const showError = (msg: string) => {
    setErrorMsg(msg);
    if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
    errorTimerRef.current = setTimeout(() => setErrorMsg(''), 4000);
  };

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg('');

    try {
      if (mode === 'login') {
        if (!username || !password) {
          showError('Please fill in all fields.');
          setLoading(false);
          return;
        }
        const response = await authAPI.login({ username, password });
        storeLogin(response);
        if (response.mfa_required) {
          setPreAuthToken(response.pre_auth_token);
          setMfaQRImage('');
          setMode(response.is_mfa_enabled ? 'mfa_verify' : 'mfa_setup');
        } else {
          onSuccess?.();
        }
      } else if (mode === 'register') {
        if (!username || !email || !password) {
          showError('Please fill in all fields.');
          setLoading(false);
          return;
        }
        await authAPI.register({ username, email, password });
        setMode('login');
        setErrorMsg('');
      }
    } catch (err: any) {
      const msg =
        err?.response?.data?.detail ||
        err?.response?.data?.username?.[0] ||
        err?.response?.data?.email?.[0] ||
        err?.response?.data?.password?.[0] ||
        err?.response?.data?.token?.[0] ||
        err?.response?.data?.non_field_errors?.[0] ||
        'Invalid credentials. Please try again.';
      showError(msg);
    }
    setLoading(false);
  };

  const handleMfaSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (mfaCode.length !== 6) {
      showError('MFA code must be exactly 6 digits.');
      return;
    }

    setLoading(true);
    setErrorMsg('');

    try {
      if (mode === 'mfa_setup') {
        const response = await authAPI.activateMFA({ token: mfaCode }, preAuthToken);
        storeLogin(response);
        onSuccess();
      } else {
        const response = await authAPI.verifyMFALogin({ token: mfaCode }, preAuthToken);
        storeLogin(response);
        onSuccess();
      }
    } catch (err: any) {
      const msg =
        err?.response?.data?.detail ||
        err?.response?.data?.token?.[0] ||
        'Incorrect code. Please try again.';
      showError(msg);
    }
    setLoading(false);
  };

  const handleMfaSetup = async () => {
    setLoading(true);
    try {
      const response = await authAPI.setupMFA(preAuthToken);
      setMfaQRImage(response.qr_code_image);
    } catch {
      showError('Unable to generate QR code. Please try again.');
    }
    setLoading(false);
  };

  const handlePasswordReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!forgotEmail) {
      showError('Please enter your email.');
      return;
    }
    setLoading(true);
    try {
      if (mode === 'forgot' && !resetSent) {
        await authAPI.requestPasswordReset(forgotEmail);
        setResetSent(true);
        showError('Password reset link sent to your email.');
      } else if (resetToken && newPassword) {
        await authAPI.confirmPasswordReset(resetToken, newPassword);
        showError('Password reset successfully. Please login.');
        setMode('login');
        setResetSent(false);
        setResetToken('');
        setNewPassword('');
      }
    } catch {
      showError('Password reset failed. Check your email or token and try again.');
    }
    setLoading(false);
  };

  return (
    <div className="relative min-h-screen overflow-hidden flex items-center justify-center p-4">
      <div className="absolute inset-0 z-0 pointer-events-none">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-cyan-950/15 rounded-full blur-[140px]" />
      </div>

      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4 }}
        className="relative z-10 w-full max-w-[420px] rounded-3xl p-8 glass-card"
      >
        <button
          onClick={onBack}
          className="absolute top-5 left-6 text-xs text-zinc-500 hover:text-white transition-colors cursor-pointer flex items-center gap-1.5 font-mono"
        >
          ← ESCAPE
        </button>

        <div className="text-center mt-6 mb-7">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-cyan-400 to-purple-600 flex items-center justify-center mx-auto mb-3 shadow-lg shadow-cyan-500/10">
            <span className="font-display font-black text-xs text-white">GC</span>
          </div>
          <h2 className="font-display font-bold text-lg text-zinc-100 tracking-tight">
            {mode === 'login' && 'Sign in to Workspace'}
            {mode === 'register' && 'Create Workspace'}
            {mode === 'forgot' && 'Reset Password'}
            {mode === 'mfa_setup' && 'Setup MFA'}
            {mode === 'mfa_verify' && 'MFA Verification'}
          </h2>
          <p className="text-zinc-500 text-xs font-sans mt-1">
            {mode === 'login' && 'Enter your credentials'}
            {mode === 'register' && 'Create a new account'}
            {mode === 'forgot' && (resetSent ? 'Enter reset token and new password' : 'Enter your email address')}
            {mode === 'mfa_setup' && 'Scan QR code with authenticator app'}
            {mode === 'mfa_verify' && 'Enter 6-digit code from authenticator'}
          </p>
        </div>

        <AnimatePresence>
          {errorMsg && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs px-3.5 py-2.5 rounded-xl mb-5 flex items-center gap-2 font-sans"
            >
              <Info size={14} className="flex-shrink-0" />
              <span>{errorMsg}</span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Login / Register */}
        {(mode === 'login' || mode === 'register') && (
          <form onSubmit={handleAuthSubmit} className="space-y-4">
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500">
                <UserIcon size={14} />
              </span>
              <input
                required
                type="text"
                placeholder="Username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 text-xs text-zinc-200 bg-zinc-950/40 border border-white/[0.06] focus:border-cyan-400/60 rounded-xl outline-none transition-all placeholder:text-zinc-600"
              />
            </div>

            {mode === 'register' && (
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500">
                  <Mail size={14} />
                </span>
                <input
                  required
                  type="email"
                  placeholder="Email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 text-xs text-zinc-200 bg-zinc-950/40 border border-white/[0.06] focus:border-cyan-400/60 rounded-xl outline-none transition-all placeholder:text-zinc-600"
                />
              </div>
            )}

            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500">
                <Lock size={14} />
              </span>
              <input
                required
                type="password"
                minLength={8}
                placeholder="Password (min 8 characters)"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 text-xs text-zinc-200 bg-zinc-950/40 border border-white/[0.06] focus:border-cyan-400/60 rounded-xl outline-none transition-all placeholder:text-zinc-600"
              />
            </div>

            {mode === 'login' && (
              <div className="text-right">
                <button
                  type="button"
                  onClick={() => setMode('forgot')}
                  className="text-[11px] text-zinc-500 hover:text-zinc-300 transition-colors cursor-pointer"
                >
                  Forgot password?
                </button>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 bg-gradient-to-r from-cyan-400 to-purple-600 text-white font-bold text-xs rounded-xl hover:opacity-95 active:scale-[0.98] transition-all cursor-pointer disabled:opacity-40"
            >
              {loading ? 'Processing...' : mode === 'login' ? 'Sign In →' : 'Create Account →'}
            </button>

            <div className="pt-4 border-t border-white/[0.03] text-center">
              <button
                type="button"
                onClick={() => {
                  setMode(mode === 'login' ? 'register' : 'login');
                  setErrorMsg('');
                }}
                className="text-xs text-zinc-400 hover:text-cyan-400 font-sans transition-all cursor-pointer"
              >
                {mode === 'login' ? "Don't have an account? Register" : 'Already have an account? Sign In'}
              </button>
            </div>
          </form>
        )}

        {/* Forgot Password */}
        {mode === 'forgot' && (
          <form onSubmit={handlePasswordReset} className="space-y-4">
            {!resetSent ? (
              <>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500">
                    <Mail size={14} />
                  </span>
                  <input
                    required
                    type="email"
                    placeholder="Your email address"
                    value={forgotEmail}
                    onChange={(e) => setForgotEmail(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 text-xs text-zinc-200 bg-zinc-950/40 border border-white/[0.06] focus:border-cyan-400/60 rounded-xl outline-none transition-all placeholder:text-zinc-600"
                  />
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-2.5 bg-gradient-to-r from-cyan-400 to-purple-600 text-white font-bold text-xs rounded-xl hover:opacity-95 active:scale-[0.98] transition-all cursor-pointer disabled:opacity-40"
                >
                  {loading ? 'Sending...' : 'Send Reset Link →'}
                </button>
              </>
            ) : (
              <>
                <div className="relative">
                  <input
                    required
                    type="text"
                    placeholder="Reset token"
                    value={resetToken}
                    onChange={(e) => setResetToken(e.target.value)}
                    className="w-full pl-4 pr-4 py-2.5 text-xs text-zinc-200 bg-zinc-950/40 border border-white/[0.06] focus:border-cyan-400/60 rounded-xl outline-none transition-all placeholder:text-zinc-600"
                  />
                </div>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500">
                    <Lock size={14} />
                  </span>
                  <input
                    required
                    type="password"
                    placeholder="New password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 text-xs text-zinc-200 bg-zinc-950/40 border border-white/[0.06] focus:border-cyan-400/60 rounded-xl outline-none transition-all placeholder:text-zinc-600"
                  />
                </div>
                <button
                  type="submit"
                  disabled={loading || !resetToken || !newPassword}
                  className="w-full py-2.5 bg-gradient-to-r from-cyan-400 to-purple-600 text-white font-bold text-xs rounded-xl hover:opacity-95 active:scale-[0.98] transition-all cursor-pointer disabled:opacity-40"
                >
                  {loading ? 'Resetting...' : 'Reset Password →'}
                </button>
              </>
            )}

            <div className="text-center">
              <button
                type="button"
                onClick={() => { setMode('login'); setMfaQRImage(''); setResetSent(false); setErrorMsg(''); }}
                className="text-xs text-zinc-400 hover:text-cyan-400 transition-colors cursor-pointer"
              >
                Back to Sign In
              </button>
            </div>
          </form>
        )}

        {/* MFA Setup */}
        {mode === 'mfa_setup' && (
          <form onSubmit={handleMfaSubmit} className="space-y-5 text-center">
            <p className="text-neutral-400 text-xs leading-relaxed max-w-sm mx-auto">
              Scan this QR code with Google Authenticator or any TOTP app to set up multi-factor authentication.
            </p>

            {mfaQRImage ? (
              <div className="bg-white p-3 rounded-xl inline-block shadow-inner mx-auto">
                <img src={mfaQRImage} alt="MFA QR" className="w-[140px] h-[140px]" />
              </div>
            ) : loading ? (
              <div className="text-zinc-500 text-xs py-8">Loading...</div>
            ) : (
              <button
                type="button"
                onClick={handleMfaSetup}
                className="px-6 py-3 bg-cyan-400/10 border border-cyan-400/20 text-cyan-400 rounded-xl text-xs font-semibold hover:bg-cyan-400/20 transition-all cursor-pointer"
              >
                Generate QR Code
              </button>
            )}

            {mfaQRImage && (
              <>
                <div className="space-y-3">
                  <input
                    required
                    type="text"
                    maxLength={6}
                    placeholder="6-digit code"
                    value={mfaCode}
                    onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, ''))}
                    className="w-full py-2.5 text-center font-mono font-bold tracking-[0.4em] text-sm text-cyan-400 bg-zinc-950/40 border border-white/[0.06] focus:border-cyan-400/60 rounded-xl outline-none transition-all placeholder:tracking-normal placeholder:text-zinc-600"
                  />

                  <button
                    type="submit"
                    disabled={loading || mfaCode.length !== 6}
                    className="w-full py-2.5 bg-gradient-to-r from-cyan-400 to-purple-600 text-white font-bold text-xs rounded-xl hover:opacity-95 transition-all cursor-pointer disabled:opacity-40"
                  >
                    {loading ? 'Verifying...' : 'Activate →'}
                  </button>
                </div>
              </>
            )}

            <div className="pt-4 text-center">
              <button
                type="button"
                onClick={() => { setMode('login'); setMfaQRImage(''); }}
                className="text-[10px] text-zinc-500 hover:text-zinc-300 transition-all cursor-pointer"
              >
                Back to Sign In
              </button>
            </div>
          </form>
        )}

        {/* MFA Verify */}
        {mode === 'mfa_verify' && (
          <form onSubmit={handleMfaSubmit} className="space-y-5 text-center">
            <p className="text-neutral-400 text-xs leading-relaxed max-w-sm mx-auto">
              Enter the 6-digit code from your authenticator app to complete sign-in.
            </p>

            <div className="space-y-4">
              <input
                required
                type="text"
                maxLength={6}
                placeholder="000000"
                value={mfaCode}
                onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, ''))}
                className="w-full py-2.5 text-center font-mono font-bold tracking-[0.4em] text-sm text-cyan-400 bg-zinc-950/40 border border-white/[0.06] focus:border-cyan-400/60 rounded-xl outline-none transition-all placeholder:tracking-normal placeholder:text-zinc-600"
              />

              <button
                type="submit"
                disabled={loading || mfaCode.length !== 6}
                className="w-full py-2.5 bg-gradient-to-r from-cyan-400 to-purple-600 text-white font-bold text-xs rounded-xl hover:opacity-95 active:scale-[0.98] transition-all cursor-pointer disabled:opacity-40"
              >
                {loading ? 'Verifying...' : 'Verify & Sign In →'}
              </button>

              <button
                type="button"
                onClick={() => { setMode('login'); setMfaQRImage(''); }}
                className="text-[10px] text-zinc-500 hover:text-zinc-300 transition-all cursor-pointer"
              >
                Back to Sign In
              </button>
            </div>
          </form>
        )}
      </motion.div>
    </div>
  );
}
