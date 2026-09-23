"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { IconPinterest } from "@/components/icons";
import {
  type PinterestBoardCard,
  type PinterestPinCard,
  pinterestImageProxyPath,
} from "@/lib/pinterest/api";
import { placePinterestPinOnCanvas } from "@/lib/pinterest/importPin";
import styles from "./PinterestLibrary.module.css";

type PinterestStatus = {
  oauthConfigured: boolean;
  connected: boolean;
  username: string | null;
  setup?: string;
};

type FeedTab = "pins" | "boards";

const SETUP_FALLBACK =
  "Set PINTEREST_CLIENT_ID, PINTEREST_CLIENT_SECRET, and ARTSHIFT_PUBLIC_URL. Register {publicUrl}/api/pinterest/oauth/callback on the Pinterest app.";

export default function PinterestLibrary() {
  const [status, setStatus] = useState<PinterestStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [feedLoading, setFeedLoading] = useState(false);
  const [tab, setTab] = useState<FeedTab>("pins");
  const [pins, setPins] = useState<PinterestPinCard[]>([]);
  const [boards, setBoards] = useState<PinterestBoardCard[]>([]);
  const [activeBoard, setActiveBoard] = useState<PinterestBoardCard | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [placingId, setPlacingId] = useState<string | null>(null);
  const draggedRef = useRef(false);

  const loadStatus = useCallback(async (): Promise<PinterestStatus> => {
    const response = await fetch("/api/pinterest/status", { cache: "no-store" });
    const payload = (await response.json().catch(() => ({}))) as Partial<PinterestStatus>;
    const next: PinterestStatus = {
      oauthConfigured: payload.oauthConfigured === true,
      connected: payload.connected === true,
      username: typeof payload.username === "string" ? payload.username : null,
      ...(typeof payload.setup === "string" ? { setup: payload.setup } : {}),
    };
    setStatus(next);
    return next;
  }, []);

  const loadFeed = useCallback(async (board?: PinterestBoardCard | null) => {
    setFeedLoading(true);
    setHint(null);
    try {
      const pinUrl = board ? `/api/pinterest/boards/${board.id}/pins` : "/api/pinterest/pins";
      const [pinRes, boardRes] = await Promise.all([
        fetch(pinUrl, { cache: "no-store" }),
        board ? Promise.resolve(null) : fetch("/api/pinterest/boards", { cache: "no-store" }),
      ]);
      if (pinRes.status === 401 || boardRes?.status === 401) {
        setStatus((current) =>
          current ? { ...current, connected: false, username: null } : current,
        );
        setPins([]);
        setBoards([]);
        setHint("เซสชัน Pinterest หมดอายุ เชื่อมต่อใหม่อีกครั้ง");
        return;
      }
      if (!pinRes.ok) {
        setHint("โหลด Pinterest ไม่สำเร็จ");
        return;
      }
      const pinBody = (await pinRes.json()) as { pins?: PinterestPinCard[] };
      setPins(Array.isArray(pinBody.pins) ? pinBody.pins : []);
      if (boardRes) {
        if (!boardRes.ok) {
          setHint("โหลดบอร์ดไม่สำเร็จ");
        } else {
          const boardBody = (await boardRes.json()) as { boards?: PinterestBoardCard[] };
          setBoards(Array.isArray(boardBody.boards) ? boardBody.boards : []);
        }
      }
    } catch {
      setHint("โหลด Pinterest ไม่สำเร็จ");
    } finally {
      setFeedLoading(false);
    }
  }, []);

  useEffect(() => {
    const flag = new URLSearchParams(window.location.search).get("pinterest");
    if (flag === "denied") setHint("ยกเลิกการเชื่อมต่อ Pinterest แล้ว");
    else if (flag === "error") setHint("เชื่อมต่อ Pinterest ไม่สำเร็จ ลองอีกครั้ง");
    if (flag) {
      const url = new URL(window.location.href);
      url.searchParams.delete("pinterest");
      window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
    }
    void loadStatus()
      .then((next) => {
        if (!next.oauthConfigured) setHint(next.setup ?? SETUP_FALLBACK);
        if (next.connected) return loadFeed(null);
        return undefined;
      })
      .catch(() => setHint("โหลดสถานะ Pinterest ไม่สำเร็จ"))
      .finally(() => setLoading(false));
  }, [loadFeed, loadStatus]);

  async function handleConnect() {
    setHint(null);
    try {
      const next = await loadStatus();
      if (!next.oauthConfigured) {
        setHint(next.setup ?? SETUP_FALLBACK);
        return;
      }
      const returnTo = `${window.location.pathname}${window.location.search}`;
      window.location.assign(`/api/pinterest/oauth/start?returnTo=${encodeURIComponent(returnTo)}`);
    } catch {
      setHint("เชื่อมต่อ Pinterest ไม่สำเร็จ ลองอีกครั้ง");
    }
  }

  async function handleDisconnect() {
    await fetch("/api/pinterest/disconnect", { method: "POST" });
    setPins([]);
    setBoards([]);
    setActiveBoard(null);
    setTab("pins");
    setStatus((current) =>
      current
        ? { ...current, connected: false, username: null }
        : { oauthConfigured: false, connected: false, username: null },
    );
    setHint(null);
  }

  async function openBoard(board: PinterestBoardCard) {
    setActiveBoard(board);
    setTab("pins");
    await loadFeed(board);
  }

  async function placePin(pin: PinterestPinCard) {
    if (draggedRef.current) {
      draggedRef.current = false;
      return;
    }
    setPlacingId(pin.id);
    setHint(null);
    try {
      await placePinterestPinOnCanvas(pin);
    } catch {
      setHint("วางรูปจาก Pinterest ไม่สำเร็จ");
    } finally {
      setPlacingId(null);
    }
  }

  function onPinDragStart(event: React.DragEvent<HTMLButtonElement>, pin: PinterestPinCard) {
    draggedRef.current = true;
    const url = new URL(pinterestImageProxyPath(pin.src), window.location.origin).toString();
    event.dataTransfer.effectAllowed = "copy";
    event.dataTransfer.setData("application/x-artshift-image", JSON.stringify({ url }));
    event.dataTransfer.setData("text/uri-list", url);
    event.dataTransfer.setData("text/plain", url);
  }

  if (loading) {
    return (
      <section className={styles.panel} aria-label="Pinterest" data-pinterest-panel="true">
        <p className={styles.statusLine}>Loading Pinterest…</p>
      </section>
    );
  }

  if (!status?.connected) {
    return (
      <section className={styles.panel} aria-label="Pinterest" data-pinterest-panel="true">
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
    <section className={styles.panel} aria-label="Pinterest" data-pinterest-panel="true">
      <header className={styles.toolbar}>
        <p className={styles.account}>
          {status.username ? `Connected as ${status.username}` : "Connected"}
        </p>
        <div className={styles.toolbarActions}>
          <button
            type="button"
            className={styles.textButton}
            onClick={() => void loadFeed(activeBoard)}
            disabled={feedLoading}
          >
            Refresh
          </button>
          <button
            type="button"
            className={styles.textButton}
            onClick={() => void handleDisconnect()}
          >
            Disconnect
          </button>
        </div>
      </header>

      <div className={styles.subTabs} role="tablist" aria-label="Pinterest collections">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "pins"}
          className={`${styles.subTab} ${tab === "pins" ? styles.subTabActive : ""}`}
          onClick={() => {
            setTab("pins");
            if (!activeBoard && pins.length === 0) void loadFeed(null);
          }}
        >
          Pins
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "boards"}
          className={`${styles.subTab} ${tab === "boards" ? styles.subTabActive : ""}`}
          onClick={() => setTab("boards")}
        >
          Boards
        </button>
      </div>

      {hint ? <p className={styles.hint}>{hint}</p> : null}

      <div className={styles.scroll}>
        {tab === "boards" ? (
          <ul className={styles.boardList}>
            {boards.map((board) => (
              <li key={board.id}>
                <button
                  type="button"
                  className={styles.boardRow}
                  onClick={() => void openBoard(board)}
                >
                  {board.coverSrc ? (
                    // biome-ignore lint/performance/noImgElement: Pinterest CDN thumbnails
                    <img src={board.coverSrc} alt="" className={styles.boardCover} />
                  ) : (
                    <span className={styles.boardCover} aria-hidden="true" />
                  )}
                  <span className={styles.boardCopy}>
                    <span className={styles.boardName}>{board.name}</span>
                    <span className={styles.boardMeta}>
                      {typeof board.pinCount === "number" ? `${board.pinCount} Pins` : "Board"}
                    </span>
                  </span>
                </button>
              </li>
            ))}
            {!feedLoading && boards.length === 0 ? (
              <li className={styles.emptyLine}>No boards yet.</li>
            ) : null}
          </ul>
        ) : (
          <>
            {activeBoard ? (
              <button
                type="button"
                className={styles.backButton}
                onClick={() => {
                  setActiveBoard(null);
                  void loadFeed(null);
                }}
              >
                Boards / {activeBoard.name}
              </button>
            ) : null}
            <div className={styles.pinGrid}>
              {pins.map((pin, index) => (
                <button
                  key={pin.id}
                  type="button"
                  className={styles.pinCard}
                  draggable
                  disabled={placingId === pin.id}
                  title={`${pin.title} · คลิกเพื่อวางบน Canvas · ลากไปวางบน Preload`}
                  onClick={() => void placePin(pin)}
                  onDragStart={(event) => onPinDragStart(event, pin)}
                  onDragEnd={() => {
                    window.setTimeout(() => {
                      draggedRef.current = false;
                    }, 80);
                  }}
                >
                  {/* biome-ignore lint/performance/noImgElement: Pinterest CDN thumbnails */}
                  <img
                    src={pin.thumb}
                    alt={pin.title}
                    draggable={false}
                    decoding="async"
                    loading={index < 4 ? "eager" : "lazy"}
                  />
                </button>
              ))}
            </div>
            {!feedLoading && pins.length === 0 ? (
              <p className={styles.emptyLine}>No Pins yet.</p>
            ) : null}
          </>
        )}
        {feedLoading ? <p className={styles.statusLine}>Loading…</p> : null}
      </div>
    </section>
  );
}
