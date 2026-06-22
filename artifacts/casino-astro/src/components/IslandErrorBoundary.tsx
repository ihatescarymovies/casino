import { Component, type ReactNode } from "react";

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class IslandErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
          <div className="h-14 w-14 mx-auto mb-4 rounded-full bg-destructive/10 border border-destructive/20 flex items-center justify-center">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-7 w-7 text-destructive"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
              <path d="M12 9v4" />
              <path d="M12 17h.01" />
            </svg>
          </div>
          <h3 className="text-lg font-bold text-white mb-2">
            Something went wrong
          </h3>
          <p className="text-sm text-muted-foreground mb-4 max-w-sm">
            This component encountered an error. Please refresh the page or try
            again.
          </p>
          <button
            type="button"
            className="btn btn-primary text-sm"
            onClick={() => {
              this.setState({ hasError: false, error: null });
            }}
          >
            Try Again
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
