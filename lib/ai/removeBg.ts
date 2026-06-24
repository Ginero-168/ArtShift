/**
 * Background Removal client — proxies to WaveSpeed BRIA RMBG via /api/removebg.
 * Takes an image data URL, sends to server, polls for result, returns processed URL.
 */

export async function removeBackground(imageDataUrl: string): Promise<string> {
  // Step 1: submit job
  const postRes = await fetch("/api/removebg", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ image: imageDataUrl }),
  });

  if (!postRes.ok) {
    const err = await postRes.json().catch(() => ({ error: "unknown" }));
    throw new Error(err.error || `BG removal failed: ${postRes.status}`);
  }

  const postData = await postRes.json();
  const requestId = postData.id || postData.requestId;
  if (!requestId) {
    throw new Error("BG removal: no requestId returned");
  }

  // Step 2: poll for result
  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    const statusRes = await fetch(`/api/removebg?requestId=${encodeURIComponent(requestId)}`);
    if (!statusRes.ok) continue;
    const statusData = await statusRes.json();
    if (statusData.status === "completed" && statusData.output?.image) {
      return statusData.output.image as string;
    }
    if (statusData.status === "failed") {
      throw new Error("BG removal: job failed on server");
    }
  }

  throw new Error("BG removal: timeout waiting for result");
}
