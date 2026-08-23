export type AiRequest = {
  endpoint: string;
  body: unknown;
  signal?: AbortSignal;
};

export interface AiTransportPort {
  request<T>(request: AiRequest): Promise<T>;
}

export const browserAiTransport: AiTransportPort = {
  async request<T>({ endpoint, body, signal }: AiRequest) {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal,
    });
    if (!response.ok) throw new Error(`AI transport failed with status ${response.status}.`);
    return (await response.json()) as T;
  },
};
