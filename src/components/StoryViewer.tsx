import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { X, Volume2, VolumeX, Loader2, Heart, Eye, Send, Flag } from 'lucide-react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../config/firebase';
import { useAuth } from '../context/AuthContext';
import { useI18n } from '../i18n/I18nContext';
import Avatar from './Avatar';
import {
  deleteStory, markStorySeen, recordStoryView, sendStoryReply, setStoryLiked, storyMillis, subscribeStoryViews,
} from '../services/storyService';
import type { StoryGroup, StoryView, StoryViewRecord } from '../services/storyService';
import { pickAuthor, useUserBriefs } from '../services/userCache';
import { timeAgo } from '../utils/timeAgo';
import DeleteButton from './DeleteButton';
import { useConfirm } from './ConfirmDialog';
import { sendDirect, convIdOf } from '../services/chatService';
import { useMediaLock } from '../utils/mediaManager';
import ReportFlow from './ReportFlow';
import { profileLink } from '../utils/links';

interface Props {
  groups: StoryGroup[];
  startGroup: number;
  onClose: () => void;
}

const IMAGE_MS = 5000;

const StoryViewer: React.FC<Props> = ({ groups, startGroup, onClose }) => {
  const navigate = useNavigate();
  const { user, isAdmin } = useAuth();
  const { t, lang } = useI18n();
  const confirm = useConfirm();
  const [gi, setGi] = useState(startGroup);
  const [si, setSi] = useState(0);
  const [progress, setProgress] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [held, setHeld] = useState(false);
  const [muted, setMuted] = useState(false);
  const [rec, setRec] = useState<StoryViewRecord | null>(null);
  const [replyText, setReplyText] = useState('');
  const [inputFocus, setInputFocus] = useState(false);
  const [sending, setSending] = useState(false);
  const [sentMsg, setSentMsg] = useState(false);
  const [views, setViews] = useState<StoryView[]>([]);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  // فتح الستوري = إيقاف كل فيديوهات الخلفية (فيديو الستوري وحده مسموح له)
  useMediaLock();

  const group = groups[gi];
  const story = group?.stories[si];
  const isOwner = !!story && !!user && story.authorId === user.uid;

  const authorBriefs = useUserBriefs(groups.map((g) => g.authorId));
  const viewerBriefs = useUserBriefs(isOwner ? views.map((v) => v.viewerId) : []);

  const [confirming, setConfirming] = useState(false);
  const paused = held || inputFocus || sheetOpen || confirming || reportOpen;
  const pausedRef = useRef(false);
  pausedRef.current = paused || !loaded;

  const goNext = useCallback(() => {
    if (!group) return;
    if (si < group.stories.length - 1) {
      setSi(si + 1);
    } else if (gi < groups.length - 1) {
      setGi(gi + 1);
      setSi(0);
    } else {
      onClose();
    }
  }, [group, si, gi, groups.length, onClose]);

  const goPrev = useCallback(() => {
    if (si > 0) {
      setSi(si - 1);
    } else if (gi > 0) {
      const prev = groups[gi - 1];
      setGi(gi - 1);
      setSi(prev.stories.length - 1);
    } else {
      setProgress(0);
      if (videoRef.current) videoRef.current.currentTime = 0;
    }
  }, [si, gi, groups]);

  const goNextRef = useRef(goNext);
  goNextRef.current = goNext;

  useEffect(() => {
    if (!story) return;
    setLoaded(false);
    setProgress(0);
    setReplyText('');
    setSentMsg(false);
    setSheetOpen(false);
    markStorySeen(story.authorId, storyMillis(story));
  }, [story?.id]);

  useEffect(() => {
    setRec(null);
    if (!story || !user || story.authorId === user.uid) return;
    let off = false;
    recordStoryView(story, user.uid)
      .then((r) => {
        if (!off) setRec(r);
      })
      .catch((e) => console.error('story view failed:', e));
    return () => {
      off = true;
    };
  }, [story?.id, user?.uid]);

  useEffect(() => {
    setViews([]);
    if (!story || !isOwner) return;
    return subscribeStoryViews(story, setViews, (e) => console.error('story views error:', e));
  }, [story?.id, isOwner]);

  useEffect(() => {
    if (!story || story.mediaType === 'video') return;
    let raf = 0;
    let last = performance.now();
    let elapsed = 0;
    const tick = (now: number) => {
      const dt = now - last;
      last = now;
      if (!pausedRef.current) elapsed += dt;
      const p = Math.min(1, elapsed / IMAGE_MS);
      setProgress(p);
      if (p >= 1) {
        goNextRef.current();
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [story?.id]);

  // إيقاف فيديو الستوري وتحرير الموارد عند تغيير الستوري أو الإغلاق
  useEffect(() => {
    const v = videoRef.current;
    return () => {
      if (v) {
        v.pause();
        v.removeAttribute('src');
        v.load();
      }
    };
  }, [story?.id]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (paused) v.pause();
    else v.play().catch(() => undefined);
  }, [paused, story?.id]);

  const touch = useRef({ x: 0, y: 0, t: 0 });

  const onPointerDown = (e: React.PointerEvent) => {
    touch.current = { x: e.clientX, y: e.clientY, t: Date.now() };
    setHeld(true);
  };

  const onPointerUp = (e: React.PointerEvent) => {
    setHeld(false);
    const dx = e.clientX - touch.current.x;
    const dy = e.clientY - touch.current.y;
    const dt = Date.now() - touch.current.t;
    if (dy > 110 && Math.abs(dx) < 80) {
      onClose();
      return;
    }
    if (dt < 250 && Math.abs(dx) < 12 && Math.abs(dy) < 12) {
      const w = window.innerWidth;
      if (e.clientX < w * 0.4) goNext();
      else if (e.clientX > w * 0.6) goPrev();
      else goNext();
    }
  };

  const onDelete = async () => {
    if (!story) return;
    setConfirming(true);
    const ok = await confirm({ title: t('story.deleteConfirm') });
    setConfirming(false);
    if (!ok) return;
    try {
      await deleteStory(story.id);
      onClose();
    } catch (e: any) {
      alert(t('story.deleteFail') + ' ' + (e?.message || ''));
    }
  };

  const toggleLike = async () => {
    if (!story || !user || !rec) return;
    const prev = rec;
    setRec({ ...rec, liked: !rec.liked });
    try {
      await setStoryLiked(story, user.uid, !prev.liked);
    } catch (e) {
      console.error(e);
      setRec(prev);
    }
  };

  const sendReply = async () => {
    const v = replyText.trim();
    if (!v || !story || !user || !rec || sending) return;
    setSending(true);
    try {
      // 1. حفظ الرد في شاشة مشاهدات القصة (حتى يراه صاحب القصة)
      await sendStoryReply(story, user.uid, v);
      
      // 2. إرسال رسالة دردشة حقيقية
      const convSnap = await getDoc(doc(db, 'conversations', convIdOf(user.uid, story.authorId)));
      const exists = convSnap.exists();
      
      const payload = { k: 't' as const, v: `رداً على قصتك: ${v}` };
      await sendDirect(user.uid, story.authorId, payload, exists);

      setReplyText('');
      setSentMsg(true);
      setTimeout(() => setSentMsg(false), 2000);

      // 3. الانتقال إلى المحادثة. لا نستدعي onClose() قبل التنقل، لأن React Router v7
      // يغلّف التنقل بـ startTransition (أولوية أقل) فتظهر الصفحة الخلفية لحظة. القصة تُزال تلقائياً عند مغادرة الصفحة.
      navigate(`/messages/${story.authorId}`);
    } catch (e: any) {
      console.error(e);
      if (e?.message === 'MESSAGES_CLOSED') {
        alert(lang === 'ar' ? 'هذا المستخدم لا يستقبل رسائل جديدة.' : 'This user is not accepting new messages.');
      } else {
        alert(lang === 'ar' ? 'تعذّر إرسال الرد.' : 'Could not send reply.');
      }
    } finally {
      setSending(false);
    }
  };

  const openProfile = () => {
    if (!story || !user) return;
    // بدون onClose() هنا: إغلاق العارض قبل التنقل كان يكشف صفحة المجتمع لأجزاء من الثانية
    // (التنقل في RR v7 يتم داخل startTransition). العارض يختفي مع مغادرة الصفحة.
    if (story.authorId === user.uid) {
      navigate('/profile');
    } else {
      navigate(`/user/${story.authorId}`);
    }
  };

  if (!group || !story) return null;
  const canDelete = isOwner || isAdmin;
  const stop = (e: React.PointerEvent | React.MouseEvent) => e.stopPropagation();
  const author = pickAuthor(authorBriefs, group.authorId, group.authorName, group.authorPhotoURL);
  const likesCount = views.filter((v) => v.liked).length;

  return (
    <div className="fixed inset-0 z-[100] bg-black flex items-center justify-center select-none touch-none">
      <div
        className="absolute inset-0 flex items-center justify-center"
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerCancel={() => setHeld(false)}
      >
        {story.mediaType === 'video' ? (
          <video
            key={story.id}
            ref={videoRef}
            src={story.mediaUrl}
            data-media-priority="1"
            autoPlay
            playsInline
            muted={muted}
            className="w-full h-full object-contain"
            onLoadedData={() => setLoaded(true)}
            onTimeUpdate={(e) => {
              const v = e.currentTarget;
              if (v.duration) setProgress(v.currentTime / v.duration);
            }}
            onEnded={goNext}
            onError={goNext}
          />
        ) : (
          <img
            key={story.id}
            src={story.mediaUrl}
            alt=""
            draggable={false}
            className="w-full h-full object-contain"
            onLoad={() => setLoaded(true)}
            onError={() => setLoaded(true)}
          />
        )}
        {!loaded && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <Loader2 className="w-8 h-8 animate-spin text-white/70" />
          </div>
        )}
      </div>

      <div className="absolute top-0 inset-x-0 pointer-events-none bg-gradient-to-b from-black/70 via-black/30 to-transparent pb-10 pt-[calc(env(safe-area-inset-top)+10px)] px-3">
        <div className="flex gap-1">
          {group.stories.map((s, i) => (
            <div key={s.id} className="flex-1 h-[3px] rounded-full bg-white/30 overflow-hidden">
              <div
                className="h-full bg-white rounded-full"
                style={{ width: i < si ? '100%' : i === si ? `${Math.round(progress * 100)}%` : '0%' }}
              />
            </div>
          ))}
        </div>

        <div className="flex items-center gap-3 mt-3 pointer-events-auto">
          <button type="button" onClick={openProfile} className="flex items-center gap-3 min-w-0 flex-1 text-start">
            <img
              src={author.photo || `https://api.dicebear.com/7.x/bottts/svg?seed=${group.authorId}`}
              alt=""
              className="w-9 h-9 rounded-full object-cover ring-2 ring-white/60 bg-dark-900"
            />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-white truncate hover:underline">{author.name}</p>
              <p className="text-[10px] text-white/70">{timeAgo(story.createdAt, lang)}</p>
            </div>
          </button>
          {story.mediaType === 'video' && (
            <button onPointerDown={stop} onPointerUp={stop} onClick={() => setMuted((m) => !m)} className="p-2 text-white" aria-label={t('story.sound')}>
              {muted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
            </button>
          )}
          {!isOwner && (
            <button
              onPointerDown={stop}
              onPointerUp={stop}
              onClick={() => setReportOpen(true)}
              className="p-2 text-white"
              aria-label="report"
            >
              <Flag className="w-5 h-5" />
            </button>
          )}
          {canDelete && (
            <DeleteButton
              variant="glass"
              label={t('common.delete')}
              onPointerDown={stop}
              onPointerUp={stop}
              onClick={onDelete}
            />
          )}
          <button onPointerDown={stop} onPointerUp={stop} onClick={onClose} className="p-2 text-white" aria-label={t('story.close')}>
            <X className="w-6 h-6" />
          </button>
        </div>
      </div>

      {story.caption && (
        <div className="absolute bottom-0 inset-x-0 pointer-events-none bg-gradient-to-t from-black/80 via-black/40 to-transparent pt-16 pb-[calc(env(safe-area-inset-bottom)+84px)] px-5">
          <p className="text-white text-sm font-semibold leading-relaxed text-center break-words">{story.caption}</p>
        </div>
      )}

      {isOwner ? (
        <div className="absolute bottom-0 inset-x-0 z-10 px-4 pt-3 pb-[calc(env(safe-area-inset-bottom)+14px)] bg-gradient-to-t from-black/85 to-transparent flex justify-center">
          <button
            onClick={() => setSheetOpen(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-full bg-white/10 border border-white/20 text-white text-sm font-bold"
          >
            <Eye className="w-4 h-4" />
            {t('story.views', { n: views.length })}
            {likesCount > 0 && (
              <span className="flex items-center gap-1 text-red-400">
                <Heart className="w-3.5 h-3.5 fill-red-500" />
                {likesCount}
              </span>
            )}
          </button>
        </div>
      ) : (
        <div className="absolute bottom-0 inset-x-0 z-10 px-3 pt-3 pb-[calc(env(safe-area-inset-bottom)+12px)] bg-gradient-to-t from-black/85 to-transparent">
          {sentMsg && <p className="text-center text-xs text-emerald-400 font-bold mb-2">{t('story.replySent')}</p>}
          <div className="flex items-center gap-2">
            <input
              value={replyText}
              disabled={!rec || sending}
              maxLength={200}
              onChange={(e) => setReplyText(e.target.value)}
              onFocus={() => setInputFocus(true)}
              onBlur={() => setInputFocus(false)}
              onKeyDown={(e) => e.key === 'Enter' && sendReply()}
              placeholder={t('story.replyPlaceholder')}
              className="flex-1 px-4 py-2.5 rounded-full bg-white/10 border border-white/30 text-white text-sm placeholder:text-white/60 outline-none focus:border-white disabled:opacity-50"
            />
            {replyText.trim() && (
              <button onClick={sendReply} disabled={sending || !rec} className="p-2.5 rounded-full bg-white/15 text-white disabled:opacity-50" aria-label={t('common.send')}>
                {sending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
              </button>
            )}
            <button onClick={toggleLike} disabled={!rec} className="p-2.5 text-white disabled:opacity-50" aria-label={t('story.like')}>
              <Heart className={`w-7 h-7 ${rec?.liked ? 'fill-red-500 text-red-500' : ''}`} />
            </button>
          </div>
        </div>
      )}

      {isOwner && sheetOpen && (
        <>
          <div className="absolute inset-0 z-20 bg-black/50" onClick={() => setSheetOpen(false)} />
          <div className="absolute inset-x-0 bottom-0 z-30 max-h-[65%] flex flex-col bg-dark-950 border-t border-white/10 rounded-t-3xl">
            <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-white/10">
              <div>
                <h3 className="text-sm font-black text-white">{t('story.viewers')}</h3>
                <p className="text-[11px] text-slate-400">
                  {t('story.views', { n: views.length })} · {t('story.likesCount', { n: likesCount })}
                </p>
              </div>
              <button onClick={() => setSheetOpen(false)} className="p-2 text-slate-300" aria-label={t('story.close')}>
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="overflow-y-auto px-4 py-3 space-y-3 pb-[calc(env(safe-area-inset-bottom)+16px)]">
              {views.length === 0 ? (
                <p className="text-center text-sm text-slate-400 py-8">{t('story.noViewers')}</p>
              ) : (
                views.map((v) => {
                  const a = pickAuthor(viewerBriefs, v.viewerId, '...');
                  return (
                    <div key={v.id} className="flex items-start gap-3">
                      <Avatar src={a.photo} seed={v.viewerId} name={a.name} className="w-10 h-10 rounded-full object-cover bg-dark-900" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-white truncate">{a.name}</p>
                        {v.reply && <p className="text-xs text-slate-300 mt-0.5 break-words">{v.reply}</p>}
                      </div>
                      {v.liked && <Heart className="w-5 h-5 fill-red-500 text-red-500 shrink-0 mt-1" />}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </>
      )}
    
      {reportOpen && story && (
        <ReportFlow
          targetType="story"
          targetId={story.id}
          reportedUid={story.authorId}
          reportedName={group.authorName}
          link={profileLink(story.authorId)}
          onClose={() => setReportOpen(false)}
        />
      )}
    </div>
  );
};

export default StoryViewer;
