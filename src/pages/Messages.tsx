import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MessageCircle, Lock, Loader2, Search, Plus, Bell } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useI18n } from '../i18n/I18nContext';
import Avatar from '../components/Avatar';
import E2EEGate from '../components/E2EEGate';
import { subscribeConversations, subscribeStories } from '../services/chatService';
import type { Conversation, Story } from '../services/chatService';
import { useUserBriefs } from '../services/userCache';
import { timeAgo } from '../utils/timeAgo';

// ==========================================
// 1. مكون شريط القصص (Stories Bar)
// ==========================================
const StoriesBar: React.FC<{ myPhoto?: string | null; myName?: string; myUid: string }> = ({ myPhoto, myName, myUid }) => {
  const [stories, setStories] = useState<Story[]>([]);
  const briefs = useUserBriefs(stories.map(s => s.userId));

  useEffect(() => {
    const unsub = subscribeStories(setStories);
    return () => unsub();
  }, []);

  return (
    <div className="flex gap-4 overflow-x-auto pb-4 pt-2 px-1 scrollbar-hide">
      {/* قصتي أنا */}
      <div className="flex flex-col items-center gap-1 shrink-0">
        <div className="relative p-[2px] rounded-full bg-white/10">
          <div className="bg-dark-950 rounded-full p-[2px]">
            <Avatar src={myPhoto} seed={myUid} name={myName} className="w-16 h-16 rounded-full object-cover" />
          </div>
          <div className="absolute bottom-0 right-0 bg-blue-500 rounded-full p-1 border-2 border-dark-950 cursor-pointer">
            <Plus className="w-3 h-3 text-white" />
          </div>
        </div>
        <span className="text-[10px] text-slate-300 truncate w-16 text-center">قصتي</span>
      </div>

      {/* قصص الآخرين الحقيقية */}
      {stories.map((story) => {
        const b = briefs[story.userId];
        const name = b?.displayName || '...';
        return (
          <div key={story.id} className="flex flex-col items-center gap-1 shrink-0">
            <div className={`relative p-[2px] rounded-full bg-gradient-to-tr from-yellow-400 via-red-500 to-purple-500`}>
              <div className="bg-dark-950 rounded-full p-[2px]">
                <Avatar
                  src={b?.photoURL}
                  seed={story.userId}
                  name={name}
                  className="w-16 h-16 rounded-full object-cover"
                />
              </div>
            </div>
            <span className="text-[10px] text-slate-300 truncate w-16 text-center">
              {name}
            </span>
          </div>
        );
      })}
    </div>
  );
};

// ==========================================
// 2. مكون قائمة المحادثات
// ==========================================
const ConversationList: React.FC<{ me: string }> = ({ me }) => {
  const { t, lang } = useI18n();
  const navigate = useNavigate();
  const [items, setItems] = useState<Conversation[] | null>(null);
  const briefs = useUserBriefs((items || []).map((c) => c.otherUid));

  useEffect(() => subscribeConversations(me, setItems), [me]);

  if (items === null) {
    return (
      <div className="py-16 flex justify-center">
        <Loader2 className="w-7 h-7 animate-spin text-primary-500" />
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="card p-8 text-center space-y-4 mt-4">
        <MessageCircle className="w-12 h-12 text-slate-600 mx-auto" />
        <p className="text-sm font-bold text-white">{t('chat.empty')}</p>
        <p className="text-xs text-slate-400 leading-relaxed">{t('chat.emptyHint')}</p>
        <button onClick={() => navigate('/search')} className="btn-primary px-6 py-2 inline-flex items-center gap-2">
          <Search className="w-4 h-4" /> {t('header.search')}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-2 mt-2">
      {items.map((c) => {
        const b = briefs[c.otherUid];
        const name = b?.displayName || '...';

        return (
          <button
            key={c.id}
            onClick={() => navigate(`/messages/${c.otherUid}`)}
            className="w-full flex items-center gap-3 p-3 rounded-2xl bg-white/5 border border-white/10 text-start hover:bg-white/10 transition"
          >
            <div className="relative shrink-0">
              <Avatar src={b?.photoURL} seed={c.otherUid} name={name} className="w-14 h-14 rounded-full object-cover bg-dark-900" />
              <span className="absolute bottom-0 right-0 w-3.5 h-3.5 bg-green-500 border-2 border-dark-950 rounded-full"></span>
            </div>
            
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-white truncate">{name}</p>
              <p className="text-[11px] text-emerald-400 flex items-center gap-1 mt-0.5">
                <Lock className="w-3 h-3" /> {t('chat.encrypted')}
              </p>
            </div>
            
            <div className="flex flex-col items-end gap-1.5 shrink-0">
              <span className="text-[10px] text-slate-500">{timeAgo(c.lastMessageAt, lang)}</span>
            </div>
          </button>
        );
      })}
    </div>
  );
};

// ==========================================
// 3. الصفحة الرئيسية (Messages)
// ==========================================
const Messages: React.FC = () => {
  const { user } = useAuth();
  const { t } = useI18n();
  const navigate = useNavigate();

  return (
    <div className="px-4 py-6 max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <MessageCircle className="w-6 h-6 text-primary-400" />
          <h2 className="text-xl font-black text-white">{t('chat.title')}</h2>
        </div>
        <div className="flex items-center gap-3">
           <button onClick={() => navigate('/search')} className="p-2 bg-white/5 rounded-full text-slate-300 hover:text-white transition">
             <Search className="w-5 h-5" />
           </button>
           <button className="relative p-2 bg-white/5 rounded-full text-slate-300 hover:text-white transition">
             <Bell className="w-5 h-5" />
             <span className="absolute top-1 right-1 w-2.5 h-2.5 bg-red-500 border-2 border-dark-950 rounded-full"></span>
           </button>
        </div>
      </div>

      <StoriesBar myPhoto={user?.photoURL} myName={user?.displayName || ''} myUid={user?.uid || ''} />

      {user && (
        <E2EEGate>
          <ConversationList me={user.uid} />
        </E2EEGate>
      )}
    </div>
  );
};

export default Messages;
