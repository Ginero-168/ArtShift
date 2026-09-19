/**
 * Temporary Photopea escape hatch — Live Messaging protocol.
 *
 * Photopea runs on photopea.com. Pixels move client-side via postMessage
 * (ArrayBuffer in, PNG ArrayBuffer out). No public CORS URL is required.
 *
 * Docs: https://www.photopea.com/api/live and https://www.photopea.com/api/
 */

export const PHOTOPEA_ORIGIN = "https://www.photopea.com";
export const PHOTOPEA_ECHO_SAVE = "artshift:photopea-save";
export const PHOTOPEA_ECHO_OPEN = "artshift:photopea-open";
export const PHOTOPEA_READY_TIMEOUT_MS = 45_000;

/** Script Photopea runs on File → Save (customIO) and on Apply back. */
export const PHOTOPEA_SAVE_SCRIPT = [
  'app.activeDocument.saveToOE("png");',
  `app.echoToOE("${PHOTOPEA_ECHO_SAVE}");`,
].join(" ");

const PNG_SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] as const;

export type PhotopeaEnvironment = {
  theme: number;
  intro: boolean;
  localsave: boolean;
  customIO: {
    save: string;
    open: string;
  };
  phrases: Array<number[] | string>;
};

export function buildPhotopeaEnvironment(): PhotopeaEnvironment {
  return {
    theme: 1,
    intro: false,
    // Keep File → Save; hide Save as PSD / Save for Web / Publish Online
    // so the user is steered back through ArtShift instead of a download.
    localsave: false,
    customIO: {
      save: PHOTOPEA_SAVE_SCRIPT,
      open: `app.echoToOE("${PHOTOPEA_ECHO_OPEN}");`,
    },
    phrases: [[1, 2], "Apply back to ArtShift"],
  };
}

/** Hash-only config (no files). Pixels are sent later as ArrayBuffer. */
export function buildPhotopeaEmbedUrl(): string {
  const config = { environment: buildPhotopeaEnvironment() };
  return `${PHOTOPEA_ORIGIN}#${encodeURIComponent(JSON.stringify(config))}`;
}

export function isPhotopeaOrigin(origin: string): boolean {
  return origin === PHOTOPEA_ORIGIN;
}

export function isPhotopeaMessageSource(
  event: Pick<MessageEvent, "origin" | "source">,
  iframeWindow: Window | null,
): boolean {
  if (!isPhotopeaOrigin(event.origin)) return false;
  if (!iframeWindow) return false;
  return event.source === iframeWindow;
}

export type PhotopeaInbound =
  | { kind: "done" }
  | { kind: "echo"; text: string }
  | { kind: "buffer"; buffer: ArrayBuffer }
  | { kind: "ignore" };

export function classifyPhotopeaMessage(data: unknown): PhotopeaInbound {
  if (data === "done") return { kind: "done" };
  if (typeof data === "string") return { kind: "echo", text: data };
  if (data instanceof ArrayBuffer) return { kind: "buffer", buffer: data };
  if (ArrayBuffer.isView(data)) {
    const view = data;
    const copy = new Uint8Array(view.byteLength);
    copy.set(new Uint8Array(view.buffer, view.byteOffset, view.byteLength));
    return { kind: "buffer", buffer: copy.buffer };
  }
  return { kind: "ignore" };
}

export function isPngArrayBuffer(buffer: ArrayBuffer): boolean {
  const bytes = new Uint8Array(buffer);
  if (bytes.length < PNG_SIG.length) return false;
  return PNG_SIG.every((value, index) => bytes[index] === value);
}

export type PhotopeaPhase = "awaitingReady" | "awaitingOpen" | "ready" | "awaitingSave" | "error";

export type PhotopeaHandshakeEvent =
  | { type: "file-sent" }
  | { type: "ready" }
  | { type: "png"; buffer: ArrayBuffer }
  | { type: "save-echo" }
  | { type: "open-echo" }
  | { type: "error"; message: string }
  | { type: "noop" };

/**
 * Outer-environment handshake:
 * first `done` → send PNG ArrayBuffer → next `done` → ready.
 * Once ready, any PNG ArrayBuffer is a Save / Apply payload.
 */
export function createPhotopeaHandshake(options: {
  fileBuffer: ArrayBuffer;
  sendBuffer: (buffer: ArrayBuffer) => void;
  sendScript: (script: string) => void;
}) {
  let phase: PhotopeaPhase = "awaitingReady";
  let fileSent = false;

  const sendFile = () => {
    if (fileSent) return;
    fileSent = true;
    options.sendBuffer(options.fileBuffer);
    phase = "awaitingOpen";
  };

  const handle = (message: PhotopeaInbound): PhotopeaHandshakeEvent => {
    if (phase === "error") return { type: "noop" };

    if (phase === "awaitingReady") {
      if (message.kind === "done") {
        sendFile();
        return { type: "file-sent" };
      }
      return { type: "noop" };
    }

    if (phase === "awaitingOpen") {
      if (message.kind === "done") {
        phase = "ready";
        return { type: "ready" };
      }
      return { type: "noop" };
    }

    if (message.kind === "buffer") {
      if (!isPngArrayBuffer(message.buffer)) {
        phase = "error";
        return { type: "error", message: "Photopea returned a file that is not a PNG" };
      }
      phase = "awaitingSave";
      return { type: "png", buffer: message.buffer };
    }

    if (message.kind === "echo" && message.text === PHOTOPEA_ECHO_SAVE) {
      return { type: "save-echo" };
    }

    if (message.kind === "echo" && message.text === PHOTOPEA_ECHO_OPEN) {
      return { type: "open-echo" };
    }

    if (message.kind === "done" && phase === "awaitingSave") {
      phase = "ready";
      return { type: "noop" };
    }

    return { type: "noop" };
  };

  const requestSave = () => {
    if (phase !== "ready") return false;
    phase = "awaitingSave";
    options.sendScript(PHOTOPEA_SAVE_SCRIPT);
    return true;
  };

  const markReadyAgain = () => {
    if (phase === "awaitingSave") phase = "ready";
  };

  const fail = (message: string) => {
    phase = "error";
    return message;
  };

  return {
    handle,
    requestSave,
    markReadyAgain,
    fail,
    getPhase: () => phase,
    didSendFile: () => fileSent,
  };
}
