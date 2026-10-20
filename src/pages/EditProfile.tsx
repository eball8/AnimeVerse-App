import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { updateProfile as fbUpdateProfile } from 'firebase/auth';
import { ArrowRight, Camera, Loader2, Shuffle, Sparkles, X, Check } from 'lucide-react';
import { auth } from '../config/firebase';
import { useAuth } from '../context/AuthContext';
import { checkUsernameAvailable, updateUserProfile } from '../services/userService';
import { uploadVideoToCloudinary } from '../services/cloudinaryService';
import { invalidateUser } from '../services/userCache';
import { isValidUsername, sanitizeUsernameInput } from '../utils/username';
import { useI18n } from '../i18n/I18nContext';
import type { Gender } from '../types';

const field =
  'w-full px-3 py-2.5 rounded-xl bg-dark-950 border border-white/10 text-white text-sm outline-none focus:border-primary-500';

// أنماط الأفاتار (DiceBear)
const AVATAR_STYLES: { id: string }[] = [
  { id: 'adventurer' },
  { id: 'avataaars' },
  { id: 'lorelei' },
  { id: 'micah' },
  { id: 'big-ears' },
  { id: 'fun-emoji' },
  { id: 'bottts' },
  { id: 'pixel-art' },
];

const avatarUrl = (style: string, seed: string) =>
  `https://api.dicebear.com/7.x/${style}/png?seed=${encodeURIComponent(seed)}&size=256&backgroundColor=b6e3f4,c0aede,d1d4f9,ffd5dc,ffdfbf`;

const randomSeed = () => Math.random().toString(36).slice(2, 10);

const GENDERS: { value: Gender; key: string }[] = [
  { value: 'male', key: 'auth.genderMale' },
  { value: 'female', key: 'auth.genderFemale' },
  { value: 'none', key: 'auth.genderNone' },
];

