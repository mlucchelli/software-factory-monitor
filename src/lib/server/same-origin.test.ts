import { describe, expect, it } from "vitest";
import { rejectForeignRequest } from "./same-origin";

function request(headers: Record<string, string>): Request {
  return new Request("http://127.0.0.1:4310/api/sessions", {
    method: "POST",
    headers: {
      host: "127.0.0.1:4310",
      origin: "http://127.0.0.1:4310",
      "content-type": "application/json",
      ...headers,
    },
  });
}

describe("rejectForeignRequest", () => {
  it("lets the app's own page through", () => {
    expect(rejectForeignRequest(request({}))).toBeNull();
    expect(
      rejectForeignRequest(request({ "sec-fetch-site": "same-origin" })),
    ).toBeNull();
  });

  it("refuses another origin, a rebound host, a form post and a cross-site fetch", () => {
    const refused: Record<string, string>[] = [
      { origin: "https://evil.example" },
      { host: "evil.example", origin: "http://evil.example" },
      { "content-type": "text/plain" },
      { "sec-fetch-site": "cross-site" },
    ];
    for (const headers of refused) {
      expect(rejectForeignRequest(request(headers))?.status).toBe(403);
    }
  });

  it("lets a listed host through, with or without its port, and no other", () => {
    const remote = {
      host: "mini.tailnet.ts.net:4310",
      origin: "http://mini.tailnet.ts.net:4310",
    };
    expect(rejectForeignRequest(request(remote))?.status).toBe(403);
    expect(
      rejectForeignRequest(request(remote), ["mini.tailnet.ts.net"]),
    ).toBeNull();
    expect(
      rejectForeignRequest(request(remote), ["mini.tailnet.ts.net:4310"]),
    ).toBeNull();
    expect(
      rejectForeignRequest(request(remote), ["mini.tailnet.ts.net:9999"])
        ?.status,
    ).toBe(403);
    // Listing a host does not loosen the origin check.
    expect(
      rejectForeignRequest(
        request({ ...remote, origin: "https://evil.example" }),
        ["mini.tailnet.ts.net"],
      )?.status,
    ).toBe(403);
  });
});
