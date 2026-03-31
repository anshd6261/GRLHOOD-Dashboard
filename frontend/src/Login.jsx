import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { LogIn, Lock, User, AlertCircle } from 'lucide-react';
import axios from 'axios';
import { useAuth } from './AuthContext';
import DottedBackground from './components/DottedBackground';
import GlowBlobs from './components/GlowBlobs';

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
    <div className="min-h-screen w-full flex items-center justify-center relative overflow-hidden bg-[#0e0e11] font-sans">

      {/* Same background as dashboard */}
      <DottedBackground />
      <GlowBlobs />

      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: "easeOut" }}
        className="relative z-10 w-full max-w-md p-8 sm:p-12 rounded-[32px] flex flex-col items-center"
        style={{
          background: 'rgba(255,255,255,0.04)',
          backdropFilter: 'blur(60px) saturate(1)',
          WebkitBackdropFilter: 'blur(60px) saturate(1)',
          boxShadow: '0 30px 80px rgba(0,0,0,0.4), inset 0 0.5px 0 rgba(255,255,255,0.06)',
        }}
      >
        <div className="w-full flex justify-center mb-12">
          <img
            src="/logo.png"
            alt="GRLHOOD"
            className="h-24 md:h-32 object-contain drop-shadow-[0_0_20px_rgba(255,255,255,0.25)] logo-tint"
          />
        </div>

        <h2 className="text-2xl font-semibold text-white mb-2 text-center tracking-wide">Welcome Back</h2>
        <p className="text-white/40 mb-8 text-center text-sm">Sign in to access the fulfillment dashboard</p>

        {error && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full bg-red-500/10 border border-red-500/20 text-red-400 p-3 rounded-xl flex items-center gap-2 mb-6 text-sm"
          >
            <AlertCircle size={16} />
            {error}
          </motion.div>
        )}

        <form onSubmit={handleLogin} className="w-full flex flex-col gap-5">
          <div className="relative group">
            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-white/30 group-focus-within:text-white/70 transition-colors">
              <User size={18} />
            </div>
            <input
              type="text"
              placeholder="Username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              className="w-full bg-white/5 border border-white/10 rounded-2xl py-3.5 pl-11 pr-4 text-white placeholder-white/30 focus:outline-none focus:border-white/30 focus:bg-white/10 transition-all"
            />
          </div>

          <div className="relative group">
            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-white/30 group-focus-within:text-white/70 transition-colors">
              <Lock size={18} />
            </div>
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full bg-white/5 border border-white/10 rounded-2xl py-3.5 pl-11 pr-4 text-white placeholder-white/30 focus:outline-none focus:border-white/30 focus:bg-white/10 transition-all"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full mt-2 bg-[#e3cfd8] hover:bg-white text-black font-semibold rounded-2xl py-3.5 flex items-center justify-center gap-2 transition-all active:scale-[0.98] shadow-[0_0_20px_rgba(227,207,216,0.3)] disabled:opacity-50 disabled:pointer-events-none"
          >
            {loading ? (
              <div className="w-5 h-5 border-2 border-black/30 border-t-black rounded-full animate-spin" />
            ) : (
              <>
                <span>Sign In</span>
                <LogIn size={18} />
              </>
            )}
          </button>
        </form>
      </motion.div>
    </div>
  );
};

export default Login;