// نافذة بناء الأفاتار
const AvatarBuilder: React.FC<{ onPick: (url: string) => void; onClose: () => void }> = ({ onPick, onClose }) => {
  const { t } = useI18n();
  const [style, setStyle] = useState(AVATAR_STYLES[0].id);
  const [seeds, setSeeds] = useState<string[]>(() => Array.from({ length: 8 }, randomSeed));
  const [chosen, setChosen] = useState<string | null>(null);

  const shuffle = () => {
    setSeeds(Array.from({ length: 8 }, randomSeed));
    setChosen(null);
  };

  return (
    <div className="fixed inset-0 z-[120] bg-black/80 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div
        className="bg-dark-900 w-full max-w-md rounded-t-3xl sm:rounded-2xl border border-white/10 overflow-hidden max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-4 border-b border-white/10 flex items-center justify-between">
          <h3 className="text-white font-bold flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary-400" /> {t('ep.buildAvatar')}
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white" aria-label={t('ep.close')}>
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 space-y-4 overflow-y-auto">
          <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
            {AVATAR_STYLES.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setStyle(s.id)}
                className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-bold border transition ${
                  style === s.id
                    ? 'bg-primary-500 border-primary-500 text-white'
                    : 'bg-white/5 border-white/10 text-slate-300'
                }`}
              >
                {t('ep.style.' + s.id)}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-4 gap-3">
            {seeds.map((sd) => {
              const url = avatarUrl(style, sd);
              const on = chosen === url;
              return (
                <button
                  key={sd}
                  type="button"
                  onClick={() => setChosen(url)}
                  className={`relative aspect-square rounded-full overflow-hidden bg-dark-950 ring-2 transition ${
                    on ? 'ring-primary-500' : 'ring-transparent hover:ring-white/20'
                  }`}
                >
                  <img src={url} alt="" loading="lazy" className="w-full h-full object-cover" />
                  {on && (
                    <span className="absolute inset-0 bg-primary-500/30 flex items-center justify-center">
                      <Check className="w-6 h-6 text-white" />
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={shuffle}
            className="w-full py-2.5 rounded-xl bg-white/5 border border-white/10 text-slate-200 text-sm font-bold flex items-center justify-center gap-2"
          >
            <Shuffle className="w-4 h-4" /> {t('ep.shuffle')}
          </button>
        </div>

        <div className="p-4 border-t border-white/10 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="px-4 py-2 text-slate-300">
            {t('common.cancel')}
          </button>
          <button
            type="button"
            disabled={!chosen}
            onClick={() => chosen && onPick(chosen)}
            className="btn-primary px-6 py-2 rounded-xl disabled:opacity-50"
          >
            {t('ep.use')}
          </button>
        </div>
      </div>
    </div>
  );
};

const EditProfile: React.FC = () => {
  const navigate = useNavigate();
  const { t } = useI18n();
  const { user, profile, refreshProfile } = useAuth();
  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [pronouns, setPronouns] = useState('');
  const [bio, setBio] = useState('');
  const [gender, setGender] = useState<Gender>('none');
  const [file, setFile] = useState<File | null>(null);
  const [builtAvatar, setBuiltAvatar] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [showBuilder, setShowBuilder] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // نملأ الحقول مرة واحدة فقط حتى لا تُمسح كتابة المستخدم عند تحديث الملف
  useEffect(() => {
    if (!profile) return;
    setDisplayName(profile.displayName);
    setUsername(profile.username);
    setPronouns(profile.pronouns || '');
    setBio(profile.bio || '');
    setGender(profile.gender === 'male' || profile.gender === 'female' ? profile.gender : 'none');
  }, [profile?.uid]);

  if (!user || !profile) {
    return <div className="py-24 flex justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary-500" /></div>;
  }

  const pickFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!f.type.startsWith('image/')) return setError(t('ep.errImage'));
    if (f.size > 5 * 1024 * 1024) return setError(t('ep.errImageSize'));
    setError('');
    setFile(f);
    setBuiltAvatar(null);
    setPreview(URL.createObjectURL(f));
  };

  const pickBuilt = (url: string) => {
    setBuiltAvatar(url);
    setFile(null);
    setPreview(url);
    setShowBuilder(false);
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const name = displayName.trim();
    const uname = username.trim().toLowerCase();
    const pr = pronouns.trim();
    if (name.length < 1 || name.length > 50) return setError(t('ep.errName'));
    // الاسم القديم غير المطابق للقواعد الجديدة يبقى كما هو إن لم يغيّره المستخدم
    if (uname !== profile.username && !isValidUsername(uname)) return setError(t('ep.usernameError'));
    if (pr.length > 30) return setError(t('ep.errPronouns'));
    if (bio.length > 150) return setError(t('ep.errBio'));

    setSaving(true);
    try {
      if (uname !== profile.username) {
        const ok = await checkUsernameAvailable(uname, user.uid);
        if (!ok) { setError(t('ep.errTaken')); return; }
      }
      let photoURL = profile.photoURL;
      if (builtAvatar) photoURL = builtAvatar;
      else if (file) photoURL = await uploadVideoToCloudinary(file);

      await updateUserProfile(user.uid, {
        displayName: name,
        username: uname,
        pronouns: pr,
        gender,
        bio: bio.trim(),
        ...(photoURL ? { photoURL } : {}),
      });
      if (auth.currentUser) {
        await fbUpdateProfile(auth.currentUser, { displayName: name, photoURL: photoURL || null }).catch(console.error);
      }
      await refreshProfile();
      // إبطال الكاش: كل المنشورات والتعليقات والريلز ستجلب الاسم والصورة الجديدة فوراً
      invalidateUser(user.uid);
      navigate('/profile');
    } catch (err: any) {
      console.error(err);
      setError(err?.code === 'permission-denied' ? t('ep.errPerm') : err?.message || t('common.error'));
    } finally {
      setSaving(false);
    }
  };

  const avatar = preview || profile.photoURL || `https://api.dicebear.com/7.x/bottts/svg?seed=${profile.uid}`;

  return (
    <div className="px-4 py-6 space-y-4">
      <div className="flex items-center gap-2">
        <button onClick={() => navigate(-1)} className="p-2 rounded-xl hover:bg-white/10 text-slate-300" aria-label={t('common.back')}>
          <ArrowRight className="w-5 h-5 rtl:rotate-0 ltr:rotate-180" />
        </button>
        <h2 className="text-xl font-black text-white">{t('profile.edit')}</h2>
      </div>

      <form onSubmit={save} className="card p-5 space-y-4">
        <div className="space-y-3">
          <label className="block w-24 h-24 mx-auto relative cursor-pointer">
            <img src={avatar} alt="" className="w-24 h-24 rounded-full object-cover ring-4 ring-primary-500/40 bg-dark-900" />
            <span className="absolute bottom-0 start-0 p-1.5 rounded-full bg-primary-500 text-white"><Camera className="w-4 h-4" /></span>
            <input type="file" accept="image/*" hidden onChange={pickFile} />
          </label>
          <div className="flex justify-center gap-2">
            <label className="px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-xs font-bold text-slate-200 cursor-pointer flex items-center gap-1.5">
              <Camera className="w-3.5 h-3.5" /> {t('ep.changePhoto')}
              <input type="file" accept="image/*" hidden onChange={pickFile} />
            </label>
            <button
              type="button"
              onClick={() => setShowBuilder(true)}
              className="px-3 py-1.5 rounded-full bg-primary-500/15 border border-primary-500/30 text-xs font-bold text-primary-300 flex items-center gap-1.5"
            >
              <Sparkles className="w-3.5 h-3.5" /> {t('ep.buildBtn')}
            </button>
          </div>
        </div>

        <div>
          <label className="block text-[11px] font-bold text-slate-300 mb-1">{t('auth.name')}</label>
          <input className={field} maxLength={50} value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
        </div>
        <div>
          <label className="block text-[11px] font-bold text-slate-300 mb-1">{t('auth.username')}</label>
          <input
            className={field}
            dir="ltr"
            maxLength={30}
            autoCapitalize="none"
            autoCorrect="off"
            value={username}
            onChange={(e) => setUsername(sanitizeUsernameInput(e.target.value))}
          />
          <p className="text-[11px] text-slate-500 mt-1.5">{t('ep.usernameHint')}</p>
        </div>
        <div>
          <label className="block text-[11px] font-bold text-slate-300 mb-1">{t('ep.pronouns')}</label>
          <input
            className={field}
            maxLength={30}
            placeholder={t('ep.pronounsPh')}
            value={pronouns}
            onChange={(e) => setPronouns(e.target.value)}
          />
        </div>
        <div>
          <label className="block text-[11px] font-bold text-slate-300 mb-1">{t('ep.bio', { n: bio.length })}</label>
          <textarea className={field} rows={3} maxLength={150} value={bio} onChange={(e) => setBio(e.target.value)} />
        </div>

        <div>
          <label className="block text-[11px] font-bold text-slate-300 mb-2">{t('auth.gender')}</label>
          <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label={t('auth.gender')}>
            {GENDERS.map((g) => {
              const on = gender === g.value;
              return (
                <button
                  key={g.value}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => setGender(g.value)}
                  className={`py-2.5 px-1 rounded-xl text-xs font-bold border transition ${
                    on
                      ? 'bg-primary-500/20 border-primary-500 text-primary-300'
                      : 'bg-dark-950 border-white/10 text-slate-300 hover:bg-white/5'
                  }`}
                >
                  {t(g.key)}
                </button>
              );
            })}
          </div>
        </div>

        {error && <p className="text-xs text-red-400 bg-red-500/10 p-2 rounded-lg">{error}</p>}

        <button disabled={saving} className="btn-primary w-full py-3 flex items-center justify-center gap-2 disabled:opacity-50">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : t('ep.save')}
        </button>
      </form>

      {showBuilder && <AvatarBuilder onPick={pickBuilt} onClose={() => setShowBuilder(false)} />}
    </div>
  );
};

export default EditProfile;
