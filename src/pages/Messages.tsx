import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MessageCircle, Lock, Loader2, Search, Plus, Bell, Users, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useI18n } from '../i18n/I18nContext';
import Avatar from '../components/Avatar';
import E2EEGate from '../components/E2EEGate';
import { subscribeConversations, subscribeStories, createGroup } from '../services/chatService';
import type { Conversation, Story } from '../services/chatService';
import { useUserBriefs } from '../services/userCache';
import { timeAgo } from '../utils/timeAgo';

// ==========================================
// نافذة إنشاء مجموعة
// ==========================================
const CreateGroupModal: React.FC<{ me: string; onClose: () => void; onCreated: (groupId: string) => void }> = ({ me, onClose, onCreated }) => {
  const [step, setStep] = useState<1 | 2>(1);
  const [name, setName] = useState('');
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const [convs, setConvs] = useState<Conversation[]>([]);
  const briefs = useUserBriefs(convs.map(c => c.otherUid));

  useEffect(() => {
    const unsub = subscribeConversations(me, setConvs);
    return () => unsub();
  }, [me]);

  const handleCreate = async () => {
    if (!name.trim() || selectedUsers.length === 0) return;
    const groupId = await createGroup(me, name.trim(), selectedUsers);
    onCreated(groupId);
  };

  const toggleUser = (uid: string) => {
    setSelectedUsers(prev => prev.includes(uid) ? prev.filter(id => id !== uid) : [...prev, uid]);
  };

  return (
    <div className="fixed inset-0 z-[120] bg-black/80 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-dark-900 w-full max-w-sm rounded-2xl overflow-hidden border border-white/10" onClick={e => e.stopPropagation()}>
        <div className="p-4 border-b border-white/10 flex justify-between items-center">
          <h3 className="text-white font-bold">{step === 1 ? 'اختر الأعضاء' : 'اسم المجموعة'}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white"><X className="w-5 h-5"/></button>
        </div>
        
        <div className="p-4">
          {step === 1 ? (
            <div className="max-h-64 overflow-y-auto space-y-2">
              {convs.filter(c => c.type !== 'group').map(c => {
                const b = briefs[c.otherUid];
                return (
                  <button key={c.id} onClick={() => toggleUser(c.otherUid)} className="w-full flex items-center gap-3 p-2 hover:bg-white/5 rounded-xl transition">
                    <Avatar src={b?.photoURL} seed={c.otherUid} name={b?.displayName} className="w-10 h-10 rounded-full" />
                    <span className="flex-1 text-sm font-bold text-white text-start">{b?.displayName || '...'}</span>
                    <div className={`w-5 h-5 rounded-full border-2 ${selectedUsers.includes(c.otherUid) ? 'bg-primary-500 border-primary-500' : 'border-slate-500'}`} />
                  </button>
                );
              })}
            </div>
          ) : (
            <input value={name} onChange={e => setName(e.target.value)} placeholder="اسم المجموعة..." className="w-full p-3 rounded-xl bg-dark-800 border border-white/10 text-white outline-none focus:border-primary-500" />
          )}
        </div>

        <div className="p-4 border-t border-white/10 flex justify-end gap-2">
          {step === 2 && <button onClick={() => setStep(1)} className="px-4 py-2 text-slate-300">رجوع</button>}
          {step === 1 ? (
            <button onClick={() => setStep(2)} disabled={selectedUsers.length === 0} className="btn-primary px-6 py-2 rounded-xl disabled:opacity-50">التالي</button>
          ) : (
            <button onClick={handleCreate} disabled={!name.trim()} className="btn-primary px-6 py-2 rounded-xl disabled:opacity-50">إنشاء</button>
          )}
        </div>
      </div>
    </div>
  );
};

// ==========================================
// شريط القصص
// ==========================================
const StoriesBar: React.FC<{ myPhoto?: string | null; myName?: string; myUid: string }> = ({ myPhoto, myName, myUid }) => {
  const [stories, setStories] = useState<Story[]>([]);
  const briefs = useUserBriefs(stories.map(s => s.userId));
  useEffect(() => { const unsub = subscribeStories(setStories); return () => unsub(); }, []);

  return (
    <div className="flex gap-4 overflow-x-auto pb-4 pt-2 px-1 scrollbar-hide">
      <div className="flex flex-col items-center gap-1 shrink-0">
        <div className="relative p-[2px] rounded-full bg-white/10">
          <div className="bg-dark-950 rounded-full p-[2px]">
            <Avatar src={myPhoto} seed={myUid} name={myName} className="w-16 h-16 rounded-full object-cover" />
          </div>
          <div className="absolute bottom-0 right-0 bg-blue-500 rounded-full p-1 border-2 border-dark-950 cursor-pointer"><Plus className="w-3 h-3 text-white" /></div>
        </div>
        <span className="text-[10px] text-slate-300 truncate w-16 text-center">قصتي</span>
      </div>
      {stories.map((story) => {
        const b = briefs[story.userId];
        return (
          <div key={story.id} className="flex flex-col items-center gap-1 shrink-0">
            <div className={`relative p-[2px] rounded-full bg-gradient-to-tr from-yellow-400 via-red-500 to-purple-500`}>
              <div className="bg-dark-950 rounded-full p-[2px]">
                <Avatar src={b?.photoURL} seed={story.userId} name={b?.displayName} className="w-16 h-16 rounded-full object-cover" />
              </div>
            </div>
            <span className="text-[10px] text-slate-300 truncate w-16 text-center">{b?.displayName || '...'}</span>
          </div>
        );
      })}
    </div>
  );
};

