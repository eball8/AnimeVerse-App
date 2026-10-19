import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MessageCircle, Lock, Loader2, Search } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useI18n } from '../i18n/I18nContext';
import Avatar from '../components/Avatar';
import E2EEGate from '../components/E2EEGate';
import { subscribeConversations } from '../services/chatService';
import type { Conversation } from '../services/chatService';
import { useUserBriefs } from '../services/userCache';
import { timeAgo } from '../utils/timeAgo';

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
      <div className="card p-8 text-center space-y-4">
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
    <div className="space-y-2">
      {items.map((c) => {
        const b = briefs[c.otherUid];
        const name = b?.displayName || '...';
        return (
          <button
            key={c.id}
            onClick={() => navigate(`/messages/${c.otherUid}`)}
            className="w-full flex items-center gap-3 p-3 rounded-2xl bg-white/5 border border-white/10 text-start"
          >
            <Avatar src={b?.photoURL} seed={c.otherUid} name={name} className="w-12 h-12 rounded-full object-cover bg-dark-900" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-white truncate">{name}</p>
              <p className="text-[11px] text-emerald-400 flex items-center gap-1">
                <Lock className="w-3 h-3" /> {t('chat.encrypted')}
              </p>
            </div>
            <span className="text-[10px] text-slate-500">{timeAgo(c.lastMessageAt, lang)}</span>
          </button>
        );
      })}
    </div>
  );
};

const Messages: React.FC = () => {
  const { user } = useAuth();
  const { t } = useI18n();

  return (
    <div className="px-4 py-6">
      <div className="flex items-center gap-2 mb-4">
        <MessageCircle className="w-6 h-6 text-primary-400" />
        <h2 className="text-xl font-black text-white">{t('chat.title')}</h2>
      </div>
      {user && (
        <E2EEGate>
          <ConversationList me={user.uid} />
        </E2EEGate>
      )}
    </div>
  );
};

export default Messages;
