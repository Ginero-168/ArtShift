const MAX_PIN_IMAGE_BYTES = 20 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"]);

/** Only Pinterest's image CDN. Rejects other hosts so the proxy cannot be used for SSRF. */
export function allowlistedPinImageUrl(value: string): URL | null {
  if (!value || value.length > 2_000) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password) return null;
    const host = url.hostname.toLowerCase();
    if (host !== "i.pinimg.com" && !host.endsWith(".pinimg.com")) return null;
    return url;
  } catch {
    return null;
  }
}

export async function downloadPinImage(
  start: URL,
  signal?: AbortSignal,
): Promise<{ bytes: Uint8Array; contentType: string }> {
  let current = start;
  for (let hop = 0; hop < 3; hop += 1) {
    const timeoutSignal = AbortSignal.timeout(20_000);
    const requestSignal = signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal;
    const response = await fetch(current, {
      redirect: "manual",
      signal: requestSignal,
      cache: "no-store",
      headers: { Accept: "image/avif,image/webp,image/png,image/jpeg,image/*;q=0.8" },
    });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      const next = location ? allowlistedPinImageUrl(new URL(location, current).toString()) : null;
      if (!next) throw new Error("Pin image redirect was rejected.");
      current = next;
      continue;
    }
    if (!response.ok) throw new Error("Could not download the Pin.");
    const contentType = normalizeImageType(response.headers.get("content-type"));
    if (!contentType) throw new Error("Pin image type is not supported.");
    const advertised = Number(response.headers.get("content-length") ?? "0");
    if (Number.isFinite(advertised) && advertised > MAX_PIN_IMAGE_BYTES) {
      throw new Error("Pin image is too large.");
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength === 0 || bytes.byteLength > MAX_PIN_IMAGE_BYTES) {
      throw new Error("Pin image is too large.");
    }
    return { bytes, contentType };
  }
  throw new Error("Pin image redirect was rejected.");
}

function normalizeImageType(value: string | null): string | null {
  if (!value) return null;
  const mime = value.split(";")[0]?.trim().toLowerCase() ?? "";
  const normalized = mime === "image/jpg" ? "image/jpeg" : mime;
  return ALLOWED_TYPES.has(normalized) ? normalized : null;
}
