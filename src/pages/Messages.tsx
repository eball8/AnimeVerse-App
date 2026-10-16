import React from 'react';
import { MessageCircle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const Messages: React.FC = () => {
  const { user } = useAuth();

  return (
    <div className="px-4 py-6">
      <div className="flex items-center gap-2 mb-4">
        <MessageCircle className="w-6 h-6 text-primary-400" />
        <h2 className="text-xl font-black text-white">الرسائل</h2>
      </div>
      {!user ? (
        <div className="card p-6 text-center text-slate-400 text-sm">
          سجّل دخولك لاستخدام الرسائل المشفّرة.
        </div>
      ) : (
        <div className="card p-6 text-center text-slate-500 text-sm">
          قيد الإنشاء...
        </div>
      )}
    </div>
  );
};

export default Messages;
