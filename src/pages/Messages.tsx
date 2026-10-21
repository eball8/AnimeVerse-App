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
  const { groups } = useVisibleStories();
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

const normQ = (s: string) => s.trim().toLowerCase().replace(/^@/, '');

const PeopleResults: React.FC<{ me: string; query: string; excludeUids: Set<string>; showEmpty: boolean }> = ({ me, query, excludeUids, showEmpty }) => {
  const { t } = useI18n();
  const navigate = useNavigate();
  const q = normQ(query);
  const [friendIds, setFriendIds] = useState<string[]>([]);
  const [remote, setRemote] = useState<Array<{ uid: string; displayName: string; username?: string; photoURL?: string }>>([]);
  const [loading, setLoading] = useState(false);
  const friendBriefs = useUserBriefs(friendIds.slice(0, 100));

  useEffect(() => {
    let alive = true;
    getMutualFriendIds(me).then((ids) => { if (alive) setFriendIds(ids); }).catch(console.error);
    return () => { alive = false; };
  }, [me]);

  useEffect(() => {
    if (q.length < 2) { setRemote([]); setLoading(false); return; }
    let alive = true;
    setLoading(true);
    const id = window.setTimeout(() => {
      searchUsers(q)
        .then((r) => { if (alive) setRemote(r); })
        .catch(console.error)
        .finally(() => { if (alive) setLoading(false); });
    }, 300);
    return () => { alive = false; window.clearTimeout(id); };
  }, [q]);

  const matches = (u: { displayName?: string; username?: string }) =>
    (u.displayName || '').toLowerCase().includes(q) || (u.username || '').toLowerCase().includes(q);

  const map = new Map<string, { uid: string; displayName: string; username?: string; photoURL?: string }>();
  Object.values(friendBriefs).forEach((b) => { if (matches(b)) map.set(b.uid, b); });
  remote.forEach((u) => { if (!map.has(u.uid)) map.set(u.uid, u); });
  const list = Array.from(map.values()).filter((u) => u.uid !== me && !excludeUids.has(u.uid)).slice(0, 15);

  if (list.length === 0) {
    if (loading || !showEmpty) return null;
    return <p className="text-center text-sm text-slate-500 py-10">{t('msgSearch.noResults')}</p>;
  }

  return (
    <div className="space-y-2 mt-4">
      <p className="text-[11px] font-bold text-slate-500 px-1">{t('msgSearch.people')}</p>
      {list.map((u) => (
        <button
          key={u.uid}
          type="button"
          onClick={() => navigate(`/messages/${u.uid}`)}
          className="w-full flex items-center gap-3 p-3 rounded-2xl border bg-white/5 border-white/10 text-start hover:bg-white/10 transition"
        >
          <Avatar src={u.photoURL} seed={u.uid} name={u.displayName} className="w-12 h-12 rounded-full object-cover bg-dark-900 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-white truncate">{u.displayName}</p>
            {u.username && <p className="text-[11px] text-slate-400 truncate">@{u.username}</p>}
          </div>
          <MessageCircle className="w-5 h-5 text-slate-400 shrink-0" />
        </button>
      ))}
    </div>
  );
};

type InboxView = 'inbox' | 'requests';

