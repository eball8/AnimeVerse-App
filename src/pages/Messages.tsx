import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import {
  MessageCircle, Lock, Loader2, Search, Plus, Users, X, Trash2, List, Archive, Check,
  Pin, PinOff, Inbox, ChevronLeft, ArrowRight,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useI18n } from '../i18n/I18nContext';
import Avatar from '../components/Avatar';
import E2EEGate from '../components/E2EEGate';
import { useConfirm } from '../components/ConfirmDialog';
import StoryViewer from '../components/StoryViewer';
import { subscribeConversations, createGroup, isUnread } from '../services/chatService';
import { getMutualFriendIds } from '../services/followService';
import { searchUsers } from '../services/searchService';
import type { Conversation } from '../services/chatService';
import {
  setChatPref, subscribeChatPrefs, subscribeFollowRelations, isInMainList,
  isMessageRequest, setChatsPinned, acceptMessageRequest, MAX_PINNED_CHATS,
} from '../services/chatPrefsService';
import type { ChatPrefMap, FollowRelations } from '../services/chatPrefsService';
import { hasSeenAll } from '../services/storyService';
import type { StoryGroup } from '../services/storyService';
import { subscribeNotes, setNote, deleteNote, NOTE_MAX } from '../services/noteService';
import type { Note } from '../services/noteService';
import { usePresence, usePresenceInfo, formatPresence, PRESENCE_DOT_CLASS } from '../services/presenceService';
import { useUserBriefs } from '../services/userCache';
import { timeAgo } from '../utils/timeAgo';
import { useVisibleStories } from '../hooks/useVisibleStories';

// ==========================================
// نافذة إنشاء مجموعة
// ==========================================
const CreateGroupModal: React.FC<{ me: string; convs: Conversation[]; onClose: () => void; onCreated: (groupId: string) => void }> = ({ me, convs, onClose, onCreated }) => {
  const { t } = useI18n();
  const [step, setStep] = useState<1 | 2>(1);
  const [name, setName] = useState('');
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const direct = convs.filter((c) => c.type !== 'group');
  const briefs = useUserBriefs(direct.map((c) => c.otherUid));

  const handleCreate = async () => {
    if (!name.trim() || selectedUsers.length === 0 || busy) return;
    setBusy(true); setErr('');
    try {
      const groupId = await createGroup(me, name.trim(), selectedUsers);
      onCreated(groupId);
    } catch (e) {
      console.error(e);
      setErr(t('msgUi.createFail'));
      setBusy(false);
    }
  };

  const toggleUser = (uid: string) => {
    setSelectedUsers((prev) => (prev.includes(uid) ? prev.filter((id) => id !== uid) : [...prev, uid]));
  };

  return (
    <div className="fixed inset-0 z-[120] bg-black/80 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-dark-900 w-full max-w-sm rounded-2xl overflow-hidden border border-white/10" onClick={(e) => e.stopPropagation()}>
        <div className="p-4 border-b border-white/10 flex justify-between items-center">
          <h3 className="text-white font-bold">{step === 1 ? t('msgUi.pickMembers') : t('msgUi.groupName')}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-4">
          {step === 1 ? (
            <div className="max-h-64 overflow-y-auto space-y-2">
              {direct.length === 0 && <p className="text-xs text-slate-400 text-center py-4">{t('msgUi.startDirectFirst')}</p>}
              {direct.map((c) => {
                const b = briefs[c.otherUid];
                return (
                  <button key={c.id} onClick={() => toggleUser(c.otherUid)} className="w-full flex items-center gap-3 p-2 hover:bg-white/5 rounded-xl transition">
                    <Avatar src={b?.photoURL} seed={c.otherUid} name={b?.displayName} className="w-10 h-10 rounded-full object-cover" />
                    <span className="flex-1 text-sm font-bold text-white text-start">{b?.displayName || '...'}</span>
                    <div className={`w-5 h-5 rounded-full border-2 ${selectedUsers.includes(c.otherUid) ? 'bg-primary-500 border-primary-500' : 'border-slate-500'}`} />
                  </button>
                );
              })}
            </div>
          ) : (
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={50} placeholder={t('msgUi.groupNamePh')} className="w-full p-3 rounded-xl bg-dark-800 border border-white/10 text-white outline-none focus:border-primary-500" />
          )}
          {err && <p className="text-xs text-red-400 mt-3">{err}</p>}
        </div>

        <div className="p-4 border-t border-white/10 flex justify-end gap-2">
          {step === 2 && <button onClick={() => setStep(1)} className="px-4 py-2 text-slate-300">{t('chatUi.back')}</button>}
          {step === 1 ? (
            <button onClick={() => setStep(2)} disabled={selectedUsers.length === 0} className="btn-primary px-6 py-2 rounded-xl disabled:opacity-50">{t('msgUi.next')}</button>
          ) : (
            <button onClick={handleCreate} disabled={!name.trim() || busy} className="btn-primary px-6 py-2 rounded-xl disabled:opacity-50">{busy ? '...' : t('msgUi.create')}</button>
          )}
        </div>
      </div>
    </div>
  );
};

