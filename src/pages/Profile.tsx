import React from 'react';
import { User, Settings, LogOut } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const Profile: React.FC = () => {
  const { user, profile, signOut } = useAuth();

  if (!user) {
    return (
      <div className="px-4 py-6">
        <div className="card p-6 text-center text-slate-400 text-sm">
          سجّل دخولك لعرض ملفك الشخصي.
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 py-6 space-y-4">
      <div className="card p-6 text-center">
        <img
          src={profile?.photoURL || `https://api.dicebear.com/7.x/bottts/svg?seed=${user.uid}`}
          alt=""
          className="w-24 h-24 mx-auto rounded-full object-cover ring-4 ring-primary-500/40 mb-3"
        />
        <h2 className="text-xl font-black text-white">{profile?.displayName}</h2>
        <p className="text-sm text-slate-500">@{profile?.username}</p>
      </div>

      <div className="card divide-y divide-white/5">
        <button className="w-full flex items-center gap-3 p-4 hover:bg-white/5 transition text-right">
          <User className="w-5 h-5 text-primary-400" />
          <span className="text-sm font-bold text-white">معلومات الحساب</span>
        </button>
        <button className="w-full flex items-center gap-3 p-4 hover:bg-white/5 transition text-right">
          <Settings className="w-5 h-5 text-primary-400" />
          <span className="text-sm font-bold text-white">الإعدادات</span>
        </button>
        <button
          onClick={signOut}
          className="w-full flex items-center gap-3 p-4 hover:bg-white/5 transition text-right text-red-400"
        >
          <LogOut className="w-5 h-5" />
          <span className="text-sm font-bold">تسجيل الخروج</span>
        </button>
      </div>
    </div>
  );
};

export default Profile;
