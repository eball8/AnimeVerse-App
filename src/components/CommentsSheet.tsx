import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { X, Send, Heart, MoreHorizontal, Pencil, Trash2, Flag, Check } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useI18n } from '../i18n/I18nContext';
import {
  addComment, deleteComment, reportComment, subscribeComments, toggleCommentLike, updateComment,
} from '../services/postService';
import type { CommentReplyTarget, CommentReportReason, Post, PostComment } from '../services/postService';
import { pickAuthor, useUserBriefs } from '../services/userCache';
import { logAdmin } from '../services/adminLog';
import { timeAgo } from '../utils/timeAgo';
import Avatar from './Avatar';
import MentionText from './MentionText';
import MentionInput from './MentionInput';
import { useConfirm } from './ConfirmDialog';
import { useMediaLock } from '../utils/mediaManager';
import ReportFlow from './ReportFlow';
import { postLink } from '../utils/links';

interface Props {
  post: Post;
  onClose: () => void;
  /** يُستدعى فوراً بعدد التعليقات الحالي (لتحديث العدّاد في الشاشة الخلفية) */
  onCountChange?: (count: number) => void;
}

const REPORTED_KEY = 'av_reported_comments';
const REPORT_REASONS: CommentReportReason[] = ['spam', 'abuse', 'hate', 'inappropriate', 'misinfo', 'other'];

const readReported = (): string[] => {
  try {
    const v = JSON.parse(localStorage.getItem(REPORTED_KEY) || '[]');
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : [];
  } catch {
    return [];
  }
};

const rememberReported = (id: string): void => {
  try {
    const list = readReported();
    if (!list.includes(id)) localStorage.setItem(REPORTED_KEY, JSON.stringify([...list, id].slice(-300)));
  } catch {
    // لا يؤثر على عمل التطبيق
  }
};