// ==========================================
// نافذة الملاحظة
// ==========================================
const NoteModal: React.FC<{ uid: string; current?: string; onClose: () => void }> = ({ uid, current, onClose }) => {
  const { t } = useI18n();
  const [text, setText] = useState(current || '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const save = async () => {
    if (!text.trim() || busy) return;
    setBusy(true); setErr('');
    try { await setNote(uid, text); onClose(); }
    catch (e) { console.error(e); setErr(t('msgUi.noteSaveFail')); setBusy(false); }
  };
  const remove = async () => {
    setBusy(true);
    try { await deleteNote(uid); onClose(); }
    catch (e) { console.error(e); setErr(t('msgUi.noteDeleteFail')); setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-[120] bg-black/80 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-dark-900 w-full max-w-sm rounded-2xl overflow-hidden border border-white/10" onClick={(e) => e.stopPropagation()}>
        <div className="p-4 border-b border-white/10 flex justify-between items-center">
          <h3 className="text-white font-bold">{t('msgUi.yourNote')}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-4 space-y-2">
          <input autoFocus value={text} onChange={(e) => setText(e.target.value.slice(0, NOTE_MAX))} placeholder={t('msgUi.notePh')} className="w-full p-3 rounded-xl bg-dark-800 border border-white/10 text-white text-sm outline-none focus:border-primary-500" />
          <p className="text-[11px] text-slate-500 flex justify-between"><span>{t('msgUi.noteHint')}</span><span>{text.length}/{NOTE_MAX}</span></p>
          {err && <p className="text-xs text-red-400">{err}</p>}
        </div>
        <div className="p-4 border-t border-white/10 flex items-center justify-between gap-2">
          {current ? <button onClick={remove} disabled={busy} className="px-3 py-2 text-red-400 text-sm flex items-center gap-1"><Trash2 className="w-4 h-4" /> {t('chatUi.delete')}</button> : <span />}
          <button onClick={save} disabled={!text.trim() || busy} className="btn-primary px-6 py-2 rounded-xl disabled:opacity-50">{busy ? '...' : t('msgUi.share')}</button>
        </div>
      </div>
    </div>
  );
};

// ==========================================
// شريط القصص والملاحظات (باستخدام useVisibleStories)
// ==========================================
const NoteBubble: React.FC<{ text: string; onClick?: () => void }> = ({ text, onClick }) => (
  <div className="absolute -top-6 left-1/2 -translate-x-1/2 z-10 max-w-[80px]">
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onClick?.(); }}
      className="block max-w-full px-2.5 py-1 rounded-2xl bg-dark-800 border border-white/15 text-[10px] text-white leading-tight shadow-lg truncate"
    >
      {text}
    </button>
    <span className="absolute left-1/2 -translate-x-1/2 -bottom-[3px] w-2 h-2 rotate-45 bg-dark-800 border-b border-e border-white/15" />
  </div>
);

