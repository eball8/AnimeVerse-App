import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { updateProfile as fbUpdateProfile } from 'firebase/auth';
import { ArrowRight, Camera, Loader2 } from 'lucide-react';
import { auth } from '../config/firebase';
import { useAuth } from '../context/AuthContext';
import { checkUsernameAvailable, updateUserProfile } from '../services/userService';
import { uploadVideoToCloudinary } from '../services/cloudinaryService';
import { invalidateUser } from '../services/userCache';

const field =
  'w-full px-3 py-2.5 rounded-xl bg-dark-950 border border-white/10 text-white text-sm outline-none focus:border-primary-500';

const EditProfile: React.FC = () => {
  const navigate = useNavigate();
  const { user, profile, refreshProfile } = useAuth();
  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [bio, setBio] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // نملأ الحقول مرة واحدة فقط حتى لا تُمسح كتابة المستخدم عند تحديث الملف
  useEffect(() => {
    if (!profile) return;
    setDisplayName(profile.displayName);
    setUsername(profile.username);
    setBio(profile.bio || '');
  }, [profile?.uid]);

  if (!user || !profile) {
    return <div className="py-24 flex justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary-500" /></div>;
  }

  const pickFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!f.type.startsWith('image/')) return setError('اختر صورة فقط.');
    if (f.size > 5 * 1024 * 1024) return setError('حجم الصورة كبير (الحد 5 ميجابايت).');
    setError('');
    setFile(f);
    setPreview(URL.createObjectURL(f));
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const name = displayName.trim();
    const uname = username.trim().toLowerCase();
    if (name.length < 1 || name.length > 50) return setError('الاسم يجب أن يكون بين 1 و50 حرفاً.');
    if (!/^[a-z0-9_]{3,30}$/.test(uname)) return setError('اسم المستخدم: أحرف إنجليزية صغيرة وأرقام و _ فقط (3-30).');
    if (bio.length > 150) return setError('النبذة لا تتجاوز 150 حرفاً.');

    setSaving(true);
    try {
      if (uname !== profile.username) {
        const ok = await checkUsernameAvailable(uname, user.uid);
        if (!ok) { setError('اسم المستخدم مستخدم بالفعل.'); return; }
      }
      let photoURL = profile.photoURL;
      if (file) photoURL = await uploadVideoToCloudinary(file);

      await updateUserProfile(user.uid, {
        displayName: name,
        username: uname,
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
      setError(err?.code === 'permission-denied' ? 'غير مسموح بحفظ هذه البيانات.' : err?.message || 'حدث خطأ، حاول مرة أخرى.');
    } finally {
      setSaving(false);
    }
  };

  const avatar = preview || profile.photoURL || `https://api.dicebear.com/7.x/bottts/svg?seed=${profile.uid}`;

  return (
    <div className="px-4 py-6 space-y-4">
      <div className="flex items-center gap-2">
        <button onClick={() => navigate(-1)} className="p-2 rounded-xl hover:bg-white/10 text-slate-300" aria-label="رجوع">
          <ArrowRight className="w-5 h-5 rtl:rotate-0 ltr:rotate-180" />
        </button>
        <h2 className="text-xl font-black text-white">تعديل الملف الشخصي</h2>
      </div>

      <form onSubmit={save} className="card p-5 space-y-4">
        <label className="block w-24 h-24 mx-auto relative cursor-pointer">
          <img src={avatar} alt="" className="w-24 h-24 rounded-full object-cover ring-4 ring-primary-500/40 bg-dark-900" />
          <span className="absolute bottom-0 start-0 p-1.5 rounded-full bg-primary-500 text-white"><Camera className="w-4 h-4" /></span>
          <input type="file" accept="image/*" hidden onChange={pickFile} />
        </label>

        <div>
          <label className="block text-[11px] font-bold text-slate-300 mb-1">الاسم</label>
          <input className={field} maxLength={50} value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
        </div>
        <div>
          <label className="block text-[11px] font-bold text-slate-300 mb-1">اسم المستخدم</label>
          <input className={field} dir="ltr" maxLength={30} value={username} onChange={(e) => setUsername(e.target.value)} />
        </div>
        <div>
          <label className="block text-[11px] font-bold text-slate-300 mb-1">النبذة ({bio.length}/150)</label>
          <textarea className={field} rows={3} maxLength={150} value={bio} onChange={(e) => setBio(e.target.value)} />
        </div>

        {error && <p className="text-xs text-red-400 bg-red-500/10 p-2 rounded-lg">{error}</p>}

        <button disabled={saving} className="btn-primary w-full py-3 flex items-center justify-center gap-2 disabled:opacity-50">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'حفظ'}
        </button>
      </form>
    </div>
  );
};

export default EditProfile;
