import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockDb, mockUploadBuffer, mockBroadcast } = vi.hoisted(() => ({
  mockDb: {
    councilBlueprint: {
      findFirst: vi.fn(),
      create: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
  },
  mockUploadBuffer: vi.fn(),
  mockBroadcast: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ db: mockDb }));
vi.mock("@/lib/fileverse", () => ({ uploadBuffer: mockUploadBuffer }));
vi.mock("@/services/sseManager", () => ({ broadcast: mockBroadcast }));

import {
  createBlueprint,
  getBlueprintAttachReference,
  getBlueprintById,
  listBlueprints,
} from "@/services/councilBlueprintService";

describe("councilBlueprintService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates blueprint by uploading markdown to Fileverse", async () => {
    mockDb.councilBlueprint.findFirst.mockResolvedValue(null);
    mockUploadBuffer.mockResolvedValue({
      docId: "doc-1",
      storageRef: "ipfs://blueprint-1",
      contentHash: "hash-1",
      byteSize: 128,
      mimeType: "text/markdown",
      filename: "blueprint-req-1.md",
    });
    mockDb.councilBlueprint.create.mockResolvedValue({
      id: "bp-1",
      requestId: "req-1",
      createdByAgentId: "agent-1",
      storageRef: "ipfs://blueprint-1",
    });

    const row = await createBlueprint({
      requestId: "req-1",
      createdByAgentId: "agent-1",
      inputJson: { objective: "Analyze SOL" },
    });

    expect(mockUploadBuffer).toHaveBeenCalledWith(
      expect.objectContaining({ mimeType: "text/markdown" }),
    );
    expect(mockDb.councilBlueprint.create).toHaveBeenCalled();
    expect(mockBroadcast).toHaveBeenCalledWith(
      "council.blueprint.generated",
      expect.objectContaining({ blueprintId: "bp-1", requestId: "req-1" }),
    );
    expect(row.id).toBe("bp-1");
  });

  it("returns existing row on idempotency match without upload", async () => {
    const existing = {
      id: "bp-1",
      requestId: "req-1",
      idempotencyKey: "idem-1",
    };

    mockDb.councilBlueprint.findFirst.mockResolvedValue(existing);

    const out = await createBlueprint({
      requestId: "req-1",
      createdByAgentId: "agent-1",
      idempotencyKey: "idem-1",
      markdown: "# Existing",
    });

    expect(out).toEqual(existing);
    expect(mockUploadBuffer).not.toHaveBeenCalled();
  });

  it("forbids blueprint read by non-owner", async () => {
    mockDb.councilBlueprint.findUnique.mockResolvedValue({
      id: "bp-1",
      createdByAgentId: "agent-a",
    });

    await expect(getBlueprintById("bp-1", "agent-b")).rejects.toMatchObject({
      statusCode: 403,
    });
  });

  it("forbids attach reference access by non-owner", async () => {
    mockDb.councilBlueprint.findUnique.mockResolvedValue({
      id: "bp-1",
      createdByAgentId: "agent-a",
      storageRef: "ipfs://bp-1",
      contentHash: "hash-1",
      fileverseDocId: "doc-1",
    });

    await expect(
      getBlueprintAttachReference("bp-1", "agent-b"),
    ).rejects.toMatchObject({
      statusCode: 403,
    });
  });

  it("returns attach reference for owner", async () => {
    mockDb.councilBlueprint.findUnique.mockResolvedValue({
      id: "bp-1",
      createdByAgentId: "agent-a",
      storageRef: "ipfs://bp-1",
      contentHash: "hash-1",
      fileverseDocId: "doc-1",
    });

    const out = await getBlueprintAttachReference("bp-1", "agent-a");

    expect(out).toEqual({
      blueprintId: "bp-1",
      blueprintRef: "ipfs://bp-1",
      blueprintHash: "hash-1",
      fileverseDocId: "doc-1",
    });
  });

  it("lists only caller blueprints", async () => {
    mockDb.councilBlueprint.findMany.mockResolvedValue([
      { id: "bp-1", createdByAgentId: "agent-1" },
    ]);

    const rows = await listBlueprints({
      createdByAgentId: "agent-1",
      status: "generated",
    });

    expect(mockDb.councilBlueprint.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ createdByAgentId: "agent-1" }),
      }),
    );
    expect(rows).toHaveLength(1);
  });
});