const ConversationList: React.FC<{
  me: string;
  showActivity: boolean;
  view: InboxView;
  items: Conversation[] | null;
  prefs: ChatPrefMap;
  requestsCount: number;
  requestsUnread: boolean;
  selectMode: boolean;
  selected: Set<string>;
  onToggle: (id: string) => void;
  onOpenSheet: (id: string, name: string) => void;
  searchQuery: string;
  onOpenRequests: () => void;
  onBack: () => void;
  onAccept: (id: string) => void;
  onDecline: (id: string) => void;
}> = ({
  me, showActivity, view, items: allItems, prefs, requestsCount, requestsUnread, selectMode, selected,
  onToggle, onOpenSheet, searchQuery, onOpenRequests, onBack, onAccept, onDecline,
}) => {
  const { t, lang } = useI18n();
  const navigate = useNavigate();
  const holdRef = useRef<number | null>(null);
  const heldRef = useRef(false);
  const directUids = (allItems || []).filter((c) => c.type !== 'group').map((c) => c.otherUid);
  const briefs = useUserBriefs(directUids);
  const presence = usePresenceInfo(directUids, showActivity);
  const sq = normQ(searchQuery);
  const isRequests = view === 'requests';
  const items = allItems === null ? null : !sq ? allItems : allItems.filter((c) => {
    if (c.type === 'group') return (c.name || '').toLowerCase().includes(sq);
    const b = briefs[c.otherUid];
    return (b?.displayName || '').toLowerCase().includes(sq) || (b?.username || '').toLowerCase().includes(sq);
  });

  const clearHold = () => { if (holdRef.current !== null) { window.clearTimeout(holdRef.current); holdRef.current = null; } };
  const startHold = (id: string, name: string) => {
    heldRef.current = false;
    clearHold();
    holdRef.current = window.setTimeout(() => { heldRef.current = true; onOpenSheet(id, name); }, 500);
  };

  const requestsHeader = isRequests ? (
    <div className="mb-2">
      <div className="flex items-center gap-2">
        <button onClick={onBack} className="p-2 bg-white/5 rounded-full text-slate-300 hover:text-white transition" aria-label={t('msgInbox.back')} title={t('msgInbox.back')}>
          <ArrowRight className="w-5 h-5 rtl:rotate-0 ltr:rotate-180" />
        </button>
        <h2 className="text-base font-black text-white">{t('msgInbox.requests')}</h2>
      </div>
      <p className="text-[11px] text-slate-400 mt-2 px-1 leading-relaxed">{t('msgInbox.requestsHint')}</p>
    </div>
  ) : null;

  if (items === null) return (
    <>
      {requestsHeader}
      <div className="py-16 flex justify-center"><Loader2 className="w-7 h-7 animate-spin text-primary-500" /></div>
    </>
  );

  if (!isRequests && sq && items.length === 0) return <PeopleResults me={me} query={searchQuery} excludeUids={new Set()} showEmpty />;

  const banner = !isRequests && !sq && !selectMode && requestsCount > 0 ? (
    <button
      type="button"
      onClick={onOpenRequests}
      className="w-full flex items-center gap-3 p-3 rounded-2xl border bg-white/5 border-white/10 text-start hover:bg-white/10 transition"
    >
      <div className="w-14 h-14 rounded-full bg-primary-500/15 border border-primary-500/30 flex items-center justify-center shrink-0">
        <Inbox className="w-6 h-6 text-primary-400" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-white truncate">{t('msgInbox.requests')}</p>
        <p className="text-[11px] text-slate-400 mt-0.5 truncate">{t('msgInbox.requestsCount', { n: requestsCount })}</p>
      </div>
      {requestsUnread && <span className="w-3 h-3 rounded-full bg-red-500 shrink-0" />}
      <ChevronLeft className="w-4 h-4 text-slate-500 shrink-0 rtl:rotate-0 ltr:rotate-180" />
    </button>
  ) : null;

  if (items.length === 0) return (
    <>
      {requestsHeader}
      {banner && <div className="mt-2">{banner}</div>}
      <div className="card p-8 text-center space-y-4 mt-4">
        {isRequests ? <Inbox className="w-12 h-12 text-slate-600 mx-auto" /> : <MessageCircle className="w-12 h-12 text-slate-600 mx-auto" />}
        <p className="text-sm font-bold text-white">{isRequests ? t('msgInbox.requestsEmpty') : t('chat.empty')}</p>
        {!isRequests && (
          <button onClick={() => navigate('/search')} className="btn-primary px-6 py-2 inline-flex items-center gap-2"><Search className="w-4 h-4" /> {t('header.search')}</button>
        )}
      </div>
    </>
  );

  return (
    <>
      {requestsHeader}
      <div className="space-y-2 mt-2">
        {banner}
        {items.map((c) => {
          const isGroup = c.type === 'group';
          const b = !isGroup ? briefs[c.otherUid] : null;
          const name = isGroup ? (c.name || t('chatUi.group')) : (b?.displayName || '...');
          const targetUid = isGroup ? c.id : c.otherUid;
          const unread = isUnread(c, me);
          const info = isGroup ? undefined : presence[c.otherUid];
          const status = formatPresence(info, lang);
          const checked = selected.has(c.id);
          const pinned = !isRequests && prefs[c.id]?.pinnedAt !== undefined;

          const onClick = () => {
            if (heldRef.current) { heldRef.current = false; return; }
            if (selectMode) onToggle(c.id);
            else navigate(`/messages/${targetUid}`);
          };

          const canHold = !isRequests && !selectMode;

          return (
            <div
              key={c.id}
              role="button"
              tabIndex={0}
              onClick={onClick}
              onKeyDown={(e) => { if (e.key === 'Enter') onClick(); }}
              onTouchStart={() => { if (canHold) startHold(c.id, name); }}
              onTouchEnd={clearHold}
              onTouchMove={clearHold}
              onTouchCancel={clearHold}
              onContextMenu={(e) => { e.preventDefault(); if (canHold) { heldRef.current = true; onOpenSheet(c.id, name); } }}
              className={`w-full flex items-center gap-3 p-3 rounded-2xl border text-start cursor-pointer hover:bg-white/10 transition select-none ${checked ? 'bg-primary-500/15 border-primary-500/50' : unread ? 'bg-primary-500/10 border-primary-500/30' : pinned ? 'bg-white/[0.07] border-white/15' : 'bg-white/5 border-white/10'}`}
            >
              {selectMode && (
                <span className={`w-6 h-6 rounded-md border-2 shrink-0 flex items-center justify-center ${checked ? 'bg-primary-500 border-primary-500' : 'border-slate-400'}`}>
                  {checked && <Check className="w-4 h-4 text-white" strokeWidth={3} />}
                </span>
              )}
              <div className="relative shrink-0">
                {isGroup ? (
                  <div className="w-14 h-14 rounded-full bg-slate-800 flex items-center justify-center border border-white/10"><Users className="w-6 h-6 text-slate-400" /></div>
                ) : (
                  <Avatar src={b?.photoURL} seed={c.otherUid} name={name} className="w-14 h-14 rounded-full object-cover bg-dark-900" />
                )}
                {!isGroup && info?.online && <span className={`absolute bottom-0 end-0 w-3.5 h-3.5 ${PRESENCE_DOT_CLASS}`} />}
              </div>
              <div className="flex-1 min-w-0">
                <p className={`text-sm truncate ${unread ? 'font-black text-white' : 'font-bold text-white'}`}>{name}</p>
                {isRequests ? (
                  <p className="text-[11px] text-slate-400 mt-0.5 truncate">{t('msgInbox.wantsToMessage')}</p>
                ) : status ? (
                  <p className={`text-[11px] mt-0.5 truncate ${info?.online ? 'text-primary-400 font-bold' : 'text-slate-400'}`}>{status}</p>
                ) : (
                  <p className="text-[11px] text-emerald-400 flex items-center gap-1 mt-0.5"><Lock className="w-3 h-3" /> {t('chat.encrypted')}</p>
                )}
              </div>
              {isRequests ? (
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onAccept(c.id); }}
                    className="px-3 py-1.5 rounded-full bg-primary-500 text-white text-[11px] font-bold flex items-center gap-1"
                    aria-label={t('msgInbox.accept')}
                  ><Check className="w-3.5 h-3.5" strokeWidth={3} /> {t('msgInbox.accept')}</button>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onDecline(c.id); }}
                    className="p-1.5 rounded-full bg-white/5 text-slate-300 hover:text-red-400 transition"
                    aria-label={t('msgInbox.decline')}
                    title={t('msgInbox.decline')}
                  ><Trash2 className="w-4 h-4" /></button>
                </div>
              ) : (
                <div className="flex flex-col items-end gap-1.5 shrink-0">
                  <span className="text-[10px] text-slate-500">{timeAgo(c.lastMessageAt, lang)}</span>
                  <div className="flex items-center gap-1.5">
                    {pinned && <Pin className="w-3.5 h-3.5 text-slate-400 rotate-45" aria-label={t('msgInbox.pin')} />}
                    {unread && <span className="w-3 h-3 rounded-full bg-red-500" />}
                  </div>
                </div>
              )}
            </div>
          );
        })}
        {!isRequests && sq && (
          <PeopleResults
            me={me}
            query={searchQuery}
            excludeUids={new Set(items.filter((c) => c.type !== 'group').map((c) => c.otherUid))}
            showEmpty={false}
          />
        )}
      </div>
    </>
  );
};

