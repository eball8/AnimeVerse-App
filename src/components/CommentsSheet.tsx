import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { X, Send, Trash2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useI18n } from '../i18n/I18nContext';
import { addComment, deleteComment, subscribeComments } from '../services/postService';
import type { Post, PostComment } from '../services/postService';
import { pickAuthor, useUserBriefs } from '../services/userCache';
import { logAdmin } from '../services/adminLog';
import { timeAgo } from '../utils/timeAgo';
import Avatar from './Avatar';

interface Props {
  post: Post;
  onClose: () => void;
}

const CommentsSheet: React.FC<Props> = ({ post, onClose }) => {
  const { user, profile, isAdmin } = useAuth();
  const { t, lang } = useI18n();
  const navigate = useNavigate();
  const [comments, setComments] = useState<PostComment[]>([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const briefs = useUserBriefs(comments.map((c) => c.authorId));

  useEffect(() => {
    if (!post.id) return;
    const unsub = subscribeComments(post.id, setComments);
    return () => unsub();
  }, [post.id]);

  const send = async () => {
    if (!user || !profile || !text.trim() || sending) return;
    setSending(true);
    try {
      await addComment(post, { uid: user.uid, displayName: profile.displayName, photoURL: profile.photoURL }, text);
      setText('');
    } catch (e: any) {
      alert(t('comments.sendFail') + ' ' + (e?.message || ''));
    }
    setSending(false);
  };

  const remove = async (c: PostComment) => {
    if (!confirm(t('comments.deleteConfirm'))) return;
    try {
      await deleteComment(c);
      if (isAdmin && c.authorId !== user?.uid) logAdmin('delete_comment', 'comment', c.id, c.content.slice(0, 80));
    } catch (e: any) {
      alert(t('common.error') + ' ' + (e?.message || ''));
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-end" onClick={onClose}>
      <div
        className="w-full max-h-[80vh] flex flex-col bg-dark-900 border-t border-white/10 rounded-t-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-white/10">
          <h3 className="text-sm font-black text-white">{t('comments.title')} ({comments.length})</h3>
          <button onClick={onClose} className="p-1 rounded-lg text-slate-400 hover:bg-white/10"><X className="w-5 h-5" /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {comments.length === 0 && <p className="text-center text-xs text-slate-500 py-6">{t('comments.empty')}</p>}
          {comments.map((c) => {
            const a = pickAuthor(briefs, c.authorId, c.authorName, c.authorPhotoURL);
            return (
              <div key={c.id} className="flex gap-3">
                <button onClick={() => { onClose(); navigate(`/user/${c.authorId}`); }} className="shrink-0 self-start">
                  <Avatar src={a.photo} seed={c.authorId} name={a.name} className="w-8 h-8 rounded-full object-cover bg-dark-950" />
                </button>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-white">
                    {a.name} <span className="text-[10px] text-slate-500 font-normal ms-1">{timeAgo(c.createdAt, lang)}</span>
                  </p>
                  <p className="text-sm text-slate-300 break-words">{c.content}</p>
                </div>
                {(c.authorId === user?.uid || isAdmin) && (
                  <button onClick={() => remove(c)} className="p-1 text-red-400 self-start" aria-label={t('common.delete')}>
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            );
          })}
        </div>

        <div className="p-3 border-t border-white/10 flex gap-2 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={500}
            placeholder={t('comments.placeholder')}
            className="flex-1 px-3 py-2.5 rounded-xl bg-dark-950 border border-white/10 text-white text-sm outline-none focus:border-primary-500"
          />
          <button onClick={send} disabled={sending || !text.trim()} className="btn-primary px-4 disabled:opacity-50" aria-label={t('common.send')}>
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default CommentsSheet;
