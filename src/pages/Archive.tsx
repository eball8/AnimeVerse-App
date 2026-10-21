import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Archive as ArchiveIcon, ArchiveRestore, Loader2, Users } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useI18n } from '../i18n/I18nContext';
import Avatar from '../components/Avatar';
import E2EEGate from '../components/E2EEGate';
import { subscribeConversations } from '../services/chatService';
import type { Conversation } from '../services/chatService';
import { isInArchive, setChatPref, subscribeChatPrefs } from '../services/chatPrefsService';
import type { ChatPrefMap } from '../services/chatPrefsService';
import { useUserBriefs } from '../services/userCache';
import { timeAgo } from '../utils/timeAgo';

const ArchiveList: React.FC<{ me: string }> = ({ me }) => {
  const { t, lang } = useI18n();
  const navigate = useNavigate();
  const [all, setAll] = useState<Conversation[] | null>(null);
  const [prefs, setPrefs] = useState<ChatPrefMap | null>(null);
  const [err, setErr] = useState('');

  useEffect(() => subscribeConversations(me, setAll), [me]);
  useEffect(() => subscribeChatPrefs(me, setPrefs), [me]);

  const items = all && prefs ? all.filter((c) => isInArchive(c, prefs[c.id])) : null;
  const briefs = useUserBriefs((items || []).filter((c) => c.type !== 'group').map((c) => c.otherUid));

  const unarchive = async (c: Conversation) => {
    setErr('');
    try {
      await setChatPref(me, c.id, { archived: false }, prefs?.[c.id]);
    } catch (e) {
      console.error(e);
      setErr(t('msgManage.fail'));
    }
  };

  if (items === null) return <div className="py-16 flex justify-center"><Loader2 className="w-7 h-7 animate-spin text-primary-500" /></div>;

  if (items.length === 0) return (
    <div className="card p-8 text-center space-y-3 mt-4">
      <ArchiveIcon className="w-12 h-12 text-slate-600 mx-auto" />
      <p className="text-sm font-bold text-white">{t('archive.empty')}</p>
      <p className="text-[11px] text-slate-500">{t('archive.hint')}</p>
    </div>
  );

  return (
    <div className="space-y-2 mt-2">
      <p className="text-[11px] text-slate-500 px-1">{t('archive.hint')}</p>
      {err && <p className="text-xs text-red-400 px-1">{err}</p>}
      {items.map((c) => {
        const isGroup = c.type === 'group';
        const b = !isGroup ? briefs[c.otherUid] : null;
        const name = isGroup ? (c.name || t('chatUi.group')) : (b?.displayName || '...');
        const targetUid = isGroup ? c.id : c.otherUid;
        return (
          <div key={c.id} className="w-full flex items-center gap-3 p-3 rounded-2xl border bg-white/5 border-white/10">
            <button type="button" onClick={() => navigate(`/messages/${targetUid}`)} className="flex items-center gap-3 flex-1 min-w-0 text-start">
              {isGroup ? (
                <div className="w-12 h-12 rounded-full bg-slate-800 flex items-center justify-center border border-white/10 shrink-0"><Users className="w-5 h-5 text-slate-400" /></div>
              ) : (
                <Avatar src={b?.photoURL} seed={c.otherUid} name={name} className="w-12 h-12 rounded-full object-cover bg-dark-900 shrink-0" />
              )}
              <div className="min-w-0">
                <p className="text-sm font-bold text-white truncate">{name}</p>
                <p className="text-[10px] text-slate-500 mt-0.5">{timeAgo(c.lastMessageAt, lang)}</p>
              </div>
            </button>
            <button
              type="button"
              onClick={() => unarchive(c)}
              className="px-3 py-2 rounded-full bg-white/5 border border-white/10 text-slate-200 text-xs font-bold flex items-center gap-1.5 shrink-0 active:scale-95"
            >
              <ArchiveRestore className="w-4 h-4" /> {t('archive.unarchive')}
            </button>
          </div>
        );
      })}
    </div>
  );
};

const ArchivePage: React.FC = () => {
  const { user } = useAuth();
  const { t, dir } = useI18n();
  const navigate = useNavigate();
  const BackIcon = dir === 'rtl' ? ArrowRight : ArrowLeft;
  if (!user) return null;
  return (
    <div className="px-4 py-4 max-w-2xl mx-auto">
      <div className="flex items-center gap-2 mb-2">
        <button onClick={() => navigate('/settings')} className="p-2 rounded-xl hover:bg-white/10 text-slate-200" aria-label={t('chatUi.back')}><BackIcon className="w-5 h-5" /></button>
        <h2 className="text-base font-black text-white flex items-center gap-2"><ArchiveIcon className="w-5 h-5 text-primary-400" /> {t('archive.title')}</h2>
      </div>
      <E2EEGate><ArchiveList me={user.uid} /></E2EEGate>
    </div>
  );
};

export default ArchivePage;
