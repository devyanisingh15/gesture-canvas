import { describe, expect, it } from "vitest";
import { readBody } from "./http";

const post = (body: BodyInit, headers: Record<string, string> = {}) =>
  new Request("http://localhost/api/games", { method: "POST", body, headers, duplex: "half" } as RequestInit);

describe("readBody", () => {
  it("reads a JSON object", async () => {
    await expect(readBody(post(JSON.stringify({ a: 1 })))).resolves.toEqual({ a: 1 });
  });

  it("refuses a body that says it is over 1 MB without reading it", async () => {
    await expect(readBody(post("{}", { "content-length": "5000000" }))).rejects.toThrow("Request too large.");
  });

  it("stops reading a streamed body once it passes 1 MB", async () => {
    let sent = 0;
    const chunk = new Uint8Array(64 * 1024).fill(32);
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (sent > 50_000_000) return controller.close();
        sent += chunk.byteLength;
        controller.enqueue(chunk);
      },
    });
    await expect(readBody(post(stream))).rejects.toThrow("Request too large.");
    expect(sent).toBeLessThan(2_000_000);
  });

  it("refuses something that isn't a JSON object", async () => {
    await expect(readBody(post("[1,2]"))).rejects.toThrow("Expected a JSON object.");
    await expect(readBody(post("not json"))).rejects.toThrow("Expected a JSON object.");
  });
});