const ActionItem: React.FC<{
  icon: React.ReactNode;
  label: string;
  sub?: string;
  badge?: string;
  danger?: boolean;
  onClick: () => void;
}> = ({ icon, label, sub, badge, danger, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className={`w-full flex items-center gap-3 px-4 py-3 text-start hover:bg-white/5 transition ${danger ? 'text-red-400' : 'text-white'}`}
  >
    <span className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${danger ? 'bg-red-500/10' : 'bg-white/5'}`}>{icon}</span>
    <span className="flex-1 min-w-0">
      <span className="block text-sm font-bold truncate">{label}</span>
      {sub && <span className="block text-[11px] text-slate-400 font-normal truncate">{sub}</span>}
    </span>
    {badge && <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-red-500 text-[10px] font-bold text-white flex items-center justify-center">{badge}</span>}
  </button>
);

const Messages: React.FC = () => {
  const { user, profile } = useAuth();
  const { t } = useI18n();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [pinIntent, setPinIntent] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [prefs, setPrefs] = useState<ChatPrefMap>({});
  const [prefsReady, setPrefsReady] = useState(false);
  const [convs, setConvs] = useState<Conversation[] | null>(null);
  const [rel, setRel] = useState<FollowRelations | null>(null);
  const [view, setView] = useState<InboxView>('inbox');
  const [menuOpen, setMenuOpen] = useState(false);
  const [sheet, setSheet] = useState<{ id: string; name: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  const showActivity = (profile as any)?.showActivity !== false;
  const myType: 'public' | 'private' = (profile as any)?.accountType === 'private' ? 'private' : 'public';
  const me = user?.uid;

  useLayoutEffect(() => { setSlot(document.getElementById('inbox-header-slot')); }, []);

  useEffect(() => {
    if (!me) return;
    return subscribeChatPrefs(me, (m) => { setPrefs(m); setPrefsReady(true); });
  }, [me]);

  useEffect(() => (me ? subscribeConversations(me, setConvs) : undefined), [me]);
  useEffect(() => (me ? subscribeFollowRelations(me, setRel) : undefined), [me]);

  const { inbox, requests } = useMemo(() => {
    if (!me || !convs || !rel || !prefsReady) return { inbox: null as Conversation[] | null, requests: [] as Conversation[] };
    const visible = convs.filter((c) => isInMainList(c, prefs[c.id]));
    const reqs: Conversation[] = [];
    const main: Conversation[] = [];
    visible.forEach((c) => {
      if (isMessageRequest(c, me, prefs[c.id], rel, myType)) reqs.push(c); else main.push(c);
    });
    main.sort((a, b) => {
      const pa = prefs[a.id]?.pinnedAt;
      const pb = prefs[b.id]?.pinnedAt;
      if (pa !== undefined && pb !== undefined) return pa - pb;
      if (pa !== undefined) return -1;
      if (pb !== undefined) return 1;
      return 0;
    });
    return { inbox: main, requests: reqs };
  }, [convs, rel, prefs, prefsReady, me, myType]);

  const requestsUnread = !!me && requests.some((c) => isUnread(c, me));
  const pinnedAllSelected = selected.size > 0 && Array.from(selected).every((id) => prefs[id]?.pinnedAt !== undefined);

  const flash = (msg: string) => { setToast(msg); window.setTimeout(() => setToast(''), 2200); };
  const exitSelect = () => { setSelectMode(false); setPinIntent(false); setSelected(new Set()); };
  const startSelect = (id?: string, pin = false) => {
    setSelectMode(true);
    setPinIntent(pin);
    setSelected(id ? new Set([id]) : new Set());
  };
  const toggle = (id: string) => setSelected((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const applyPin = async (ids: string[], pin: boolean) => {
    if (!me || ids.length === 0 || busy) return;
    setBusy(true);
    try {
      await setChatsPinned(me, ids, pin);
      exitSelect();
      flash(pin ? t('msgInbox.pinnedToast') : t('msgInbox.unpinnedToast'));
    } catch (e) {
      if (e instanceof Error && e.message === 'PIN_LIMIT') {
        flash(t('msgInbox.pinLimit', { n: MAX_PINNED_CHATS }));
      } else {
        console.error(e);
        flash(t('msgManage.fail'));
      }
    } finally { setBusy(false); }
  };

  const archiveIds = async (ids: string[]) => {
    if (!me || ids.length === 0 || busy) return;
    setBusy(true);
    try {
      await Promise.all(ids.map((id) => setChatPref(me, id, { archived: true }, prefs[id])));
      exitSelect();
      flash(t('msgManage.archivedToast'));
    } catch (e) {
      console.error(e);
      flash(t('msgManage.fail'));
    } finally { setBusy(false); }
  };

  const deleteIds = async (ids: string[]) => {
    if (!me || ids.length === 0 || busy) return;
    const ok = await confirm({
      title: t('msgManage.deleteTitle', { n: ids.length }),
      message: t('msgManage.deleteMsg'),
      confirmLabel: t('msgManage.deleteConfirm'),
      danger: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      const at = Date.now();
      await Promise.all(ids.map((id) => setChatPref(me, id, { deletedAt: at, archived: false }, prefs[id])));
      exitSelect();
      flash(t('msgManage.deletedToast'));
    } catch (e) {
      console.error(e);
      flash(t('msgManage.fail'));
    } finally { setBusy(false); }
  };

  const acceptRequest = async (id: string) => {
    if (!me || busy) return;
    setBusy(true);
    try {
      await acceptMessageRequest(me, id, prefs[id]);
      flash(t('msgInbox.acceptedToast'));
    } catch (e) {
      console.error(e);
      flash(t('msgManage.fail'));
    } finally { setBusy(false); }
  };

  const declineRequest = async (id: string) => {
    if (!me || busy) return;
    const ok = await confirm({
      title: t('msgInbox.declineTitle'),
      message: t('msgInbox.declineMsg'),
      confirmLabel: t('msgInbox.decline'),
      danger: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      await setChatPref(me, id, { deletedAt: Date.now(), archived: false }, prefs[id]);
      flash(t('msgManage.deletedToast'));
    } catch (e) {
      console.error(e);
      flash(t('msgManage.fail'));
    } finally { setBusy(false); }
  };

  const openRequests = () => { setMenuOpen(false); exitSelect(); setSearchQuery(''); setView('requests'); };
  const backToInbox = () => { setView('inbox'); setSearchQuery(''); };

  const menuButton = (
    <button
      type="button"
      onClick={() => setMenuOpen((v) => !v)}
      className="relative p-2 text-slate-300 active:scale-90 transition-transform"
      aria-label={t('msgInbox.menuTitle')}
      title={t('msgInbox.menuTitle')}
    >
      <List className="w-6 h-6 text-white" />
      {requestsUnread && <span className="absolute top-1 end-1 w-2.5 h-2.5 rounded-full bg-red-500 border-2 border-dark-950" />}
    </button>
  );

  const sheetPinned = sheet ? prefs[sheet.id]?.pinnedAt !== undefined : false;

  return (
    <div className="px-4 py-4 max-w-2xl mx-auto">
      {slot && createPortal(menuButton, slot)}

      {view === 'inbox' && (
        selectMode ? (
          <div className="mb-1">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <button onClick={exitSelect} className="p-2 bg-white/5 rounded-full text-slate-300 hover:text-white transition" aria-label={t('msgManage.cancel')} title={t('msgManage.cancel')}><X className="w-5 h-5" /></button>
                <h2 className="text-base font-black text-white truncate">{t('msgManage.selectedCount', { n: selected.size })}</h2>
              </div>
              <div className="flex items-center justify-end gap-1.5 flex-wrap">
                <button onClick={() => applyPin(Array.from(selected), !pinnedAllSelected)} disabled={selected.size === 0 || busy} className="px-3 py-2 bg-white/5 rounded-full text-slate-200 text-xs font-bold flex items-center gap-1.5 disabled:opacity-40">
                  {pinnedAllSelected ? <PinOff className="w-4 h-4" /> : <Pin className="w-4 h-4" />} {pinnedAllSelected ? t('msgInbox.unpin') : t('msgInbox.pin')}
                </button>
                <button onClick={() => archiveIds(Array.from(selected))} disabled={selected.size === 0 || busy} className="px-3 py-2 bg-white/5 rounded-full text-slate-200 text-xs font-bold flex items-center gap-1.5 disabled:opacity-40"><Archive className="w-4 h-4" /> {t('msgManage.archiveSel')}</button>
                <button onClick={() => deleteIds(Array.from(selected))} disabled={selected.size === 0 || busy} className="px-3 py-2 bg-red-500/15 border border-red-500/30 rounded-full text-red-400 text-xs font-bold flex items-center gap-1.5 disabled:opacity-40"><Trash2 className="w-4 h-4" /> {t('msgManage.deleteSel')}</button>
              </div>
            </div>
            {pinIntent && <p className="text-[11px] text-slate-400 mt-2 px-1">{t('msgInbox.pinHint')} ({t('msgInbox.pinChatsSub', { n: MAX_PINNED_CHATS })})</p>}
          </div>
        ) : (
          <div className="flex items-center justify-between mb-1">
            <h2 className="text-base font-black text-white">{t('chat.title')}</h2>
            <button onClick={() => setShowCreateGroup(true)} className="p-2 bg-white/5 rounded-full text-slate-300 hover:text-white transition" title={t('msgUi.createGroup')} aria-label={t('msgUi.createGroup')}><Users className="w-5 h-5" /></button>
          </div>
        )
      )}

      <div className="relative mt-2 mb-1">
        <Search className="w-4 h-4 text-slate-400 absolute start-4 top-1/2 -translate-y-1/2 pointer-events-none" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder={t('msgSearch.placeholder')}
          className="w-full ps-11 pe-10 py-2.5 rounded-full bg-white/5 border border-white/10 text-sm text-white placeholder-slate-500 outline-none focus:border-primary-500/50"
        />
        {searchQuery && (
          <button
            type="button"
            onClick={() => setSearchQuery('')}
            className="absolute end-3 top-1/2 -translate-y-1/2 p-1 rounded-full text-slate-400 hover:text-white"
            aria-label={t('msgSearch.clear')}
          ><X className="w-4 h-4" /></button>
        )}
      </div>

      {user && view === 'inbox' && !searchQuery.trim() && <StoriesNotesBar me={user.uid} showActivity={showActivity} />}

      {user && (
        <E2EEGate>
          <ConversationList
            me={user.uid}
            showActivity={showActivity}
            view={view}
            items={view === 'requests' ? (inbox === null ? null : requests) : inbox}
            prefs={prefs}
            requestsCount={requests.length}
            requestsUnread={requestsUnread}
            selectMode={selectMode}
            selected={selected}
            onToggle={toggle}
            onOpenSheet={(id, name) => setSheet({ id, name })}
            searchQuery={searchQuery}
            onOpenRequests={openRequests}
            onBack={backToInbox}
            onAccept={acceptRequest}
            onDecline={declineRequest}
          />
        </E2EEGate>
      )}

      {menuOpen && (
        <div className="fixed inset-0 z-[110]" onClick={() => setMenuOpen(false)}>
          <div
            className="absolute end-3 w-72 max-w-[calc(100vw-1.5rem)] rounded-2xl bg-dark-900 border border-white/10 shadow-2xl overflow-hidden py-1"
            style={{ top: 'calc(var(--app-header-h, 3.75rem) + 6px)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <p className="px-4 pt-2 pb-1 text-[11px] font-bold text-slate-500">{t('msgInbox.menuTitle')}</p>
            <ActionItem
              icon={<Check className="w-4 h-4" />}
              label={t('msgInbox.select')}
              sub={t('msgInbox.selectSub')}
              onClick={() => { setMenuOpen(false); setView('inbox'); startSelect(undefined, false); }}
            />
            <ActionItem
              icon={<Pin className="w-4 h-4" />}
              label={t('msgInbox.pinChats')}
              sub={t('msgInbox.pinChatsSub', { n: MAX_PINNED_CHATS })}
              onClick={() => { setMenuOpen(false); setView('inbox'); startSelect(undefined, true); }}
            />
            <ActionItem
              icon={<Inbox className="w-4 h-4" />}
              label={t('msgInbox.requests')}
              sub={t('msgInbox.requestsSub')}
              badge={requests.length > 0 ? String(requests.length > 9 ? '9+' : requests.length) : undefined}
              onClick={openRequests}
            />
            <ActionItem
              icon={<Archive className="w-4 h-4" />}
              label={t('msgInbox.archive')}
              sub={t('msgInbox.archiveSub')}
              onClick={() => { setMenuOpen(false); navigate('/archive'); }}
            />
            <ActionItem
              icon={<Users className="w-4 h-4" />}
              label={t('msgInbox.createGroup')}
              sub={t('msgInbox.createGroupSub')}
              onClick={() => { setMenuOpen(false); setShowCreateGroup(true); }}
            />
          </div>
        </div>
      )}

      {sheet && (
        <div className="fixed inset-0 z-[125] bg-black/60 flex items-end justify-center" onClick={() => setSheet(null)}>
          <div
            className="w-full max-w-md bg-dark-900 rounded-t-3xl border-t border-white/10 pt-3 pb-[calc(1rem+env(safe-area-inset-bottom))]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-10 h-1 rounded-full bg-white/20 mx-auto mb-3" />
            <p className="text-sm font-black text-white text-center truncate px-4 mb-1">{sheet.name}</p>
            <ActionItem
              icon={sheetPinned ? <PinOff className="w-4 h-4" /> : <Pin className="w-4 h-4" />}
              label={sheetPinned ? t('msgInbox.unpin') : t('msgInbox.pin')}
              sub={sheetPinned ? undefined : t('msgInbox.pinChatsSub', { n: MAX_PINNED_CHATS })}
              onClick={() => { const id = sheet.id; setSheet(null); applyPin([id], !sheetPinned); }}
            />
            <ActionItem
              icon={<Check className="w-4 h-4" />}
              label={t('msgInbox.selectOne')}
              onClick={() => { const id = sheet.id; setSheet(null); startSelect(id, false); }}
            />
            <ActionItem
              icon={<Archive className="w-4 h-4" />}
              label={t('msgInbox.archiveChat')}
              onClick={() => { const id = sheet.id; setSheet(null); archiveIds([id]); }}
            />
            <ActionItem
              icon={<Trash2 className="w-4 h-4" />}
              label={t('msgInbox.deleteChat')}
              danger
              onClick={() => { const id = sheet.id; setSheet(null); deleteIds([id]); }}
            />
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[130] px-4 py-2 rounded-full bg-dark-800 border border-white/15 text-xs font-bold text-white shadow-lg">{toast}</div>
      )}

      {showCreateGroup && user && (
        <CreateGroupModal
          me={user.uid}
          convs={convs || []}
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
