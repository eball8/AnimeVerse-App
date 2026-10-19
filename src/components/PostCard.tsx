import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { Browser } from '@capacitor/browser';
import { doc, updateDoc } from 'firebase/firestore';
import {
  Heart, MessageCircle, Share2, Link2, Check, Repeat2, Clapperboard,
  MoreHorizontal, Pencil, Trash2, X, Loader2,
} from 'lucide-react';
import { db } from '../config/firebase';
import type { Post } from '../services/postService';
import Avatar from './Avatar';
import { timeAgo } from '../utils/timeAgo';
import { copyText, postLink, reelLink, shareLink, videoThumb } from '../utils/links';
import { useI18n } from '../i18n/I18nContext';
import { useAuth } from '../context/AuthContext';

interface Props {
  post: Post;
  liked: boolean;
  canDelete: boolean;
  authorName: string;
  authorPhoto?: string;
  repostName?: string;
  onLike: (p: Post) => void;
  onComment: (p: Post) => void;
  onDelete: (p: Post) => void;
}

const TXT = {
  ar: {
    menu: 'خيارات المنشور',
    edit: 'التعديل على المنشور',
    editTitle: 'تعديل المنشور',
    del: 'حذف المنشور',
    shareVia: 'مشاركة عبر',
    more: 'المزيد',
    copied: 'تم نسخ الرابط',
    save: 'حفظ التعديل',
    empty: 'لا يمكن ترك المنشور فارغاً.',
    saveFail: 'تعذّر حفظ التعديل.',
    placeholder: 'اكتب شيئاً...',
  },
  en: {
    menu: 'Post options',
    edit: 'Edit post',
    editTitle: 'Edit post',
    del: 'Delete post',
    shareVia: 'Share via',
    more: 'More',
    copied: 'Link copied',
    save: 'Save changes',
    empty: 'The post cannot be empty.',
    saveFail: 'Could not save the changes.',
    placeholder: 'Write something...',
  },
};

const openExternal = async (href: string) => {
  try {
    if (Capacitor.isNativePlatform()) await Browser.open({ url: href });
    else window.open(href, '_blank', 'noopener,noreferrer');
  } catch {
    window.open(href, '_blank');
  }
};

const TARGETS: { id: string; label: string; bg: string; glyph: string; href: (u: string, t: string) => string }[] = [
  {
    id: 'wa',
    label: 'WhatsApp',
    bg: 'bg-[#25D366]',
    glyph: 'W',
    href: (u, t) => `https://wa.me/?text=${encodeURIComponent(`${t} ${u}`)}`,
  },
  {
    id: 'tg',
    label: 'Telegram',
    bg: 'bg-[#229ED9]',
    glyph: 'T',
    href: (u, t) => `https://t.me/share/url?url=${encodeURIComponent(u)}&text=${encodeURIComponent(t)}`,
  },
  {
    id: 'fb',
    label: 'Facebook',
    bg: 'bg-[#1877F2]',
    glyph: 'f',
    href: (u) => `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(u)}`,
  },
  {
    id: 'x',
    label: 'X',
    bg: 'bg-black border border-white/20',
    glyph: 'X',
    href: (u, t) => `https://twitter.com/intent/tweet?url=${encodeURIComponent(u)}&text=${encodeURIComponent(t)}`,
  },
];

