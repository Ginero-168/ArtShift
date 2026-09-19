"use client";

import { useCallback, useEffect, useState } from "react";
import { IconPinterest } from "@/components/icons";
import { createImage } from "@/lib/engine/factory";
import { fileToDataURL, loadDataURL } from "@/lib/engine/imageCache";
import { useEngine } from "@/lib/engine/store";
import { createMoodboardItem } from "@/lib/moodboard/factory";
import {
  isPinterestUrl,
  type PinterestBoardCard,
  type PinterestPinCard,
} from "@/lib/moodboard/pinterest";
import { nextMoodboardDropPoint } from "@/lib/moodboard/placement";
import { classifyReferenceUrl, saveMoodboardReference } from "@/lib/moodboard/referenceStore";
import { isMoodboardSlide } from "@/lib/moodboard/types";
import styles from "./PinterestPanel.module.css";

type PinterestStatus = {
  oauthConfigured: boolean;
  connected: boolean;
  setup?: string;
  appName?: string;
};

const DEFAULT_SETUP =
  "Set PINTEREST_CLIENT_ID, PINTEREST_CLIENT_SECRET, and ARTSHIFT_PUBLIC_URL. Register {publicUrl}/api/pinterest/oauth/callback on the Pinterest app.";

export default function PinterestPanel() {
  const addMoodboardItem = useEngine((state) => state.addMoodboardItem);
  const addElement = useEngine((state) => state.addElement);
  const [status, setStatus] = useState<PinterestStatus | null>(null);
  const [tab, setTab] = useState<"pins" | "boards">("pins");
  const [menuOpen, setMenuOpen] = useState(false);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pins, setPins] = useState<PinterestPinCard[]>([]);
  const [boards, setBoards] = useState<PinterestBoardCard[]>([]);
  const [activeBoard, setActiveBoard] = useState<PinterestBoardCard | null>(null);
  const [url, setUrl] = useState("");
  const [hint, setHint] = useState("");
  const [loading, setLoading] = useState(false);

  const connected = status?.connected === true;

  const loadStatus = useCallback(async (): Promise<PinterestStatus> => {
    const response = await fetch("/api/pinterest/status", { cache: "no-store" });
    const payload = (await response.json()) as Partial<PinterestStatus>;
    const next: PinterestStatus = {
      oauthConfigured: payload.oauthConfigured === true,
      connected: payload.connected === true,
      setup: typeof payload.setup === "string" ? payload.setup : undefined,
      appName: typeof payload.appName === "string" ? payload.appName : "ArtShift",
    };
    setStatus(next);
    return next;
  }, []);

  const loadFeed = useCallback(async (board?: PinterestBoardCard | null) => {
    setLoading(true);
    try {
      const pinUrl = board ? `/api/pinterest/boards/${board.id}/pins` : "/api/pinterest/pins";
      const [pinRes, boardRes] = await Promise.all([
        fetch(pinUrl, { cache: "no-store" }),
        board ? Promise.resolve(null) : fetch("/api/pinterest/boards", { cache: "no-store" }),
      ]);
      if (pinRes.status === 401) {
        setStatus((current) => (current ? { ...current, connected: false } : current));
        setPins([]);
        setBoards([]);
        return;
      }
      const pinBody = (await pinRes.json()) as { pins?: PinterestPinCard[]; error?: string };
      if (!pinRes.ok) {
        setHint(pinBody.error || "Could not load Pins.");
        return;
      }
      setPins(Array.isArray(pinBody.pins) ? pinBody.pins : []);
      if (boardRes) {
        const boardBody = (await boardRes.json()) as { boards?: PinterestBoardCard[] };
        setBoards(Array.isArray(boardBody.boards) ? boardBody.boards : []);
      }
      setHint("");
    } catch {
      setHint("Could not load Pinterest.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadStatus().then((next) => {
      if (next.connected) void loadFeed();
    });
  }, [loadFeed, loadStatus]);

  async function handleConnect() {
    let current = status;
    if (!current) {
      try {
        current = await loadStatus();
      } catch {
        setHint(DEFAULT_SETUP);
        return;
      }
    }
    if (!current.oauthConfigured) {
      setHint(current.setup || DEFAULT_SETUP);
      return;
    }
    const returnTo = `${window.location.pathname}${window.location.search}`;
    window.location.assign(`/api/pinterest/oauth/start?returnTo=${encodeURIComponent(returnTo)}`);
  }

  async function handleDisconnect() {
    setMenuOpen(false);
    setPasteOpen(false);
    await fetch("/api/pinterest/disconnect", { method: "POST" });
    setStatus((current) =>
      current ? { ...current, connected: false } : { oauthConfigured: false, connected: false },
    );
    setPins([]);
    setBoards([]);
    setActiveBoard(null);
    setHint("");
  }

  function savePinUrl() {
    const trimmed = url.trim();
    if (!trimmed.startsWith("https://") || !isPinterestUrl(trimmed)) {
      setHint("Paste a pinterest.com or pinimg.com https URL.");
      return;
    }
    const saved = saveMoodboardReference({
      src: trimmed,
      title: trimmed.split("/").filter(Boolean).at(-1) || "Pin",
      sourceUrl: trimmed,
      origin: classifyReferenceUrl(trimmed),
    });
    setPins((current) => [
      { id: saved.id, title: saved.title, src: saved.src, sourceUrl: saved.sourceUrl },
      ...current,
    ]);
    setUrl("");
    setHint("Saved as a fallback Pin. Official Pins come from Connect Pinterest.");
  }

  async function openBoard(board: PinterestBoardCard) {
    setActiveBoard(board);
    setTab("pins");
    await loadFeed(board);
  }

  async function placePin(pin: PinterestPinCard) {
    const slide = useEngine.getState().currentSlide();
    if (slide && isMoodboardSlide(slide)) {
      const point = nextMoodboardDropPoint(slide.moodboard?.items ?? []);
      addMoodboardItem(
        createMoodboardItem({
          kind: "image",
          src: pin.src,
          text: pin.title,
          x: point.x,
          y: point.y,
          credit: {
            photographer: pin.title,
            sourceUrl: pin.sourceUrl,
            provider: "pinterest",
          },
        }),
        "add pinterest pin",
      );
      return;
    }
    if (!slide || !pin.src.startsWith("https://")) return;
    try {
      const response = await fetch(pin.src);
      if (!response.ok) return;
      const blob = await response.blob();
      const file = new File([blob], pin.title || "pin.png", { type: blob.type || "image/png" });
      const dataURL = await fileToDataURL(file);
      const entry = await loadDataURL(dataURL);
      const width = 320;
      const height = Math.round((entry.height / entry.width) * width);
      addElement(
        createImage({
          x: 80,
          y: 80,
          width,
          height,
          fileId: entry.fileId,
          naturalWidth: entry.width,
          naturalHeight: entry.height,
          name: pin.title || "Pin",
        }),
        "add pinterest pin",
      );
    } catch {
      setHint("Could not place that Pin on the artwork slide.");
    }
  }

  if (!connected) {
    return (
      <section className={styles.panel} data-pinterest-panel="true" aria-label="Pinterest">
        <header className={styles.header}>
          <h2 className={styles.title}>Pinterest</h2>
        </header>
        <div className={styles.emptyState}>
          <IconPinterest size={56} color="#E60023" className={styles.logo} />
          <p className={styles.emptyCopy}>Not connected to Pinterest yet</p>
          <button
            type="button"
            className={styles.connectButton}
            onClick={() => void handleConnect()}
          >
            Connect Pinterest
          </button>
          {hint ? <p className={styles.hint}>{hint}</p> : null}
        </div>
      </section>
    );
  }

  return (
    <section className={styles.panel} data-pinterest-panel="true" aria-label="Pinterest">
      <header className={styles.header}>
        <h2 className={styles.title}>Pinterest</h2>
        <div className={styles.headerActions}>
          <button
            type="button"
            className={styles.iconButton}
            aria-label="Refresh Pins"
            onClick={() => void loadFeed(activeBoard)}
          >
            <RefreshIcon spinning={loading} />
          </button>
          <div className={styles.menuWrap}>
            <button
              type="button"
              className={styles.iconButton}
              aria-label="Pinterest menu"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((open) => !open)}
            >
              ⋯
            </button>
            {menuOpen ? (
              <div className={styles.menu}>
                <button
                  type="button"
                  className={styles.menuItem}
                  onClick={() => {
                    setPasteOpen(true);
                    setMenuOpen(false);
                  }}
                >
                  Paste Pin URL (fallback)
                </button>
                <button
                  type="button"
                  className={styles.disconnect}
                  onClick={() => void handleDisconnect()}
                >
                  Disconnect
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </header>
      <div className={styles.tabs} role="tablist" aria-label="Pinterest collections">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "pins"}
          className={`${styles.tab} ${tab === "pins" ? styles.tabActive : ""}`}
          onClick={() => setTab("pins")}
        >
          Pins
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "boards"}
          className={`${styles.tab} ${tab === "boards" ? styles.tabActive : ""}`}
          onClick={() => {
            setTab("boards");
            setActiveBoard(null);
          }}
        >
          Boards
        </button>
      </div>
      {pasteOpen ? (
        <div className={styles.pasteRow}>
          <input
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            placeholder="Fallback: pinimg.com or pinterest.com URL"
            aria-label="Fallback Pinterest image URL"
          />
          <button type="button" onClick={savePinUrl}>
            Add
          </button>
        </div>
      ) : null}
      {tab === "pins" ? (
        pins.length ? (
          <div className={styles.grid}>
            {pins.map((pin) => (
              <button
                type="button"
                key={pin.id}
                className={styles.pin}
                onClick={() => void placePin(pin)}
                title={pin.title}
              >
                {/* biome-ignore lint/performance/noImgElement: Pinterest CDN URLs */}
                <img src={pin.src} alt={pin.title} />
              </button>
            ))}
          </div>
        ) : (
          <p className={styles.empty}>
            {loading
              ? "Loading Pins…"
              : activeBoard
                ? `No Pins on ${activeBoard.name}.`
                : "No Pins yet."}
          </p>
        )
      ) : boards.length ? (
        <div className={styles.grid}>
          {boards.map((board) => (
            <button
              type="button"
              key={board.id}
              className={styles.pin}
              onClick={() => void openBoard(board)}
              title={board.name}
            >
              {board.coverSrc ? (
                // biome-ignore lint/performance/noImgElement: Pinterest CDN URLs
                <img src={board.coverSrc} alt={board.name} />
              ) : (
                <span className={styles.boardFallback}>{board.name}</span>
              )}
              <span className={styles.boardLabel}>
                {board.name}
                {typeof board.pinCount === "number" ? ` · ${board.pinCount}` : ""}
              </span>
            </button>
          ))}
        </div>
      ) : (
        <p className={styles.empty}>{loading ? "Loading boards…" : "No boards yet."}</p>
      )}
      {hint ? <p className={styles.hint}>{hint}</p> : null}
    </section>
  );
}

function RefreshIcon({ spinning }: { spinning: boolean }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      aria-hidden="true"
      className={spinning ? styles.spin : undefined}
    >
      <path
        fill="currentColor"
        d="M8 2.2a5.8 5.8 0 1 1-5.5 4h1.6A4.2 4.2 0 1 0 8 3.8V5.6L11 3 8 .4V2.2Z"
      />
    </svg>
  );
}
