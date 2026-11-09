import { useEffect, useRef } from 'react';
import { Navigate, Outlet, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { AppShell, AppSplash } from './components/AppShell';
import { ConnectionStatus } from './components/ConnectionStatus';
import { ChatPage } from './pages/ChatPage';
import { DiscoverPage } from './pages/DiscoverPage';
import { EditProfilePage } from './pages/EditProfilePage';
import { LikesPage } from './pages/LikesPage';
import { LegalPage } from './pages/LegalPage';
import { MatchesPage } from './pages/MatchesPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { PlusPage } from './pages/PlusPage';
import { PreferencesPage } from './pages/PreferencesPage';
import { ProfilePage } from './pages/ProfilePage';
import { SafetyPage } from './pages/SafetyPage';
import { SettingsPage } from './pages/SettingsPage';
import { VerifyPage } from './pages/VerifyPage';
import { OnboardingPage } from './pages/OnboardingPage';
import { WelcomePage } from './pages/WelcomePage';
import { installNativeBackBridge, registerBackHandler } from './lib/native';
import { landingRoute, needsOnboarding } from './lib/profile';
import { useAuthStore } from './store/auth';

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  }, [pathname]);
  return null;
}

/**
 * The Android hardware back button walks back through the app instead of
 * closing it: open overlays are closed first, then the router goes back one
 * step, and a double press at the root hands the press back to the shell.
 */
function useNativeBackButton(): void {
  const navigate = useNavigate();
  const location = useLocation();
  const lastExitPress = useRef(0);

  useEffect(() => {
    installNativeBackBridge();
    return registerBackHandler(() => {
      const historyIndex = (window.history.state as { idx?: number } | null)?.idx ?? 0;
      if (historyIndex > 0) {
        navigate(-1);
        return true;
      }

      const now = Date.now();
      if (now - lastExitPress.current < 2000) return false;
      lastExitPress.current = now;
      toast('Press back again to exit HobyMine');
      return true;
    });
  }, [navigate, location.pathname]);
}

function RequireAuth() {
  const token = useAuthStore((state) => state.token);
  const user = useAuthStore((state) => state.user);
  const status = useAuthStore((state) => state.status);

  if (status !== 'ready') return <AppSplash />;
  if (!token || !user) return <Navigate to="/welcome" replace />;
  return <Outlet />;
}

function PublicOnly() {
  const user = useAuthStore((state) => state.user);
  const status = useAuthStore((state) => state.status);

  if (status !== 'ready') return <AppSplash />;
  if (user) return <Navigate to={landingRoute(user)} replace />;
  return <Outlet />;
}

function RequireProfile() {
  const user = useAuthStore((state) => state.user);
  if (needsOnboarding(user)) return <Navigate to="/onboarding" replace />;
  return <Outlet />;
}

function RootRedirect() {
  const token = useAuthStore((state) => state.token);
  const user = useAuthStore((state) => state.user);
  const status = useAuthStore((state) => state.status);

  if (status !== 'ready') return <AppSplash />;
  if (!token || !user) return <Navigate to="/welcome" replace />;
  return <Navigate to={landingRoute(user)} replace />;
}

export default function App() {
  const bootstrap = useAuthStore((state) => state.bootstrap);
  const started = useRef(false);

  useNativeBackButton();

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void bootstrap();
  }, [bootstrap]);

  return (
    <>
      <ScrollToTop />
      <ConnectionStatus />
      <Routes>
        <Route element={<PublicOnly />}>
          <Route path="/welcome" element={<WelcomePage />} />
        </Route>

        <Route element={<RequireAuth />}>
          <Route path="/onboarding" element={<OnboardingPage />} />
          <Route element={<RequireProfile />}>
            <Route element={<AppShell />}>
              <Route path="/discover" element={<DiscoverPage />} />
              <Route path="/matches" element={<MatchesPage />} />
              <Route path="/chat/:matchId" element={<ChatPage />} />
              <Route path="/plus" element={<PlusPage />} />
              <Route path="/likes" element={<LikesPage />} />
              <Route path="/profile" element={<ProfilePage />} />
              <Route path="/profile/edit" element={<EditProfilePage />} />
              <Route path="/preferences" element={<PreferencesPage />} />
              <Route path="/verify" element={<VerifyPage />} />
              <Route path="/safety" element={<SafetyPage />} />
              <Route path="/settings" element={<SettingsPage />} />
            </Route>
          </Route>
        </Route>

        <Route path="/legal/terms" element={<LegalPage kind="terms" />} />
        <Route path="/legal/privacy" element={<LegalPage kind="privacy" />} />

        <Route path="/" element={<RootRedirect />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </>
  );
}
