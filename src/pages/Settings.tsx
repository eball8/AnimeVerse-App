import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight, User, Lock, Shield, Smartphone, PlayCircle,
  Palette, Trash2, MessageSquare, Info, LogOut, ChevronLeft,
  CheckCircle2, AlertCircle, Eye, EyeOff, Loader2, ShieldCheck
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { clearAppCache } from '../services/nativeCache';
import { useTheme } from '../context/ThemeContext';

const Settings: React.FC = () => {
  const navigate = useNavigate();
  const { user, profile, signOut } = useAuth();
  const { theme, setTheme } = useTheme();
  
  const [activeSection, setActiveSection] = useState<string>('main');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  if (!user) {
    navigate('/login');
    return null;
  }

  const handleClearCache = async () => {
    setLoading(true);
    try {
      await clearAppCache();
      setMessage('تم مسح التخزين المؤقت بنجاح!');
      setTimeout(() => setMessage(''), 3000);
    } catch (e) {
      setError('فشل مسح الكاش.');
    } finally {
      setLoading(false);
    }
  };

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  const renderContent = () => {
    if (activeSection === 'main') {
      return (
        <div className="space-y-6">
          {/* Account Section */}
          <div>
            <h3 className="text-xs font-black text-primary-400 mb-2 px-1">الحساب</h3>
            <div className="card divide-y divide-white/5">
              <button onClick={() => setActiveSection('account')} className="w-full flex items-center justify-between p-4 hover:bg-white/5 text-right">
                <div className="flex items-center gap-3">
                  <User className="w-5 h-5 text-slate-400" />
                  <span className="text-sm font-bold text-white">البيانات الشخصية</span>
                </div>
                <ChevronLeft className="w-4 h-4 text-slate-500" />
              </button>
              <button onClick={() => setActiveSection('security')} className="w-full flex items-center justify-between p-4 hover:bg-white/5 text-right">
                <div className="flex items-center gap-3">
                  <Shield className="w-5 h-5 text-slate-400" />
                  <span className="text-sm font-bold text-white">الأمان وتغيير كلمة السر</span>
                </div>
                <ChevronLeft className="w-4 h-4 text-slate-500" />
              </button>
              <button onClick={() => setActiveSection('devices')} className="w-full flex items-center justify-between p-4 hover:bg-white/5 text-right">
                <div className="flex items-center gap-3">
                  <Smartphone className="w-5 h-5 text-slate-400" />
                  <span className="text-sm font-bold text-white">الأجهزة النشطة والثقة</span>
                </div>
                <ChevronLeft className="w-4 h-4 text-slate-500" />
              </button>
            </div>
          </div>

          {/* Privacy Section */}
          <div>
            <h3 className="text-xs font-black text-primary-400 mb-2 px-1">الخصوصية والرسائل</h3>
            <div className="card divide-y divide-white/5">
              <button onClick={() => setActiveSection('privacy')} className="w-full flex items-center justify-between p-4 hover:bg-white/5 text-right">
                <div className="flex items-center gap-3">
                  <Lock className="w-5 h-5 text-slate-400" />
                  <span className="text-sm font-bold text-white">نوع الحساب وطلبات المراسلة</span>
                </div>
                <ChevronLeft className="w-4 h-4 text-slate-500" />
              </button>
              <button onClick={() => setActiveSection('e2ee')} className="w-full flex items-center justify-between p-4 hover:bg-white/5 text-right">
                <div className="flex items-center gap-3">
                  <MessageSquare className="w-5 h-5 text-slate-400" />
                  <span className="text-sm font-bold text-white">التشفير التام (E2EE)</span>
                </div>
                <ChevronLeft className="w-4 h-4 text-slate-500" />
              </button>
            </div>
          </div>

          {/* Playback & Appearance */}
          <div>
            <h3 className="text-xs font-black text-primary-400 mb-2 px-1">التشغيل والمظهر</h3>
            <div className="card divide-y divide-white/5">
              <button onClick={() => setActiveSection('player')} className="w-full flex items-center justify-between p-4 hover:bg-white/5 text-right">
                <div className="flex items-center gap-3">
                  <PlayCircle className="w-5 h-5 text-slate-400" />
                  <span className="text-sm font-bold text-white">المشغل الافتراضي (EZV)</span>
                </div>
                <ChevronLeft className="w-4 h-4 text-slate-500" />
              </button>
              <button onClick={() => setActiveSection('theme')} className="w-full flex items-center justify-between p-4 hover:bg-white/5 text-right">
                <div className="flex items-center gap-3">
                  <Palette className="w-5 h-5 text-slate-400" />
                  <span className="text-sm font-bold text-white">المظهر (الوضع الداكن)</span>
                </div>
                <ChevronLeft className="w-4 h-4 text-slate-500" />
              </button>
              <button onClick={handleClearCache} disabled={loading} className="w-full flex items-center justify-between p-4 hover:bg-white/5 text-right">
                <div className="flex items-center gap-3">
                  <Trash2 className="w-5 h-5 text-slate-400" />
                  <span className="text-sm font-bold text-white">مسح التخزين المؤقت (الكاش)</span>
                </div>
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ChevronLeft className="w-4 h-4 text-slate-500" />}
              </button>
            </div>
          </div>

          {/* Support & Info */}
          <div>
            <h3 className="text-xs font-black text-primary-400 mb-2 px-1">الدعم والمعلومات</h3>
            <div className="card divide-y divide-white/5">
              <button onClick={() => setActiveSection('support')} className="w-full flex items-center justify-between p-4 hover:bg-white/5 text-right">
                <div className="flex items-center gap-3">
                  <AlertCircle className="w-5 h-5 text-slate-400" />
                  <span className="text-sm font-bold text-white">الإبلاغ عن مشكلة</span>
                </div>
                <ChevronLeft className="w-4 h-4 text-slate-500" />
              </button>
              <button onClick={() => setActiveSection('about')} className="w-full flex items-center justify-between p-4 hover:bg-white/5 text-right">
                <div className="flex items-center gap-3">
                  <Info className="w-5 h-5 text-slate-400" />
                  <span className="text-sm font-bold text-white">حول التطبيق والإصدار</span>
                </div>
                <ChevronLeft className="w-4 h-4 text-slate-500" />
              </button>
            </div>
          </div>

          <button onClick={handleSignOut} className="w-full py-3 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm font-bold flex items-center justify-center gap-2 hover:bg-red-500/20 transition">
            <LogOut className="w-4 h-4" /> تسجيل الخروج
          </button>
        </div>
      );
    }

    // --- Sub-sections (Placeholders for now, we'll build them next) ---
    return (
      <div className="space-y-4">
        <button onClick={() => setActiveSection('main')} className="flex items-center gap-2 text-sm text-primary-400 font-bold mb-4">
          <ArrowRight className="w-4 h-4" /> رجوع للإعدادات
        </button>
        
        <div className="card p-6 text-center">
          <h2 className="text-lg font-black text-white mb-2">
            {activeSection === 'account' && 'البيانات الشخصية'}
            {activeSection === 'security' && 'الأمان وتغيير كلمة السر'}
            {activeSection === 'devices' && 'الأجهزة النشطة والثقة'}
            {activeSection === 'privacy' && 'الخصوصية والمراسلة'}
            {activeSection === 'e2ee' && 'التشفير التام (E2EE)'}
            {activeSection === 'player' && 'المشغل الافتراضي'}
            {activeSection === 'theme' && 'المظهر'}
            {activeSection === 'support' && 'الإبلاغ عن مشكلة'}
            {activeSection === 'about' && 'حول التطبيق'}
          </h2>
          <p className="text-sm text-slate-400">سيتم إضافة تفاصيل هذا القسم قريباً.</p>
        </div>
      </div>
    );
  };

  return (
    <div className="px-4 py-6 space-y-4">
      <div className="flex items-center gap-3 mb-2">
        {activeSection === 'main' ? (
          <button onClick={() => navigate('/profile')} className="p-2 rounded-xl hover:bg-white/10 text-slate-300">
            <ArrowRight className="w-5 h-5" />
          </button>
        ) : null}
        <h2 className="text-xl font-black text-white">
          {activeSection === 'main' ? 'الإعدادات' : ''}
        </h2>
      </div>

      {message && (
        <div className="p-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          <p className="text-xs text-emerald-300">{message}</p>
        </div>
      )}

      {renderContent()}
    </div>
  );
};

export default Settings;
