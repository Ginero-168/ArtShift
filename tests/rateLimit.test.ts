import { describe, expect, it } from "vitest";
import { getClientIp } from "@/lib/rateLimit";

describe("client IP extraction", () => {
  it("does not trust a client-supplied forwarded-for chain", () => {
    expect(
      getClientIp({
        ip: "10.0.0.4",
        headers: new Headers({ "x-forwarded-for": "203.0.113.9" }),
      }),
    ).toBe("10.0.0.4");
  });

  it("ignores x-real-ip unless the trusted proxy is explicitly configured", () => {
    const request = {
      ip: "10.0.0.4",
      headers: new Headers({ "x-real-ip": "203.0.113.9" }),
    };
    expect(getClientIp(request)).toBe("10.0.0.4");
    expect(getClientIp(request, { trustedProxy: "nginx" })).toBe("203.0.113.9");
  });
});
