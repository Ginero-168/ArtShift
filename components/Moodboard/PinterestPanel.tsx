"use client";

import { useCallback, useEffect, useState } from "react";
import { createImage } from "@/lib/engine/factory";
import { fileToDataURL, loadDataURL } from "@/lib/engine/imageCache";
import { useEngine } from "@/lib/engine/store";
import { createMoodboardItem } from "@/lib/moodboard/factory";
import { isPinterestUrl, PINTEREST_API_STATUS } from "@/lib/moodboard/pinterest";
import {
  connectPinterestSession,
  disconnectPinterestSession,
  type PinterestSession,
  readPinterestSession,
} from "@/lib/moodboard/pinterestSession";
import { nextMoodboardDropPoint } from "@/lib/moodboard/placement";
import {
  classifyReferenceUrl,
  listMoodboardReferences,
  type MoodboardReference,
  saveMoodboardReference,
} from "@/lib/moodboard/referenceStore";
import { isMoodboardSlide } from "@/lib/moodboard/types";
import styles from "./PinterestPanel.module.css";

export default function PinterestPanel() {
  const addMoodboardItem = useEngine((state) => state.addMoodboardItem);
  const addElement = useEngine((state) => state.addElement);
  const [session, setSession] = useState<PinterestSession>(() => readPinterestSession());
  const [tab, setTab] = useState<"pins" | "boards">("pins");
  const [menuOpen, setMenuOpen] = useState(false);
  const [pins, setPins] = useState<MoodboardReference[]>([]);
  const [url, setUrl] = useState("");
  const [statusHint, setStatusHint] = useState("");
  const [oauthConfigured, setOauthConfigured] = useState(false);

  const reloadPins = useCallback(() => {
    setPins(listMoodboardReferences().filter((item) => item.origin === "pinterest"));
  }, []);

  useEffect(() => {
    setSession(readPinterestSession());
    reloadPins();
    void fetch("/api/pinterest/status")
      .then((response) => response.json())
      .then((payload: { oauthConfigured?: boolean }) => {
        setOauthConfigured(payload.oauthConfigured === true);
      })
      .catch(() => {
        setOauthConfigured(false);
      });
  }, [reloadPins]);

  async function handleSignIn() {
    if (oauthConfigured) {
      window.location.assign("/api/pinterest/oauth/start");
      return;
    }
    setSession(connectPinterestSession("local"));
    setStatusHint(
      `Official saved-Pins are ${PINTEREST_API_STATUS.officialSavedPins}. Local session started — paste Pins you already saved.`,
    );
    reloadPins();
  }

  function handleDisconnect() {
    setSession(disconnectPinterestSession());
    setMenuOpen(false);
    setStatusHint("");
  }

  function savePinUrl() {
    const trimmed = url.trim();
    if (!trimmed.startsWith("https://") || !isPinterestUrl(trimmed)) {
      setStatusHint("Paste a pinterest.com or pinimg.com https URL.");
      return;
    }
    saveMoodboardReference({
      src: trimmed,
      title: trimmed.split("/").filter(Boolean).at(-1) || "Pin",
      sourceUrl: trimmed,
      origin: classifyReferenceUrl(trimmed),
    });
    setUrl("");
    reloadPins();
  }

  async function placePin(ref: MoodboardReference) {
    const slide = useEngine.getState().currentSlide();
    if (slide && isMoodboardSlide(slide)) {
      const point = nextMoodboardDropPoint(slide.moodboard?.items ?? []);
      addMoodboardItem(
        createMoodboardItem({
          kind: "image",
          src: ref.src,
          text: ref.title,
          x: point.x,
          y: point.y,
          credit: {
            photographer: ref.title,
            sourceUrl: ref.sourceUrl,
            provider: "pinterest",
          },
        }),
        "add pinterest pin",
      );
      return;
    }
    if (!slide || !ref.src.startsWith("https://")) return;
    try {
      const response = await fetch(ref.src);
      if (!response.ok) return;
      const blob = await response.blob();
      const file = new File([blob], ref.title || "pin.png", { type: blob.type || "image/png" });
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
          name: ref.title || "Pin",
        }),
        "add pinterest pin",
      );
    } catch {
      setStatusHint("Could not place that Pin on the artwork slide.");
    }
  }

  if (!session.connected) {
    return (
      <section className={styles.panel} data-pinterest-panel="true" aria-label="Pinterest">
        <header className={styles.header}>
          <h2 className={styles.title}>Pinterest</h2>
        </header>
        <div className={styles.signIn}>
          <button type="button" className={styles.signInButton} onClick={() => void handleSignIn()}>
            Sign in
          </button>
          <p className={styles.hint}>
            Official saved-Pins / boards need a reviewed Pinterest app (
            {PINTEREST_API_STATUS.officialSavedPins}). Sign-in starts a local session so you can
            paste Pins you already saved. ArtShift does not scrape Pinterest.
          </p>
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
            onClick={() => reloadPins()}
          >
            ↻
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
              <button type="button" className={styles.disconnect} onClick={handleDisconnect}>
                ✕ Disconnect
              </button>
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
          onClick={() => setTab("boards")}
        >
          Boards
        </button>
      </div>
      {tab === "pins" ? (
        <>
          <div className={styles.pasteRow}>
            <input
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder="https://…pinimg.com/… or pinterest.com/pin/…"
              aria-label="Pinterest image URL"
            />
            <button type="button" onClick={savePinUrl}>
              Add
            </button>
          </div>
          {pins.length ? (
            <div className={styles.grid}>
              {pins.map((pin) => (
                <button
                  type="button"
                  key={pin.id}
                  className={styles.pin}
                  onClick={() => void placePin(pin)}
                  title={pin.title}
                >
                  {/* biome-ignore lint/performance/noImgElement: user Pin URLs */}
                  <img src={pin.src} alt={pin.title} />
                </button>
              ))}
            </div>
          ) : (
            <p className={styles.empty}>
              No saved Pins yet. Paste a Pin you already saved. Official board sync is{" "}
              {PINTEREST_API_STATUS.officialSavedPins}.
            </p>
          )}
        </>
      ) : (
        <p className={styles.empty}>
          Boards need the official Pinterest API ({PINTEREST_API_STATUS.officialSavedPins}). Pins
          you paste appear on the Pins tab.
        </p>
      )}
      {statusHint ? <p className={styles.hint}>{statusHint}</p> : null}
    </section>
  );
}