const CommentsSheet: React.FC<Props> = ({ post, onClose, onCountChange }) => {
  const { user, profile, isAdmin } = useAuth();
  const { t, lang } = useI18n();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const [comments, setComments] = useState<PostComment[]>([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [replyTo, setReplyTo] = useState<CommentReplyTarget | null>(null);
  const [editing, setEditing] = useState<PostComment | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [menuFor, setMenuFor] = useState<PostComment | null>(null);
  const [reportFor, setReportFor] = useState<PostComment | null>(null);
  const [toast, setToast] = useState('');
  const inputWrapRef = useRef<HTMLDivElement>(null);
  const toastTimer = useRef<number | undefined>(undefined);
  const likeBusy = useRef<Set<string>>(new Set());
  const briefs = useUserBriefs(comments.map((c) => c.authorId));

  // فتح التعليقات = إيقاف كل الفيديوهات في الخلفية
  useMediaLock();

  useEffect(() => {
    if (!post.id) return;
    const unsub = subscribeComments(post.id, (items) => {
      setComments(items);
      onCountChange?.(items.length);
    });
    return () => unsub();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [post.id]);

  useEffect(() => () => window.clearTimeout(toastTimer.current), []);

  const showToast = (msg: string) => {
    setToast(msg);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(''), 2600);
  };

  const focusInput = () => {
    window.setTimeout(() => {
      const el = inputWrapRef.current?.querySelector('input,textarea') as HTMLInputElement | null;
      el?.focus();
    }, 60);
  };

  // التعليقات الرئيسية + ردودها (مستوى واحد). الرد الذي فُقد أصله يظهر كتعليق رئيسي حتى لا يختفي.
  const { topLevel, repliesOf, byId } = useMemo(() => {
    const ids = new Map<string, PostComment>();
    comments.forEach((c) => ids.set(c.id, c));
    const top: PostComment[] = [];
    const map = new Map<string, PostComment[]>();
    comments.forEach((c) => {
      if (c.parentId && ids.has(c.parentId)) {
        const arr = map.get(c.parentId) || [];
        arr.push(c);
        map.set(c.parentId, arr);
      } else {
        top.push(c);
      }
    });
    return { topLevel: top, repliesOf: map, byId: ids };
  }, [comments]);

  const cancelCompose = () => {
    setReplyTo(null);
    setEditing(null);
    setText('');
  };

  const startReply = (c: PostComment) => {
    const a = pickAuthor(briefs, c.authorId, c.authorName, c.authorPhotoURL);
    const parentId = c.parentId && byId.has(c.parentId) ? c.parentId : c.id;
    setEditing(null);
    setText('');
    setReplyTo({ parentId, uid: c.authorId, name: a.name });
    setExpanded((s) => new Set(s).add(parentId));
    focusInput();
  };

  const startEdit = (c: PostComment) => {
    setMenuFor(null);
    setReplyTo(null);
    setEditing(c);
    setText(c.content);
    focusInput();
  };

  const send = async () => {
    if (!user || !profile || !text.trim() || sending) return;
    setSending(true);
    try {
      if (editing) {
        await updateComment(editing, text);
        setEditing(null);
        setText('');
      } else {
        await addComment(
          post,
          { uid: user.uid, displayName: profile.displayName, photoURL: profile.photoURL },
          text,
          replyTo || undefined
        );
        if (replyTo) setExpanded((s) => new Set(s).add(replyTo.parentId));
        setReplyTo(null);
        setText('');
      }
    } catch (e: any) {
      alert((editing ? t('cm.editFail') : t('comments.sendFail')) + ' ' + (e?.message || ''));
    }
    setSending(false);
  };

  const canDelete = (c: PostComment): boolean => {
    if (!user) return false;
    if (c.authorId === user.uid || isAdmin || post.authorId === user.uid) return true;
    const parent = c.parentId ? byId.get(c.parentId) : undefined;
    return !!parent && parent.authorId === user.uid;
  };

  const remove = async (c: PostComment) => {
    setMenuFor(null);
    const hasReplies = !c.parentId && (repliesOf.get(c.id)?.length || 0) > 0;
    if (!(await confirm({ title: hasReplies ? t('cm.deleteWithReplies') : t('comments.deleteConfirm') }))) return;
    try {
      await deleteComment(c, comments);
      if (editing?.id === c.id || replyTo?.parentId === c.id) cancelCompose();
      if (isAdmin && c.authorId !== user?.uid) logAdmin('delete_comment', 'comment', c.id, c.content.slice(0, 80));
    } catch (e: any) {
      alert(t('common.error') + ' ' + (e?.message || ''));
    }
  };

  const like = async (c: PostComment) => {
    if (!user || likeBusy.current.has(c.id)) return;
    likeBusy.current.add(c.id);
    try {
      await toggleCommentLike(c, user.uid);
    } catch (e) {
      console.error('comment like failed:', e);
      showToast(t('cm.likeFail'));
    } finally {
      likeBusy.current.delete(c.id);
    }
  };

  const openReport = (c: PostComment) => {
    setMenuFor(null);
    if (readReported().includes(c.id)) {
      showToast(t('cm.reportAgain'));
      return;
    }
    setReportFor(c);
  };

  const goProfile = (uid: string) => {
    onClose();
    navigate(`/user/${uid}`);
  };

  const renderRow = (c: PostComment, isReply: boolean) => {
    const a = pickAuthor(briefs, c.authorId, c.authorName, c.authorPhotoURL);
    const liked = !!user && (c.likedBy || []).includes(user.uid);
    const likes = Math.max(0, c.likesCount || 0);
    return (
      <div key={c.id} className="flex gap-3">
        <button onClick={() => goProfile(c.authorId)} className="shrink-0 self-start">
          <Avatar
            src={a.photo}
            seed={c.authorId}
            name={a.name}
            className={`${isReply ? 'w-6 h-6' : 'w-8 h-8'} rounded-full object-cover bg-dark-950`}
          />
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-bold text-white flex items-center gap-1.5 flex-wrap">
            <span className="selectable">{a.name}</span>
            {c.authorId === post.authorId && (
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-primary-500/20 text-primary-300">
                {t('cm.creator')}
              </span>
            )}
          </p>
          <p className="selectable text-sm text-slate-300 break-words whitespace-pre-wrap">
            {isReply && c.replyToUid && c.replyToName && (
              <button
                onClick={() => goProfile(c.replyToUid as string)}
                className="text-primary-400 font-bold me-1.5"
              >
                {c.replyToName}
              </button>
            )}
            <MentionText text={c.content} onNavigate={onClose} />
          </p>
          <div className="flex items-center gap-3 mt-1 text-[11px] text-slate-500">
            <span>{timeAgo(c.createdAt, lang)}</span>
            {c.edited && <span>· {t('cm.edited')}</span>}
            {likes > 0 && <span className="font-bold">{t('cm.likesCount', { count: likes })}</span>}
            {user && (
              <button onClick={() => startReply(c)} className="font-bold text-slate-400 hover:text-white">
                {t('cm.reply')}
              </button>
            )}
            {user && (
              <button
                onClick={() => setMenuFor(c)}
                aria-label={t('cm.more')}
                className="p-0.5 rounded-md text-slate-500 hover:text-white"
              >
                <MoreHorizontal className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
        <button
          onClick={() => like(c)}
          disabled={!user}
          aria-label={t('cm.like')}
          className="shrink-0 self-start p-1.5 rounded-full active:scale-90 transition"
        >
          <Heart className={`w-4 h-4 ${liked ? 'text-red-500 fill-red-500' : 'text-slate-500'}`} />
        </button>
      </div>
    );
  };

  const replyBanner = editing ? t('cm.editing') : replyTo ? t('cm.replyingTo', { name: replyTo.name }) : '';
  const placeholder = replyTo ? t('cm.replyPlaceholder') : t('comments.placeholder');

  // نعرض النافذة داخل body حتى تكون فوق الهيدر والشريط السفلي (كانت تختفي خلفهما داخل الريلز)
  return createPortal(
    <div className="fixed inset-0 z-[90] bg-black/70 flex items-end" onClick={onClose}>
      <div
        className="relative w-full max-w-2xl mx-auto h-[80vh] flex flex-col bg-dark-900 border-t border-white/10 rounded-t-3xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-white/10">
          <h3 className="text-sm font-black text-white">{t('comments.title')} ({comments.length})</h3>
          <button onClick={onClose} className="p-1 rounded-lg text-slate-400 hover:bg-white/10"><X className="w-5 h-5" /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {comments.length === 0 && <p className="text-center text-xs text-slate-500 py-6">{t('comments.empty')}</p>}
          {topLevel.map((c) => {
            const replies = repliesOf.get(c.id) || [];
            const open = expanded.has(c.id);
            return (
              <div key={c.id} className="space-y-3">
                {renderRow(c, false)}
                {replies.length > 0 && (
                  <div className="ms-11 space-y-3">
                    <button
                      onClick={() =>
                        setExpanded((s) => {
                          const n = new Set(s);
                          if (n.has(c.id)) n.delete(c.id);
                          else n.add(c.id);
                          return n;
                        })
                      }
                      className="flex items-center gap-2 text-[11px] font-bold text-slate-500 hover:text-slate-300"
                    >
                      <span className="w-6 h-px bg-slate-600" />
                      {open ? t('cm.hideReplies') : t('cm.viewReplies', { count: replies.length })}
                    </button>
                    {open && replies.map((r) => renderRow(r, true))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {toast && (
          <div className="absolute inset-x-0 bottom-24 flex justify-center pointer-events-none z-20">
            <span className="px-4 py-2 rounded-full bg-black/85 border border-white/10 text-xs font-bold text-white shadow-lg">
              {toast}
            </span>
          </div>
        )}

        {replyBanner && (
          <div className="flex items-center justify-between gap-2 px-4 py-2 border-t border-white/10 bg-dark-950/60 text-[11px] text-slate-400">
            <span className="truncate flex items-center gap-1.5">
              {editing && <Pencil className="w-3.5 h-3.5 text-primary-400" />}
              {replyBanner}
            </span>
            <button onClick={cancelCompose} className="p-1 rounded-md hover:bg-white/10" aria-label={t('cm.cancel')}>
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        <div
          ref={inputWrapRef}
          className="p-3 border-t border-white/10 flex gap-2 pb-[calc(0.75rem+env(safe-area-inset-bottom))]"
        >
          <MentionInput
            value={text}
            onChange={setText}
            onKeyDown={(e) => e.key === 'Enter' && send()}
            maxLength={500}
            popup="top"
            placeholder={placeholder}
            className="w-full px-3 py-2.5 rounded-xl bg-dark-950 border border-white/10 text-white text-sm outline-none focus:border-primary-500"
          />
          <button
            onClick={send}
            disabled={sending || !text.trim()}
            className="btn-primary px-4 disabled:opacity-50"
            aria-label={editing ? t('cm.save') : t('common.send')}
          >
            {editing ? <Check className="w-4 h-4" /> : <Send className="w-4 h-4" />}
          </button>
        </div>

        {/* قائمة خيارات التعليق (تعديل / حذف / إبلاغ) */}
        {menuFor && (
          <div className="absolute inset-0 z-30 bg-black/60 flex items-end" onClick={() => setMenuFor(null)}>
            <div
              className="w-full bg-dark-900 border-t border-white/10 rounded-t-3xl p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] animate-slide-up"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mx-auto w-10 h-1 rounded-full bg-white/15 mb-3" />
              {menuFor.authorId === user?.uid && (
                <button
                  onClick={() => startEdit(menuFor)}
                  className="w-full flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-bold text-white hover:bg-white/5"
                >
                  <Pencil className="w-5 h-5 text-slate-300" /> {t('cm.edit')}
                </button>
              )}
              {canDelete(menuFor) && (
                <button
                  onClick={() => remove(menuFor)}
                  className="w-full flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-bold text-red-400 hover:bg-red-500/10"
                >
                  <Trash2 className="w-5 h-5" /> {t('cm.delete')}
                </button>
              )}
              {menuFor.authorId !== user?.uid && (
                <button
                  onClick={() => openReport(menuFor)}
                  className="w-full flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-bold text-red-400 hover:bg-red-500/10"
                >
                  <Flag className="w-5 h-5" /> {t('cm.report')}
                </button>
              )}
              <button
                onClick={() => setMenuFor(null)}
                className="w-full mt-1 px-3 py-3 rounded-xl text-sm font-bold text-slate-400 hover:bg-white/5"
              >
                {t('cm.cancel')}
              </button>
            </div>
          </div>
        )}

        {/* نافذة البلاغ الموحّدة */}
        {reportFor && (
          <ReportFlow
            targetType="comment"
            targetId={reportFor.id}
            reportedUid={reportFor.authorId}
            reportedName={reportFor.authorName}
            link={post.id ? postLink(post.id) : undefined}
            onClose={() => setReportFor(null)}
            onDone={() => rememberReported(reportFor.id)}
          />
        )}
      </div>
    </div>,
    document.body
  );
};

export default CommentsSheet;
