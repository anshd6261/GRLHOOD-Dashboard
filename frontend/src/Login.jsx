import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { LogIn, Lock, User, AlertCircle } from 'lucide-react';
import axios from 'axios';
import { useAuth } from './AuthContext';

const Login = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await axios.post('/api/login', { username, password });
      if (res.data.success) {
        login({
          username,
          role: res.data.role,
          token: res.data.token
        });
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Invalid credentials');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center relative overflow-hidden bg-black" style={{ fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif" }}>

      {/* Subtle gradient orbs */}
      <div className="absolute top-[-20%] left-[-15%] w-[600px] h-[600px] bg-white/[0.03] rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-20%] right-[-15%] w-[600px] h-[600px] bg-white/[0.02] rounded-full blur-[120px] pointer-events-none" />

      {/* Noise texture overlay */}
      <div className="absolute inset-0 pointer-events-none opacity-[0.03]"
        style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=\'0 0 256 256\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'noise\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.9\' numOctaves=\'4\' stitchTiles=\'stitch\'/%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23noise)\'/%3E%3C/svg%3E")' }} />

      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        className="relative z-10 w-full max-w-sm mx-4 p-8 sm:p-10 rounded-[28px] border border-white/[0.08] flex flex-col items-center"
        style={{
          background: 'linear-gradient(160deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.02) 100%)',
          backdropFilter: 'blur(40px) saturate(1.2)',
          WebkitBackdropFilter: 'blur(40px) saturate(1.2)',
          boxShadow: '0 25px 60px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.06)',
        }}
      >
        {/* Logo */}
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.2, duration: 0.5 }}
          className="mb-10"
        >
          <img
            src="/logo.png"
            alt="GRLHOOD"
            className="h-20 md:h-24 object-contain brightness-0 invert opacity-90"
          />
        </motion.div>

        <motion.h2
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="text-xl font-semibold text-white/90 mb-1 text-center tracking-wide"
        >
          Welcome Back
        </motion.h2>
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.35 }}
          className="text-white/25 mb-8 text-center text-xs tracking-wide"
        >
          Sign in to continue
        </motion.p>

        {error && (
          <motion.div
            initial={{ opacity: 0, y: -5 }}
            animate={{ opacity: 1, y: 0 }}
            className="w-full bg-white/[0.04] border border-red-500/20 text-red-400/80 p-3 rounded-2xl flex items-center gap-2 mb-5 text-xs"
          >
            <AlertCircle size={14} />
            {error}
          </motion.div>
        )}

        <form onSubmit={handleLogin} className="w-full flex flex-col gap-4">
          <div className="relative group">
            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-white/20 group-focus-within:text-white/50 transition-colors">
              <User size={16} />
            </div>
            <input
              type="text"
              placeholder="Username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              className="w-full bg-white/[0.04] border border-white/[0.08] rounded-2xl py-3.5 pl-11 pr-4 text-sm text-white placeholder-white/20 focus:outline-none focus:border-white/20 focus:bg-white/[0.06] transition-all"
            />
          </div>

          <div className="relative group">
            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-white/20 group-focus-within:text-white/50 transition-colors">
              <Lock size={16} />
            </div>
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full bg-white/[0.04] border border-white/[0.08] rounded-2xl py-3.5 pl-11 pr-4 text-sm text-white placeholder-white/20 focus:outline-none focus:border-white/20 focus:bg-white/[0.06] transition-all"
            />
          </div>

          <motion.button
            type="submit"
            disabled={loading}
            whileTap={{ scale: 0.97 }}
            className="w-full mt-3 rounded-2xl py-3.5 text-sm font-semibold flex items-center justify-center gap-2 transition-all disabled:opacity-40 disabled:pointer-events-none border border-white/[0.12] text-white/90 hover:bg-white/[0.08]"
            style={{
              background: 'linear-gradient(135deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.03) 100%)',
            }}
          >
            {loading ? (
              <div className="w-4 h-4 border-2 border-white/20 border-t-white/70 rounded-full animate-spin" />
            ) : (
              <>
                <span>Sign In</span>
                <LogIn size={15} />
              </>
            )}
          </motion.button>
        </form>

        <div className="mt-6 text-[10px] text-white/10 tracking-widest uppercase">GRLHOOD</div>
      </motion.div>
    </div>
  );
};

export default Login;
