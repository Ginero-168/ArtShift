"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";

type Props = { children: ReactNode; theme?: string };
type State = { error: Error | null; info: ErrorInfo | null };

const RESET_KEYS = ["mighty-slides:doc:v1", "mighty-slides:ui:v1"];

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, info: null };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    this.setState({ info });
    console.error("[ArtShift] unhandled error:", error, info);
  }

  private reset = () => {
    this.setState({ error: null, info: null });
  };

  private hardReset = () => {
    try {
      for (const k of RESET_KEYS) localStorage.removeItem(k);
    } catch {
      /* ignore */
    }
    location.reload();
  };

  private copyDetails = async () => {
    const { error, info } = this.state;
    const text = [
      `Message: ${error?.message ?? "n/a"}`,
      `Stack:\n${error?.stack ?? "n/a"}`,
      `Component stack:${info?.componentStack ?? "n/a"}`,
      `UserAgent: ${navigator.userAgent}`,
      `When: ${new Date().toISOString()}`,
    ].join("\n\n");
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      /* ignore */
    }
  };

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className={`theme-${this.props.theme ?? "cool"} eb-root`}>
        <div className="eb-card">
          <div className="eb-title">Something broke.</div>
          <div className="eb-msg">{this.state.error.message}</div>
          <div className="eb-actions">
            <button className="eb-btn" onClick={this.reset}>
              Try again
            </button>
            <button className="eb-btn" onClick={this.copyDetails}>
              Copy details
            </button>
            <button className="eb-btn danger" onClick={this.hardReset}>
              Reset local data & reload
            </button>
          </div>
          {this.state.error.stack && <pre className="eb-pre">{this.state.error.stack}</pre>}
        </div>
      </div>
    );
  }
}
