import { beforeEach, describe, expect, it, vi } from "vitest";
import { sha256Hex, uploadBuffer } from "@/lib/fileverse";

describe("lib/fileverse", () => {
  beforeEach(() => {
    process.env.FILEVERSE_API_KEY = "test-key";
    process.env.FILEVERSE_BASE_URL = "https://api.fileverse.io";
    process.env.FILEVERSE_TIMEOUT_MS = "2000";
    vi.restoreAllMocks();
  });

  it("computes sha256 consistently", () => {
    const buf = Buffer.from("hello");
    expect(sha256Hex(buf)).toBe(
      "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824",
    );
  });

  it("uploads and returns normalized metadata", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ id: "doc-1", url: "ipfs://abc" }),
    } as Response);

    const out = await uploadBuffer({
      file: Buffer.from("hello"),
      filename: "report.md",
      mimeType: "text/markdown",
    });

    expect(fetchMock).toHaveBeenCalled();
    expect(out.docId).toBe("doc-1");
    expect(out.storageRef).toBe("ipfs://abc");
    expect(out.contentHash).toBe(sha256Hex(Buffer.from("hello")));
  });

  it("throws when Fileverse response hash mismatches local hash", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        id: "doc-1",
        url: "ipfs://abc",
        hash: "deadbeef",
      }),
    } as Response);

    await expect(
      uploadBuffer({
        file: Buffer.from("hello"),
        filename: "report.md",
        mimeType: "text/markdown",
      }),
    ).rejects.toMatchObject({ statusCode: 502 });
  });
});
