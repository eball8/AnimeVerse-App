import React from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import Layout from './components/Layout';
import Home from './pages/Home';
import Explore from './pages/Explore';
import Search from './pages/Search';
import Messages from './pages/Messages';
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
      <AuthProvider>
        <HashRouter>
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
              <Route path="list/:kind" element={<AnimeList />} />
              <Route path="search" element={<Search />} />
              <Route path="community" element={<Community />} />
              <Route path="messages" element={<Messages />} />
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
      </AuthProvider>
    </ThemeProvider>
  );
};

export default App;
