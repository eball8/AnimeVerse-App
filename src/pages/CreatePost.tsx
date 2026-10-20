import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  X, Camera, Image as ImageIcon, Video, Check, Play, Loader2, ImagePlus,
  Settings, Film, ShieldCheck,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { uploadVideoToCloudinary } from '../services/cloudinaryService';
import { createPost } from '../services/postService';
import { createStory } from '../services/storyService';
import {
  isNativeGallery, checkGalleryAccess, requestGalleryAccess, openAppSettings,
  fetchGalleryPage, galleryMediaToFile, formatDuration,
} from '../services/galleryService';
import type { GalleryMedia } from '../services/galleryService';
import { useI18n } from '../i18n/I18nContext';

type Mode = 'post' | 'story';
type Filter = 'all' | 'images' | 'videos';
type Access = 'checking' | 'granted' | 'denied';

const MAX_BYTES = 50 * 1024 * 1024;

const FILTERS: { key: Filter; labelKey: string }[] = [
  { key: 'all', labelKey: 'cp.fAll' },
  { key: 'images', labelKey: 'cp.fImages' },
  { key: 'videos', labelKey: 'cp.fVideos' },
];

const CreatePost: React.FC = () => {
  const navigate = useNavigate();
  const { t } = useI18n();
  const [params, setParams] = useSearchParams();
  const { user, profile } = useAuth();

  const mode: Mode = params.get('mode') === 'story' ? 'story' : 'post';

  const [content, setContent] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [mediaType, setMediaType] = useState<'image' | 'video' | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');

  const native = isNativeGallery();
  const [access, setAccess] = useState<Access>(native ? 'checking' : 'granted');
  const [askedOnce, setAskedOnce] = useState(false);
  const [filter, setFilter] = useState<Filter>('all');
  const [medias, setMedias] = useState<GalleryMedia[]>([]);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const offsetRef = useRef(0);
  const reqRef = useRef(0);
  const loadingRef = useRef(false);
  const previewRef = useRef<string | null>(null);

  const askForAccess = useCallback(async () => {
    setAccess('checking');
    const res = await requestGalleryAccess();
    setAskedOnce(true);
    setAccess(res.media ? 'granted' : 'denied');
  }, []);

  useEffect(() => {
    if (!native) return;
    let cancelled = false;
    (async () => {
      const current = await checkGalleryAccess();
      if (cancelled) return;
      if (current.media && current.camera) {
        setAccess('granted');
        return;
      }
      const res = await requestGalleryAccess();
      if (cancelled) return;
      setAskedOnce(true);
      setAccess(res.media ? 'granted' : 'denied');
    })();
    return () => {
      cancelled = true;
    };
  }, [native]);

  useEffect(() => {
    if (!native || access !== 'denied') return;
    const onVisible = async () => {
      if (document.visibilityState !== 'visible') return;
      const res = await checkGalleryAccess();
      if (res.media) setAccess('granted');
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [native, access]);

  const loadMore = useCallback(
    async (reset: boolean) => {
      if (loadingRef.current && !reset) return;
      const mine = ++reqRef.current;
      loadingRef.current = true;
      setLoadingMore(true);
      try {
        const offset = reset ? 0 : offsetRef.current;
        const res = await fetchGalleryPage(offset, filter);
        if (mine !== reqRef.current) return;
        offsetRef.current = offset + res.medias.length;
        setMedias((prev) => (reset ? res.medias : [...prev, ...res.medias]));
        setHasMore(res.hasMore);
      } catch (e: any) {
        if (mine !== reqRef.current) return;
        setHasMore(false);
        if (String(e?.message || e).includes('NO_PERMISSION')) setAccess('denied');
        else setError(t('cp.errGallery'));
      } finally {
        if (mine === reqRef.current) {
          loadingRef.current = false;
          setLoadingMore(false);
        }
      }
    },
    [filter]
  );

  useEffect(() => {
    if (!native || access !== 'granted') return;
    setMedias([]);
    setHasMore(true);
    offsetRef.current = 0;
    loadMore(true);
  }, [native, access, loadMore]);

  useEffect(() => {
    if (!native || access !== 'granted' || !hasMore) return;
    const el = sentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !loadingRef.current) loadMore(false);
      },
      { root: scrollRef.current, rootMargin: '400px' }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [native, access, hasMore, medias.length, loadMore]);

  useEffect(() => {
    previewRef.current = preview;
  }, [preview]);
  useEffect(
    () => () => {
      if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    },
    []
  );

  const applyFile = (selected: File): boolean => {
    if (selected.size > MAX_BYTES) {
      setError(t('cp.errTooBig'));
      return false;
    }
    if (!selected.type.startsWith('image/') && !selected.type.startsWith('video/')) {
      setError(t('cp.errNotMedia'));
      return false;
    }
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    setFile(selected);
    setMediaType(selected.type.startsWith('video/') ? 'video' : 'image');
    setPreview(URL.createObjectURL(selected));
    setError('');
    return true;
  };

  const clearMedia = () => {
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    setFile(null);
    setPreview(null);
    setMediaType(null);
    setSelectedId(null);
  };

  const scrollTop = () => scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });

  const onInputFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    e.target.value = '';
    if (!selected) return;
    setSelectedId(null);
    if (applyFile(selected)) scrollTop();
  };

  const pickFromGallery = async (m: GalleryMedia) => {
    if (uploading || picking) return;
    if (selectedId === m.id) {
      clearMedia();
      return;
    }
    setSelectedId(m.id);
    setPicking(true);
    setError('');
    try {
      const f = await galleryMediaToFile(m);
      if (applyFile(f)) scrollTop();
      else setSelectedId(null);
    } catch (e: any) {
      console.error(e);
      setError(t('cp.errOpenFile'));
      setSelectedId(null);
    } finally {
      setPicking(false);
    }
  };

  const setMode = (m: Mode) => {
    const next = new URLSearchParams(params);
    if (m === 'story') next.set('mode', 'story');
    else next.delete('mode');
    setParams(next, { replace: true });
    setError('');
  };

  if (!user) {
    navigate('/login');
    return null;
  }
  if (!profile) {
    return (
      <div className="fixed inset-0 bg-dark-950 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary-400" />
      </div>
    );
  }

  const canPublish = mode === 'story' ? !!file : !!file || content.trim().length > 0;

  const handlePublish = async () => {
    if (!canPublish || uploading) {
      setError(mode === 'story' ? t('cp.errStoryNeed') : t('cp.errPostNeed'));
      return;
    }
    setUploading(true);
    setProgress(0);
    setError('');
    try {
      let mediaUrl = '';
      if (file) mediaUrl = await uploadVideoToCloudinary(file, (p: number) => setProgress(p));

      if (mode === 'story') {
        await createStory({
          authorId: user.uid,
          authorName: profile.displayName,
          authorPhotoURL: profile.photoURL,
          mediaUrl,
          mediaType: mediaType || 'image',
          caption: content,
        });
      } else {
        await createPost({
          authorId: user.uid,
          authorName: profile.displayName,
          authorPhotoURL: profile.photoURL,
          content: content.trim(),
          mediaUrl,
          mediaType: mediaType || undefined,
        });
      }
      navigate('/community', { replace: true });
    } catch (err: any) {
      console.error(err);
      setError(err?.message || t('cp.errPublish'));
      setUploading(false);
    }
  };

  const avatar = profile.photoURL || `https://api.dicebear.com/7.x/bottts/svg?seed=${profile.uid}`;

  const mediaPreview = preview && (
    <>
      {mediaType === 'video' ? (
        <video
          src={preview}
          controls
          playsInline
          className={mode === 'story' ? 'w-full h-full object-cover' : 'w-full max-h-[42vh] object-contain'}
        />
      ) : (
        <img
          src={preview}
          alt=""
          className={mode === 'story' ? 'w-full h-full object-cover' : 'w-full max-h-[42vh] object-contain'}
        />
      )}
      <button
        onClick={clearMedia}
        disabled={uploading}
        className="absolute top-2.5 start-2.5 z-10 w-8 h-8 rounded-full bg-black/60 backdrop-blur text-white flex items-center justify-center active:scale-90 transition"
        aria-label={t('cp.remove')}
      >
        <X className="w-4 h-4" />
      </button>
    </>
  );

  return (
    <div className="fixed inset-0 bg-dark-950 flex flex-col">
      <header className="shrink-0 z-40 bg-dark-950/95 backdrop-blur-md border-b border-white/10 pt-[env(safe-area-inset-top)]">
        <div className="h-14 px-3 flex items-center justify-between">
          <div className="flex items-center gap-1">
            <button
              onClick={() => navigate(-1)}
              disabled={uploading}
              className="w-10 h-10 rounded-full flex items-center justify-center text-slate-200 active:bg-white/10"
              aria-label={t('cp.close')}
            >
              <X className="w-6 h-6" />
            </button>
            <h1 className="text-base font-black text-white">{mode === 'story' ? t('cp.newStory') : t('cp.newPost')}</h1>
          </div>

          <button
            onClick={handlePublish}
            disabled={uploading || picking || !canPublish}
            className="h-9 min-w-[76px] px-5 rounded-full bg-gradient-to-tr from-primary-500 to-accent-500 text-white text-sm font-black shadow-lg shadow-primary-500/30 disabled:opacity-40 disabled:shadow-none active:scale-95 transition flex items-center justify-center"
          >
            {mode === 'story' ? t('cp.shareStory') : t('cp.publish')}
          </button>
        </div>
      </header>

      <div ref={scrollRef} className="flex-1 overflow-y-auto overscroll-contain">
        <div className="px-4 pt-3">
          <div className="p-1 rounded-2xl bg-white/5 border border-white/10 flex">
            {(['post', 'story'] as Mode[]).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                disabled={uploading}
                className={`flex-1 h-9 rounded-xl text-xs font-black flex items-center justify-center gap-1.5 transition ${
                  mode === m
                    ? 'bg-gradient-to-tr from-primary-500 to-accent-500 text-white shadow-md shadow-primary-500/25'
                    : 'text-slate-400'
                }`}
              >
                {m === 'post' ? <ImageIcon className="w-4 h-4" /> : <Film className="w-4 h-4" />}
                {m === 'post' ? t('cp.tabPost') : t('cp.tabStory')}
              </button>
            ))}
          </div>
        </div>

        {mode === 'post' ? (
          <div className="px-4 pt-4 space-y-3">
            <div className="flex gap-3">
              <img src={avatar} alt="" className="w-11 h-11 rounded-full object-cover ring-2 ring-primary-500/40 bg-dark-900 shrink-0" />
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                maxLength={2000}
                rows={3}
                disabled={uploading}
                placeholder={t('cp.placeholderPost')}
                className="flex-1 bg-transparent text-white text-[15px] leading-relaxed placeholder:text-slate-500 outline-none resize-none pt-2"
              />
            </div>
            {preview && (
              <div className="relative rounded-3xl overflow-hidden border border-white/10 bg-black">{mediaPreview}</div>
            )}
          </div>
        ) : (
          <div className="px-4 pt-4">
            <div className="relative mx-auto h-[46vh] max-h-[480px] aspect-[9/16] rounded-[28px] overflow-hidden border border-white/10 bg-gradient-to-b from-dark-800 to-dark-900">
              {preview ? (
                mediaPreview
              ) : (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-center px-6">
                  <div className="w-16 h-16 rounded-full bg-gradient-to-tr from-primary-500/30 to-accent-500/30 flex items-center justify-center">
                    <Film className="w-8 h-8 text-primary-300" />
                  </div>
                  <p className="text-sm font-bold text-slate-300">{t('cp.storyPick')}</p>
                  <p className="text-[11px] text-slate-500">{t('cp.story24')}</p>
                </div>
              )}
              {preview && (
                <div className="absolute bottom-0 inset-x-0 z-10 bg-gradient-to-t from-black/80 via-black/40 to-transparent pt-12 pb-3 px-3 pointer-events-none">
                  <input
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    maxLength={200}
                    disabled={uploading}
                    placeholder={t('cp.storyCaption')}
                    className="pointer-events-auto w-full bg-white/10 backdrop-blur rounded-full px-4 h-10 text-sm text-white placeholder:text-white/50 outline-none border border-white/15"
                  />
                </div>
              )}
              {picking && (
                <div className="absolute inset-0 z-20 bg-black/50 flex items-center justify-center">
                  <Loader2 className="w-8 h-8 animate-spin text-white" />
                </div>
              )}
            </div>
          </div>
        )}

        {error && (
          <p className="mx-4 mt-3 text-xs text-red-300 bg-red-500/10 border border-red-500/20 p-2.5 rounded-xl">{error}</p>
        )}

        <div className="mt-5">
          <div className="px-4 flex items-center justify-between mb-2.5">
            <h2 className="text-sm font-black text-white">{native ? t('cp.gallery') : t('cp.addMedia')}</h2>
            {native && access === 'granted' && (
              <div className="flex gap-1.5">
                {FILTERS.map((f) => (
                  <button
                    key={f.key}
                    onClick={() => setFilter(f.key)}
                    className={`h-7 px-3 rounded-full text-[11px] font-bold border transition ${
                      filter === f.key
                        ? 'bg-white text-dark-950 border-white'
                        : 'bg-white/5 text-slate-300 border-white/10'
                    }`}
                  >
                    {t(f.labelKey)}
                  </button>
                ))}
              </div>
            )}
          </div>

          {!native && (
            <div className="px-4 grid grid-cols-2 gap-3">
              <button
                onClick={() => galleryInputRef.current?.click()}
                disabled={uploading}
                className="h-28 rounded-3xl bg-white/5 border border-white/10 flex flex-col items-center justify-center gap-2 active:bg-white/10 transition"
              >
                <ImageIcon className="w-7 h-7 text-emerald-400" />
                <span className="text-xs font-bold text-slate-200">{t('cp.photoVideo')}</span>
              </button>
              <button
                onClick={() => cameraInputRef.current?.click()}
                disabled={uploading}
                className="h-28 rounded-3xl bg-white/5 border border-white/10 flex flex-col items-center justify-center gap-2 active:bg-white/10 transition"
              >
                <Camera className="w-7 h-7 text-blue-400" />
                <span className="text-xs font-bold text-slate-200">{t('cp.camera')}</span>
              </button>
            </div>
          )}

          {native && access === 'checking' && (
            <div className="py-16 flex justify-center">
              <Loader2 className="w-8 h-8 animate-spin text-primary-400" />
            </div>
          )}

          {native && access === 'denied' && (
            <div className="mx-4 rounded-3xl bg-gradient-to-b from-white/[0.07] to-white/[0.02] border border-white/10 p-6 text-center space-y-4">
              <div className="mx-auto w-20 h-20 rounded-full bg-gradient-to-tr from-primary-500 to-accent-500 flex items-center justify-center shadow-xl shadow-primary-500/30">
                <ImagePlus className="w-10 h-10 text-white" />
              </div>
              <div className="space-y-1.5">
                <h3 className="text-base font-black text-white">{t('cp.allowTitle')}</h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                  {t('cp.allowDesc')}
                </p>
              </div>
              <div className="flex justify-center gap-6 text-[11px] text-slate-300 font-semibold">
                <span className="flex flex-col items-center gap-1.5">
                  <ImageIcon className="w-5 h-5 text-emerald-400" /> {t('cp.photos')}
                </span>
                <span className="flex flex-col items-center gap-1.5">
                  <Video className="w-5 h-5 text-blue-400" /> {t('cp.videos')}
                </span>
                <span className="flex flex-col items-center gap-1.5">
                  <Camera className="w-5 h-5 text-amber-400" /> {t('cp.camera')}
                </span>
              </div>
              <button
                onClick={askForAccess}
                className="w-full h-11 rounded-2xl bg-gradient-to-tr from-primary-500 to-accent-500 text-white text-sm font-black active:scale-[0.98] transition flex items-center justify-center gap-2"
              >
                <ShieldCheck className="w-5 h-5" /> {t('cp.allow')}
              </button>
              {askedOnce && (
                <button
                  onClick={openAppSettings}
                  className="w-full h-10 rounded-2xl bg-white/5 border border-white/10 text-slate-200 text-xs font-bold flex items-center justify-center gap-2"
                >
                  <Settings className="w-4 h-4" /> {t('cp.openSettings')}
                </button>
              )}
              <button
                onClick={() => cameraInputRef.current?.click()}
                className="text-[11px] text-slate-500 underline underline-offset-4"
              >
                {t('cp.takePhoto')}
              </button>
            </div>
          )}

          {native && access === 'granted' && (
            <>
              <div className="grid grid-cols-4 gap-[2px]">
                <button
                  onClick={() => cameraInputRef.current?.click()}
                  disabled={uploading}
                  className="relative aspect-square bg-gradient-to-br from-primary-600/40 to-accent-600/40 flex flex-col items-center justify-center gap-1 active:opacity-80"
                >
                  <Camera className="w-7 h-7 text-white" />
                  <span className="text-[10px] font-bold text-white/90">{t('cp.camera')}</span>
                </button>

                {medias.map((m) => {
                  const selected = selectedId === m.id;
                  return (
                    <button
                      key={m.id}
                      onClick={() => pickFromGallery(m)}
                      disabled={uploading}
                      className="relative aspect-square bg-dark-800 overflow-hidden active:opacity-80"
                    >
                      {m.thumb ? (
                        <img src={m.thumb} alt="" draggable={false} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-slate-600">
                          {m.type === 'video' ? <Video className="w-6 h-6" /> : <ImageIcon className="w-6 h-6" />}
                        </div>
                      )}
                      {m.type === 'video' && (
                        <span className="absolute bottom-1 start-1 px-1.5 py-0.5 rounded-md bg-black/65 text-[10px] font-bold text-white flex items-center gap-0.5">
                          <Play className="w-2.5 h-2.5 fill-white" />
                          {formatDuration(m.duration)}
                        </span>
                      )}
                      {selected && (
                        <div className="absolute inset-0 ring-[3px] ring-inset ring-primary-400 bg-primary-500/20">
                          <span className="absolute top-1.5 end-1.5 w-6 h-6 rounded-full bg-primary-500 flex items-center justify-center shadow">
                            {picking ? <Loader2 className="w-3.5 h-3.5 animate-spin text-white" /> : <Check className="w-4 h-4 text-white" strokeWidth={3} />}
                          </span>
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>

              <div ref={sentinelRef} className="h-10 flex items-center justify-center">
                {loadingMore && <Loader2 className="w-5 h-5 animate-spin text-slate-500" />}
              </div>

              {!loadingMore && medias.length === 0 && (
                <p className="text-center text-xs text-slate-500 py-10">{t('cp.emptyFilter')}</p>
              )}
            </>
          )}
        </div>

        <div className="h-[calc(env(safe-area-inset-bottom)+16px)]" />
      </div>

      <input ref={galleryInputRef} type="file" accept="image/*,video/*" onChange={onInputFile} className="hidden" />
      <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" onChange={onInputFile} className="hidden" />

      {uploading && (
        <div className="absolute inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center px-8">
          <div className="w-full max-w-xs rounded-3xl bg-dark-900 border border-white/10 p-6 text-center space-y-4">
            <div className="mx-auto w-14 h-14 rounded-full bg-gradient-to-tr from-primary-500 to-accent-500 flex items-center justify-center">
              <Loader2 className="w-7 h-7 text-white animate-spin" />
            </div>
            <p className="text-sm font-black text-white">
              {mode === 'story' ? t('cp.uploadingStory') : t('cp.uploadingPost')}
            </p>
            {file && (
              <div className="space-y-1.5">
                <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-primary-500 to-accent-500 transition-all duration-300"
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <p className="text-[11px] text-slate-400">{progress}%</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default CreatePost;
