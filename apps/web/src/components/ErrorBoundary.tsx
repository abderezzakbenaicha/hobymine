import { Component, type ErrorInfo, type ReactNode } from 'react';
import { RotateCcw, TriangleAlert } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Last line of defence around the app tree.
 *
 * A render error thrown while the theme is being switched — a locked-down
 * WebView refusing a DOM write, a null colour, an empty palette — used to
 * unmount every component and leave a blank screen that reads as a crash.
 * It is caught here and turned into a recoverable message instead.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Leave a trail in the WebView log, but never rethrow.
    console.error('HobyMine recovered from a render error', error, info.componentStack);
  }

  private readonly handleRetry = (): void => {
    this.setState({ error: null });
  };

  render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="flex min-h-screen items-center justify-center bg-canvas px-5 py-10 text-white">
        <div className="panel w-full max-w-sm p-6 text-center">
          <TriangleAlert className="mx-auto h-8 w-8 text-neon" aria-hidden="true" />
          <h1 className="mt-4 text-base font-bold text-white">Something went wrong</h1>
          <p className="mt-2 text-xs leading-relaxed text-ink-400">
            HobyMine hit an unexpected error while drawing this screen. Your account and messages
            are safe — try again, and reload the app if it keeps happening.
          </p>
          <button type="button" onClick={this.handleRetry} className="btn-primary mt-5 w-full">
            <RotateCcw className="h-4 w-4" />
            Try again
          </button>
        </div>
      </div>
    );
  }
}