const PostCard: React.FC<Props> = ({
  post, liked, canDelete, authorName, authorPhoto, repostName, onLike, onComment, onDelete,
}) => {
  const navigate = useNavigate();
  const { t, lang } = useI18n();
  const { user } = useAuth();
  const L = lang === 'ar' ? TXT.ar : TXT.en;

  const [flash, setFlash] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  // نص محلي بعد التعديل (صفحة المنشور الواحد لا تتحدث لحظياً)
  const [localContent, setLocalContent] = useState<string | null>(null);

  useEffect(() => {
    setLocalContent(null);
  }, [post.content]);

  const content = localContent ?? post.content;
  const isVideo = post.mediaType === 'video';
  const url = post.id ? (isVideo ? reelLink(post.id) : postLink(post.id)) : '';
  const isOwner = !!user && post.authorId === user.uid;
  const canEdit = isOwner && !!post.id;
  const shareText = (content || authorName).slice(0, 100);

  const doFlash = () => {
    setFlash(true);
    setTimeout(() => setFlash(false), 1500);
  };

  const onCopy = async () => {
    if (url && (await copyText(url))) doFlash();
  };

  const onShare = async () => {
    if (!url) return;
    const r = await shareLink(url, authorName);
    if (r === 'copied') doFlash();
  };

  const startEdit = () => {
    setMenuOpen(false);
    setDraft(content || '');
    setErr('');
    setEditing(true);
  };

  const saveEdit = async () => {
    if (!post.id || saving) return;
    const next = draft.trim().slice(0, 2000);
    if (!next && !post.mediaUrl && !post.repostOfId) {
      setErr(L.empty);
      return;
    }
    setSaving(true);
    setErr('');
    try {
      await updateDoc(doc(db, 'posts', post.id), { content: next });
      setLocalContent(next);
      setEditing(false);
    } catch (e) {
      console.error(e);
      setErr(L.saveFail);
    } finally {
      setSaving(false);
    }
  };

  const menuRow =
    'w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl text-sm font-bold text-slate-200 bg-white/5 active:bg-white/10 transition';

  return (
    <div className="card p-4 space-y-3">
      {repostName && (
        <p className="text-[11px] text-slate-400 flex items-center gap-1.5">
          <Repeat2 className="w-3.5 h-3.5" /> {t('post.repostedFrom', { name: repostName })}
        </p>
      )}

      <div className="flex items-center gap-3">
        <button onClick={() => navigate(`/user/${post.authorId}`)} className="shrink-0">
          <Avatar
            src={authorPhoto}
            seed={post.authorId}
            name={authorName}
            className="w-10 h-10 rounded-full object-cover bg-dark-900 ring-1 ring-white/10"
          />
        </button>
        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-bold text-white truncate">{authorName}</h4>
          <p className="text-[10px] text-slate-500">{timeAgo(post.createdAt, lang)}</p>
        </div>
        {post.id && (
          <button
            onClick={() => setMenuOpen(true)}
            aria-label={L.menu}
            title={L.menu}
            className="shrink-0 w-9 h-9 rounded-full flex items-center justify-center text-slate-300 bg-white/5 border border-white/10 hover:bg-white/10 active:scale-90 transition"
          >
            <MoreHorizontal className="w-5 h-5" />
          </button>
        )}
      </div>

      {content && <p className="text-sm text-slate-200 break-words whitespace-pre-wrap">{content}</p>}

      {post.mediaUrl && (
        <div className="rounded-2xl overflow-hidden bg-black border border-white/5 relative">
          {isVideo ? (
            <>
              <video
                src={post.mediaUrl}
                poster={videoThumb(post.mediaUrl)}
                controls
                playsInline
                preload="none"
                className="w-full max-h-[400px] object-contain"
              />
              {post.id && (
                <button
                  onClick={() => navigate(`/reels/${post.id}`)}
                  className="absolute top-2 end-2 p-1.5 rounded-lg bg-black/60 text-white"
                  aria-label="Reels"
                >
                  <Clapperboard className="w-4 h-4" />
                </button>
              )}
            </>
          ) : (
            <img src={post.mediaUrl} alt="media" loading="lazy" className="w-full max-h-[400px] object-cover" />
          )}
        </div>
      )}

      <div className="flex items-center justify-between pt-2 border-t border-white/5">
        <button
          onClick={() => onLike(post)}
          className={`flex items-center gap-1.5 transition ${liked ? 'text-red-400' : 'text-slate-400'}`}
        >
          <Heart className={`w-5 h-5 ${liked ? 'fill-red-400' : ''}`} />
          <span className="text-xs">{post.likesCount}</span>
        </button>
        <button onClick={() => onComment(post)} className="flex items-center gap-1.5 text-slate-400">
          <MessageCircle className="w-5 h-5" />
          <span className="text-xs">{post.commentsCount}</span>
        </button>
        <button onClick={onCopy} className="flex items-center gap-1.5 text-slate-400" aria-label={t('common.copyLink')}>
          {flash ? <Check className="w-5 h-5 text-emerald-400" /> : <Link2 className="w-5 h-5" />}
        </button>
        <button onClick={onShare} className="flex items-center gap-1.5 text-slate-400" aria-label={t('common.share')}>
          <Share2 className="w-5 h-5" />
        </button>
      </div>

      {/* قائمة الثلاث نقاط */}
      {menuOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-end" onClick={() => setMenuOpen(false)}>
          <div
            className="w-full bg-dark-900 border-t border-white/10 rounded-t-3xl p-4 space-y-2 pb-[max(1rem,env(safe-area-inset-bottom))]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-1">
              <h3 className="text-sm font-black text-white">{L.menu}</h3>
              <button onClick={() => setMenuOpen(false)} className="p-1 rounded-lg text-slate-400 hover:bg-white/10">
                <X className="w-5 h-5" />
              </button>
            </div>

            {canEdit && (
              <button onClick={startEdit} className={menuRow}>
                <Pencil className="w-5 h-5 text-primary-400" /> {L.edit}
              </button>
            )}

            <button
              onClick={async () => {
                await onCopy();
                setMenuOpen(false);
              }}
              className={menuRow}
            >
              <Link2 className="w-5 h-5 text-primary-400" /> {t('common.copyLink')}
            </button>

            <button
              onClick={async () => {
                setMenuOpen(false);
                await onShare();
              }}
              className={menuRow}
            >
              <Share2 className="w-5 h-5 text-primary-400" /> {t('common.share')}
            </button>

            {url && (
              <div className="pt-2">
                <p className="text-[11px] text-slate-500 pb-2">{L.shareVia}</p>
                <div className="grid grid-cols-4 gap-2">
                  {TARGETS.map((tg) => (
                    <button
                      key={tg.id}
                      onClick={() => {
                        setMenuOpen(false);
                        openExternal(tg.href(url, shareText));
                      }}
                      className="flex flex-col items-center gap-1.5 active:scale-95 transition"
                    >
                      <span
                        className={`w-12 h-12 rounded-2xl flex items-center justify-center text-white text-lg font-black ${tg.bg}`}
                      >
                        {tg.glyph}
                      </span>
                      <span className="text-[10px] text-slate-400">{tg.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {canDelete && (
              <button
                onClick={() => {
                  setMenuOpen(false);
                  onDelete(post);
                }}
                className="w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl text-sm font-bold text-red-400 bg-red-500/10 border border-red-500/20 active:bg-red-500/20 transition mt-2"
              >
                <Trash2 className="w-5 h-5" /> {L.del}
              </button>
            )}
          </div>
        </div>
      )}

      {/* نافذة تعديل المنشور */}
      {editing && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-end" onClick={() => !saving && setEditing(false)}>
          <div
            className="w-full bg-dark-900 border-t border-white/10 rounded-t-3xl p-4 space-y-3 pb-[max(1rem,env(safe-area-inset-bottom))]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-black text-white">{L.editTitle}</h3>
              <button
                onClick={() => !saving && setEditing(false)}
                className="p-1 rounded-lg text-slate-400 hover:bg-white/10"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              maxLength={2000}
              rows={6}
              placeholder={L.placeholder}
              className="w-full p-3 rounded-2xl bg-dark-950 border border-white/10 text-white text-sm outline-none focus:border-primary-500 resize-none"
            />
            <div className="flex items-center justify-between text-[11px] text-slate-500">
              <span className="text-red-400">{err}</span>
              <span className="tabular-nums">{draft.length}/2000</span>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setEditing(false)}
                disabled={saving}
                className="flex-1 py-3 rounded-2xl bg-white/5 border border-white/10 text-slate-300 text-sm font-bold disabled:opacity-50"
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={saveEdit}
                disabled={saving || draft.trim() === (content || '').trim()}
                className="flex-1 btn-primary py-3 rounded-2xl text-sm font-bold disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {saving && <Loader2 className="w-4 h-4 animate-spin" />} {L.save}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PostCard;
