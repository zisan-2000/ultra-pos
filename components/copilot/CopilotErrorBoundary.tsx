"use client";

import { Component, type ReactNode } from "react";

type Props = { children: ReactNode };
type State = { hasError: boolean };

export class CopilotErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-full flex-col items-center justify-center gap-4 p-6 text-center">
          <p className="text-sm text-muted-foreground">
            কিছু সমস্যা হয়েছে। আবার চেষ্টা করুন।
          </p>
          <button
            type="button"
            onClick={() => this.setState({ hasError: false })}
            className="rounded-full border border-border bg-card px-4 py-2 text-sm font-semibold text-foreground transition hover:border-primary/30 hover:text-primary"
          >
            আবার চেষ্টা করুন
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
