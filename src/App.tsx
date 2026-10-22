import React from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { AuthProvider, useAuth, isUnverifiedPasswordUser } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { I18nProvider } from './i18n/I18nContext';
import Layout from './components/Layout';
import { ConfirmProvider } from './components/ConfirmDialog';
import Home from './pages/Home';
import Explore from './pages/Explore';
import Search from './pages/Search';
import Messages from './pages/Messages';
import ArchivePage from './pages/Archive';
import Chat from './pages/Chat';
import Reels from './pages/Reels';
import PostView from './pages/PostView';
import Profile from './pages/Profile';
import Login from './pages/Login';
import SignUp from './pages/SignUp';
import VerifyEmail from './pages/VerifyEmail';
import ForgotPassword from './pages/ForgotPassword';
import Settings from './pages/Settings';
import AuthAction from './pages/AuthAction';
import AnimeDetail from './pages/AnimeDetail';
import AnimeList from './pages/AnimeList';
import Watch from './pages/Watch';
import Community from './pages/Community';
import CreatePost from './pages/CreatePost';
import UserProfilePage from './pages/UserProfile';
import EditProfile from './pages/EditProfile';
import Library from './pages/Library';
import Notifications from './pages/Notifications';
import Admin from './pages/Admin';
import DeepLinkHandler from './components/DeepLinkHandler';

const Spinner: React.FC = () => (
  <div className="min-h-screen flex items-center justify-center bg-dark-950">
    <Loader2 className="w-8 h-8 animate-spin text-primary-400" />
  </div>
);

// أي شخص غير مسجّل يُحوَّل مباشرة إلى شاشة الدخول
const RequireAuth: React.FC<{ children: React.ReactElement }> = ({ children }) => {
  const { user, loading } = useAuth();
  if (loading) return <Spinner />;
  if (!user) return <Navigate to="/login" replace />;
  if (isUnverifiedPasswordUser(user)) return <Navigate to="/verify-email" replace />;
  return children;
};

// لوحة الأدمن: للأدمن فقط
const RequireAdmin: React.FC<{ children: React.ReactElement }> = ({ children }) => {
  const { user, profile, loading, isAdmin } = useAuth();
  if (loading || (user && !profile)) return <Spinner />;
  if (!isAdmin) return <Navigate to="/" replace />;
  return children;
};

const App: React.FC = () => {
  return (
    <ThemeProvider>
      <I18nProvider>
        <AuthProvider>
          <ConfirmProvider>
          <HashRouter>
            <DeepLinkHandler />
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/signup" element={<SignUp />} />
              <Route path="/verify-email" element={<VerifyEmail />} />
              <Route path="/forgot-password" element={<ForgotPassword />} />
              <Route path="/auth/action" element={<AuthAction />} />
              <Route path="/create-post" element={<RequireAuth><CreatePost /></RequireAuth>} />

              <Route path="/" element={<RequireAuth><Layout /></RequireAuth>}>
                <Route index element={<Home />} />
                <Route path="explore" element={<Explore />} />
                <Route path="reels" element={<Reels />} />
                <Route path="reels/:id" element={<Reels />} />
                <Route path="post/:id" element={<PostView />} />
                <Route path="list/:kind" element={<AnimeList />} />
                <Route path="search" element={<Search />} />
                <Route path="community" element={<Community />} />
                <Route path="messages" element={<Messages />} />
                <Route path="messages/:uid" element={<Chat />} />
                <Route path="archive" element={<ArchivePage />} />
                <Route path="profile" element={<Profile />} />
                <Route path="edit-profile" element={<EditProfile />} />
                <Route path="user/:uid" element={<UserProfilePage />} />
                <Route path="library" element={<Library />} />
                <Route path="notifications" element={<Notifications />} />
                <Route path="admin" element={<RequireAdmin><Admin /></RequireAdmin>} />
                <Route path="settings" element={<Settings />} />
                <Route path="anime/:id" element={<AnimeDetail />} />
                <Route path="watch/:animeId/:episodeNumber" element={<Watch />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Route>
            </Routes>
          </HashRouter>
          </ConfirmProvider>
        </AuthProvider>
      </I18nProvider>
    </ThemeProvider>
  );
};

export default App;