// ==========================================
// قائمة المحادثات (دعم المجموعات)
// ==========================================
const ConversationList: React.FC<{ me: string }> = ({ me }) => {
  const { t, lang } = useI18n();
  const navigate = useNavigate();
  const [items, setItems] = useState<Conversation[] | null>(null);
  const briefs = useUserBriefs((items || []).filter(c => c.type !== 'group').map(c => c.otherUid));

  useEffect(() => subscribeConversations(me, setItems), [me]);

  if (items === null) return <div className="py-16 flex justify-center"><Loader2 className="w-7 h-7 animate-spin text-primary-500" /></div>;

  if (items.length === 0) return (
    <div className="card p-8 text-center space-y-4 mt-4">
      <MessageCircle className="w-12 h-12 text-slate-600 mx-auto" />
      <p className="text-sm font-bold text-white">{t('chat.empty')}</p>
      <button onClick={() => navigate('/search')} className="btn-primary px-6 py-2 inline-flex items-center gap-2"><Search className="w-4 h-4" /> {t('header.search')}</button>
    </div>
  );

  return (
    <div className="space-y-2 mt-2">
      {items.map((c) => {
        const isGroup = c.type === 'group';
        const b = !isGroup ? briefs[c.otherUid] : null;
        const name = isGroup ? (c.name || 'مجموعة') : (b?.displayName || '...');
        const avatarSeed = isGroup ? c.id : c.otherUid;
        const avatarSrc = isGroup ? c.photoURL : b?.photoURL;
        const targetUid = isGroup ? c.id : c.otherUid; // في المجموعة، ننتقل إلى معرف المجموعة

        return (
          <button key={c.id} onClick={() => navigate(`/messages/${targetUid}`)} className="w-full flex items-center gap-3 p-3 rounded-2xl bg-white/5 border border-white/10 text-start hover:bg-white/10 transition">
            <div className="relative shrink-0">
              {isGroup ? (
                 <div className="w-14 h-14 rounded-full bg-slate-800 flex items-center justify-center border border-white/10">
                   <Users className="w-6 h-6 text-slate-400" />
                 </div>
              ) : (
                <Avatar src={avatarSrc} seed={avatarSeed} name={name} className="w-14 h-14 rounded-full object-cover bg-dark-900" />
              )}
              {!isGroup && <span className="absolute bottom-0 right-0 w-3.5 h-3.5 bg-green-500 border-2 border-dark-950 rounded-full"></span>}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-white truncate">{name}</p>
              <p className="text-[11px] text-emerald-400 flex items-center gap-1 mt-0.5"><Lock className="w-3 h-3" /> {t('chat.encrypted')}</p>
            </div>
            <div className="flex flex-col items-end gap-1.5 shrink-0"><span className="text-[10px] text-slate-500">{timeAgo(c.lastMessageAt, lang)}</span></div>
          </button>
        );
      })}
    </div>
  );
};

// ==========================================
// الصفحة الرئيسية (Messages)
// ==========================================
const Messages: React.FC = () => {
  const { user } = useAuth();
  const { t } = useI18n();
  const navigate = useNavigate();
  const [showCreateGroup, setShowCreateGroup] = useState(false);

  return (
    <div className="px-4 py-6 max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <MessageCircle className="w-6 h-6 text-primary-400" />
          <h2 className="text-xl font-black text-white">{t('chat.title')}</h2>
        </div>
        <div className="flex items-center gap-2">
           <button onClick={() => setShowCreateGroup(true)} className="p-2 bg-white/5 rounded-full text-slate-300 hover:text-white transition" title="إنشاء مجموعة"><Users className="w-5 h-5" /></button>
           <button onClick={() => navigate('/search')} className="p-2 bg-white/5 rounded-full text-slate-300 hover:text-white transition"><Search className="w-5 h-5" /></button>
           <button className="relative p-2 bg-white/5 rounded-full text-slate-300 hover:text-white transition"><Bell className="w-5 h-5" /><span className="absolute top-1 right-1 w-2.5 h-2.5 bg-red-500 border-2 border-dark-950 rounded-full"></span></button>
        </div>
      </div>

      <StoriesBar myPhoto={user?.photoURL} myName={user?.displayName || ''} myUid={user?.uid || ''} />

      {user && (<E2EEGate><ConversationList me={user.uid} /></E2EEGate>)}

      {showCreateGroup && user && (
        <CreateGroupModal 
          me={user.uid} 
          onClose={() => setShowCreateGroup(false)} 
          onCreated={(groupId) => {
            setShowCreateGroup(false);
            navigate(`/messages/${groupId}`);
          }} 
        />
      )}
    </div>
  );
};

export default Messages;
