import {
  mapPinterestBoard,
  mapPinterestPin,
  PINTEREST_API_BASE,
  type PinterestBoardCard,
  type PinterestPinCard,
} from "@/lib/moodboard/pinterest";

export type PinterestAccount = {
  username: string;
  profileImage?: string;
};

export async function fetchPinterestAccount(
  accessToken: string,
  signal?: AbortSignal,
): Promise<PinterestAccount> {
  const payload = await pinterestJson("/user_account", accessToken, signal);
  const username = typeof payload.username === "string" ? payload.username.trim() : "";
  if (!username) throw new Error("Pinterest account is missing a username.");
  return {
    username,
    profileImage: typeof payload.profile_image === "string" ? payload.profile_image : undefined,
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

export class PinterestApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "PinterestApiError";
    this.status = status;
  }
}

async function pinterestJson(
  path: string,
  accessToken: string,
  signal?: AbortSignal,
): Promise<Record<string, unknown>> {
  const response = await fetch(`${PINTEREST_API_BASE}${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal,
    cache: "no-store",
  });
  const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    throw new PinterestApiError(
      response.status,
      typeof payload.message === "string" ? payload.message : "Pinterest API request failed.",
    );
  }
  return payload;
}

function listItems(payload: Record<string, unknown>): unknown[] {
  return Array.isArray(payload.items) ? payload.items : [];
}
