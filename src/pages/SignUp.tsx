import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Mail, Lock, User, UserCheck, AtSign, Users, Eye, EyeOff, Loader2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { checkEmail } from '../utils/emailValidation';
import DatePickerSheet from '../components/DatePickerSheet';
import type { Gender } from '../types';
import { useI18n } from '../i18n/I18nContext';

const GENDERS: { value: Gender; key: string }[] = [
  { value: 'male', key: 'auth.genderMale' },
  { value: 'female', key: 'auth.genderFemale' },
  { value: 'none', key: 'auth.genderNone' },
];

const inputCls =
  'w-full pr-10 pl-3 py-3 rounded-2xl bg-dark-900 border border-white/10 text-white placeholder:text-slate-500 outline-none focus:border-primary-500/50';

const SignUp: React.FC = () => {
  const navigate = useNavigate();
  const { t } = useI18n();
  const { signUpEmail, signInGoogle } = useAuth();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [username, setUsername] = useState('');
  const [gender, setGender] = useState<Gender>('none');
  const [birthDate, setBirthDate] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (password.length < 6) {
      setError(t('auth.errPassShort'));
      return;
    }
    if (firstName.trim().length < 2) {
      setError(t('auth.errFirstShort'));
      return;
    }
    if (lastName.trim().length < 2) {
      setError(t('auth.errLastShort'));
      return;
    }
    const uname = username.trim().toLowerCase();
    if (!/^[a-z0-9_]{3,30}$/.test(uname)) {
      setError(t('auth.errUsername'));
      return;
    }
    if (!birthDate) {
      setError(t('auth.errBirth'));
      return;
    }
    const emailCheck = checkEmail(email);
    if (!emailCheck.ok) {
      setError(emailCheck.key ? t(emailCheck.key, emailCheck.vars) : emailCheck.message);
      return;
    }
    setLoading(true);
    try {
      await signUpEmail({
        email: email.trim(),
        password,
        firstName,
        lastName,
        username: uname,
        gender,
        birthDate,
      });
      // ✅ بعد التسجيل → صفحة التأكيد
      navigate('/verify-email');
    } catch (err: unknown) {
      const e = err as { code?: string };
      if (e.code === 'app/username-taken') {
        setError(t('auth.errUsernameTaken'));
      } else if (e.code === 'auth/email-already-in-use') {
        setError(t('auth.errEmailUsed'));
      } else if (e.code === 'auth/invalid-email') {
        setError(t('auth.errEmailInvalid'));
      } else if (e.code === 'auth/weak-password') {
        setError(t('auth.errWeak'));
      } else {
        setError(t('common.error'));
      }
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = async () => {
    setError('');
    setLoading(true);
    try {
      await signInGoogle();
      navigate('/');
    } catch (e: any) {
      if (!e?.cancelled) setError(t('auth.errGoogleSignup'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4"
      style={{
        // هوامش آمنة: تمنع التداخل مع شريط الحالة العلوي وشريط التنقل السفلي
        paddingTop: 'max(2rem, calc(env(safe-area-inset-top) + 1.25rem))',
        paddingBottom: 'max(2rem, calc(env(safe-area-inset-bottom) + 1.25rem))',
        paddingLeft: 'max(1rem, env(safe-area-inset-left))',
        paddingRight: 'max(1rem, env(safe-area-inset-right))',
      }}
    >
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <h1 className="text-3xl font-black bg-gradient-to-r from-primary-400 via-accent-400 to-primary-400 bg-clip-text text-transparent mb-2">
            AnimeVerse
          </h1>
          <p className="text-sm text-slate-400">{t('auth.signupSubtitle')}</p>
        </div>

        <form onSubmit={handleSubmit} className="card p-6 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-300 mb-2">{t('auth.firstName')}</label>
              <div className="relative">
                <User className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <input
                  type="text"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  required
                  maxLength={25}
                  autoComplete="given-name"
                  placeholder={t('auth.firstNamePh')}
                  className={inputCls}
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-300 mb-2">{t('auth.lastName')}</label>
              <div className="relative">
                <UserCheck className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <input
                  type="text"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  required
                  maxLength={25}
                  autoComplete="family-name"
                  placeholder={t('auth.lastNamePh')}
                  className={inputCls}
                />
              </div>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-300 mb-2">{t('auth.username')}</label>
            <div className="relative">
              <AtSign className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                required
                minLength={3}
                maxLength={30}
                dir="ltr"
                autoCapitalize="none"
                autoCorrect="off"
                autoComplete="username"
                placeholder="username"
                className={inputCls}
              />
            </div>
            <p className="text-[11px] text-slate-500 mt-1.5">{t('auth.usernameHint')}</p>
          </div>

          <div>
            <label className="flex items-center gap-1.5 text-xs font-bold text-slate-300 mb-2">
              <Users className="w-4 h-4 text-slate-500" />
              {t('auth.gender')}
            </label>
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

          <div>
            <label className="block text-xs font-bold text-slate-300 mb-2">{t('auth.birthDate')}</label>
            <DatePickerSheet value={birthDate} onChange={setBirthDate} minAge={13} />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-300 mb-2">{t('auth.email')}</label>
            <div className="relative">
              <Mail className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                dir="ltr"
                placeholder="you@example.com"
                className="w-full pr-10 pl-3 py-3 rounded-2xl bg-dark-900 border border-white/10 text-white placeholder:text-slate-500 outline-none focus:border-primary-500/50"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-300 mb-2">{t('auth.passwordSignup')}</label>
            <div className="relative">
              <Lock className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                dir="ltr"
                placeholder={t('auth.passwordHint')}
                className="w-full pr-10 pl-10 py-3 rounded-2xl bg-dark-900 border border-white/10 text-white placeholder:text-slate-500 outline-none focus:border-primary-500/50"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {error && <p className="text-xs text-red-400 text-center">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full btn-primary py-3 flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : t('auth.createAccount')}
          </button>

          <div className="relative my-4">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-white/10" />
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="px-3 bg-dark-900 text-slate-500">{t('auth.or')}</span>
            </div>
          </div>

          <button
            type="button"
            onClick={handleGoogle}
            disabled={loading}
            className="w-full py-3 rounded-2xl bg-white/5 border border-white/10 hover:bg-white/10 transition flex items-center justify-center gap-2 text-sm font-bold text-white disabled:opacity-50"
          >
            <svg className="w-5 h-5" viewBox="0 0 48 48">
              <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.4 29.3 35 24 35c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 4.1 29.3 2 24 2 11.8 2 2 11.8 2 24s9.8 22 22 22c11 0 21-8 21-22 0-1.2-.1-2.3-.4-3.5z"/>
              <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.6 16 19 13 24 13c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 7.1 29.3 5 24 5 16 5 9.1 9.5 6.3 14.7z"/>
              <path fill="#4CAF50" d="M24 43c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.3 34.1 26.8 35 24 35c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.2 38.4 16 43 24 43z"/>
              <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.1-4.1 5.5l6.2 5.2C41 35.5 45 30.3 45 24c0-1.2-.1-2.3-.4-3.5z"/>
            </svg>
            {t('auth.googleSignUp')}
          </button>

          <p className="text-center text-xs text-slate-400 mt-4">
            {t('auth.haveAccount')}{' '}
            <Link to="/login" className="text-primary-400 font-bold hover:underline">
              {t('auth.loginLink')}
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
};

export default SignUp;
