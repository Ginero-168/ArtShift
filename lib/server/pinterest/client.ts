import {
  mapPinterestBoard,
  mapPinterestPin,
  PINTEREST_API_BASE,
  type PinterestBoardCard,
  type PinterestPinCard,
} from "@/lib/pinterest/api";

export type PinterestAccount = {
  username: string;
  profileImage?: string;
};

export class PinterestApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "PinterestApiError";
    this.status = status;
  }
}

export async function fetchPinterestAccount(
  accessToken: string,
  signal?: AbortSignal,
): Promise<PinterestAccount> {
  const payload = await pinterestJson("/user_account", accessToken, signal);
  const username = typeof payload.username === "string" ? payload.username.trim() : "";
  if (!username) throw new PinterestApiError(502, "Pinterest account is missing a username.");
  return {
    username: username.slice(0, 120),
    ...(typeof payload.profile_image === "string" ? { profileImage: payload.profile_image } : {}),
  };
}

export async function fetchPinterestPins(
  accessToken: string,
  signal?: AbortSignal,
  boardId?: string,
): Promise<PinterestPinCard[]> {
  const path = boardId
    ? `/boards/${encodeURIComponent(boardId)}/pins?page_size=50`
    : "/pins?page_size=50";
  const payload = await pinterestJson(path, accessToken, signal);
  return listItems(payload)
    .map(mapPinterestPin)
    .filter((pin): pin is PinterestPinCard => pin !== null);
}

export async function fetchPinterestBoards(
  accessToken: string,
  signal?: AbortSignal,
): Promise<PinterestBoardCard[]> {
  const payload = await pinterestJson("/boards?page_size=50", accessToken, signal);
  return listItems(payload)
    .map(mapPinterestBoard)
    .filter((board): board is PinterestBoardCard => board !== null);
}

async function pinterestJson(
  path: string,
  accessToken: string,
  signal?: AbortSignal,
): Promise<Record<string, unknown>> {
  const timeoutSignal = AbortSignal.timeout(15_000);
  const requestSignal = signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal;
  let response: Response;
  try {
    response = await fetch(`${PINTEREST_API_BASE}${path}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: requestSignal,
      cache: "no-store",
    });
  } catch {
    throw new PinterestApiError(502, "Pinterest API request failed.");
  }
  const payload = (await response.json().catch(() => ({}))) as unknown;
  const record = isRecord(payload) ? payload : {};
  if (!response.ok) {
    throw new PinterestApiError(
      response.status,
      typeof record.message === "string" ? record.message : "Pinterest API request failed.",
    );
  }
  return record;
}

function listItems(payload: Record<string, unknown>): unknown[] {
  return Array.isArray(payload.items) ? payload.items : [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