const StoriesNotesBar: React.FC<{ me: string; showActivity: boolean }> = ({ me, showActivity }) => {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { groups, loading } = useVisibleStories();
  const [notes, setNotes] = useState<Record<string, Note>>({});
  const [viewer, setViewer] = useState<number | null>(null);
  const [noteOpen, setNoteOpen] = useState(false);
  const [, setTick] = useState(0);

  useEffect(() => subscribeNotes(setNotes), []);

  const mine = groups.find((g) => g.authorId === me);
  const others = groups.filter((g) => g.authorId !== me);
  const ordered = mine ? [mine, ...others] : others;
  const noteCandidates = Object.keys(notes).filter((uid) => uid !== me && !groups.some((g) => g.authorId === uid));
  const briefs = useUserBriefs(noteCandidates);
  const noteOnlyUids = noteCandidates.filter((uid) => !!briefs[uid]);
  const online = usePresence([...others.map((g) => g.authorId), ...noteOnlyUids], showActivity);

  const ring = (active: boolean) => (active ? 'bg-gradient-to-tr from-primary-500 via-accent-500 to-amber-400' : 'bg-white/15');
  const myNote = notes[me]?.text;

  return (
    <>
      <div className="flex gap-3.5 overflow-x-auto no-scrollbar -mx-4 px-4 pb-3 pt-8 snap-x">
        {/* أنا: القصة + زر الإضافة + الملاحظة */}
        <div className="shrink-0 snap-start w-[72px] flex flex-col items-center gap-1.5">
          <div className="relative">
            {myNote ? <NoteBubble text={myNote} onClick={() => setNoteOpen(true)} /> : (
              <button type="button" onClick={() => setNoteOpen(true)} className="absolute -top-6 left-1/2 -translate-x-1/2 px-2.5 py-1 rounded-2xl bg-dark-800 border border-dashed border-white/20 text-[10px] text-slate-400 z-10 whitespace-nowrap">{t('msgUi.noteBubble')}</button>
            )}
            <button type="button" onClick={() => (mine ? setViewer(0) : navigate('/create-post?mode=story'))} className={`block w-[72px] h-[72px] rounded-full p-[2.5px] ${ring(!!mine && !hasSeenAll(mine))}`}>
              <Avatar src={profile?.photoURL} seed={me} name={profile?.displayName} className="w-full h-full rounded-full object-cover bg-dark-900 border-[2.5px] border-dark-950" />
            </button>
            <button type="button" onClick={() => navigate('/create-post?mode=story')} className="absolute -bottom-0.5 -end-0.5 w-6 h-6 rounded-full bg-gradient-to-tr from-primary-500 to-accent-500 border-2 border-dark-950 flex items-center justify-center">
              <Plus className="w-3.5 h-3.5 text-white" strokeWidth={3} />
            </button>
          </div>
          <span className="text-[11px] text-slate-300 font-semibold truncate w-full text-center">{t('msgUi.yourStory')}</span>
        </div>

        {/* أصحاب القصص (بعد التصفية) */}
        {others.map((g) => {
          const seen = hasSeenAll(g);
          const note = notes[g.authorId]?.text;
          return (
            <button key={g.authorId} onClick={() => setViewer(ordered.indexOf(g))} className="shrink-0 snap-start w-[72px] flex flex-col items-center gap-1.5">
              <div className="relative">
                {note && <NoteBubble text={note} />}
                <div className={`w-[72px] h-[72px] rounded-full p-[2.5px] ${ring(!seen)}`}>
                  <Avatar src={g.authorPhotoURL} seed={g.authorId} name={g.authorName} className="w-full h-full rounded-full object-cover bg-dark-900 border-[2.5px] border-dark-950" />
                </div>
                {online[g.authorId] && <span className={`absolute bottom-0.5 end-0.5 w-4 h-4 ${PRESENCE_DOT_CLASS}`} />}
              </div>
              <span className={`text-[11px] font-semibold truncate w-full text-center ${seen ? 'text-slate-500' : 'text-slate-200'}`}>{g.authorName}</span>
            </button>
          );
        })}

        {/* أصحاب ملاحظات فقط */}
        {noteOnlyUids.map((uid) => {
          const b = briefs[uid];
          return (
            <button key={uid} onClick={() => navigate(`/user/${uid}`)} className="shrink-0 snap-start w-[72px] flex flex-col items-center gap-1.5">
              <div className="relative">
                <NoteBubble text={notes[uid].text} />
                <div className="w-[72px] h-[72px] rounded-full p-[2.5px] bg-white/15">
                  <Avatar src={b?.photoURL} seed={uid} name={b?.displayName} className="w-full h-full rounded-full object-cover bg-dark-900 border-[2.5px] border-dark-950" />
                </div>
                {online[uid] && <span className={`absolute bottom-0.5 end-0.5 w-4 h-4 ${PRESENCE_DOT_CLASS}`} />}
              </div>
              <span className="text-[11px] font-semibold truncate w-full text-center text-slate-300">{b?.displayName || '...'}</span>
            </button>
          );
        })}
      </div>

      {viewer !== null && (
        <StoryViewer groups={ordered} startGroup={viewer} onClose={() => { setViewer(null); setTick((n) => n + 1); }} />
      )}
      {noteOpen && <NoteModal uid={me} current={myNote} onClose={() => setNoteOpen(false)} />}
    </>
  );
};

// ... (باقي مكونات PeopleResults, ConversationList, ActionItem, Messages كما هي في مشروعك)
