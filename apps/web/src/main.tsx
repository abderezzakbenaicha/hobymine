import '@fontsource-variable/inter';
import './index.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import {
  Check,
  Info,
  LoaderCircle,
  TriangleAlert,
  X,
} from 'lucide-react';
import { Toaster } from 'sonner';
import App from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import { refreshSafeArea } from './lib/safe-area';
// Create the Supabase client at boot. This also refuses to start if a secret
// key was mistakenly placed in a VITE_ variable. A no-op when unconfigured.
import './lib/supabase';
import { startThemeSync, useThemeStore } from './store/theme';

// Adopt the saved theme (and follow the device while "system" is selected)
// before React renders. `startThemeSync` never throws, so a WebView that
// refuses `matchMedia` still gets a bootable app.
startThemeSync();

// Keep the safe-area variables in sync with the native window insets: the
// status bar height changes with rotation, split screen and gesture bars.
void refreshSafeArea();
// The first layout pass can finish after the web bundle boots, so read again
// once the native window has settled. The native side also pushes changes.
window.setTimeout(() => void refreshSafeArea(), 250);
window.addEventListener('resize', () => {
  void refreshSafeArea();
});
window.addEventListener('orientationchange', () => {
  void refreshSafeArea();
});
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) void refreshSafeArea();
});

const container = document.getElementById('root');
if (!container) throw new Error('Root element not found');

/** Sonner needs its own palette because it renders outside the app tree. */
function ThemedToaster() {
  const theme = useThemeStore((state) => state.resolved);

  return (
    <Toaster
      theme={theme}
      position="top-center"
      closeButton
      richColors={false}
      gap={10}
      offset={{ top: 'calc(var(--safe-top, 0px) + 0.75rem)' }}
      mobileOffset={{ top: 'calc(var(--safe-top, 0px) + 0.75rem)' }}
      icons={{
        success: <Check className="h-4 w-4" />,
        error: <X className="h-4 w-4" />,
        info: <Info className="h-4 w-4" />,
        warning: <TriangleAlert className="h-4 w-4" />,
        loading: <LoaderCircle className="h-4 w-4 animate-spin" />,
        close: <X className="h-3.5 w-3.5" />,
      }}
      toastOptions={{
        duration: 4200,
        unstyled: true,
        classNames: {
          toast: 'hm-toast',
          title: 'hm-toast-title',
          description: 'hm-toast-description',
          closeButton: 'hm-toast-close',
          actionButton: 'hm-toast-action',
          cancelButton: 'hm-toast-cancel',
        },
      }}
    />
  );
}

createRoot(container).render(
  <StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <App />
        <ThemedToaster />
      </BrowserRouter>
    </ErrorBoundary>
  </StrictMode>,
);

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js').catch(() => {
      // Offline support is a progressive enhancement.
    });
  });
}
