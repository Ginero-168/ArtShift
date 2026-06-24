"use client";

import { useRef, useState } from "react";
import { type ChatMsg, runEngineChat } from "@/lib/engine/chat";
import { IconSend, IconSparkles } from "./icons";

export default function AIPrompt() {
  const [val, setVal] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const history = useRef<ChatMsg[]>([]);

  async function run() {
    const text = val.trim();
    if (!text || busy) return;
    setBusy(true);
    setError(null);
    const next: ChatMsg[] = [...history.current, { role: "user", content: text }];
    try {
      const result = await runEngineChat(next);
      if (result.error) {
        setError(friendlyError(result.error));
        return;
      }
      const updated: ChatMsg[] = [...next, { role: "assistant", content: result.text }];
      history.current = updated.slice(-20);
      setVal("");
    } catch (e) {
      setError(friendlyError(e instanceof Error ? e.message : "Something went wrong"));
    } finally {
      setBusy(false);
    }
  }

  function friendlyError(raw: string): string {
    const lower = raw.toLowerCase();
    if (lower.includes("credit balance is too low")) {
      return "Anthropic API credits exhausted. Top up at console.anthropic.com/settings/billing and try again.";
    }
    if (lower.includes("rate_limit") || lower.includes("rate limit")) {
      return "Hit Anthropic rate limit — wait a few seconds and retry.";
    }
    if (lower.includes("invalid api key") || lower.includes("authentication")) {
      return "Invalid ANTHROPIC_API_KEY. Check your .env.local.";
    }
    if (lower.includes("overloaded")) {
      return "Anthropic is overloaded right now. Try again in a moment.";
    }
    return raw.length > 240 ? `${raw.slice(0, 240)}…` : raw;
  }

  return (
    <div className="ai-dock">
      {error && (
        <div className="ai-dock-error" role="alert">
          <span>⚠ {error}</span>
          <button
            type="button"
            className="ai-dock-error-x"
            onClick={() => setError(null)}
            aria-label="Dismiss"
          >
            ✕
          </button>
        </div>
      )}
      <form
        className="ai-dock-form"
        onSubmit={(e) => {
          e.preventDefault();
          run();
        }}
      >
        <div className="ai-dock-spark">
          <IconSparkles size={14} />
        </div>
        <input
          className="ai-dock-input"
          placeholder="Ask Mighty… e.g. add three bullets on the right"
          value={val}
          onChange={(e) => setVal(e.target.value)}
        />
        <button type="submit" className="ai-dock-submit" disabled={!val.trim() || busy}>
          {busy ? "…" : <IconSend size={14} />}
        </button>
      </form>
    </div>
  );
}
