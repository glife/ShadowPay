import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockDb, mockBroadcast } = vi.hoisted(() => ({
  mockDb: {
    job: {
      create: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
  mockBroadcast: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ db: mockDb }));
vi.mock("@/services/sseManager", () => ({ broadcast: mockBroadcast }));

import { attachBlueprintToJob, createJob } from "@/services/jobService";

describe("jobService blueprint attachment", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates job with blueprint reference fields", async () => {
    mockDb.job.create.mockResolvedValue({
      id: "job-1",
      blueprintId: "bp-1",
      blueprintRef: "ipfs://bp",
      blueprintHash: "hash-1",
    });

    const job = await createJob("poster-1", {
      title: "Build strategy",
      blueprintId: "bp-1",
      blueprintRef: "ipfs://bp",
      blueprintHash: "hash-1",
    });

    expect(mockDb.job.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          blueprintId: "bp-1",
          blueprintRef: "ipfs://bp",
          blueprintHash: "hash-1",
        }),
      }),
    );
    expect(job.id).toBe("job-1");
  });

  it("rejects blueprint attach by non-owner", async () => {
    mockDb.job.findUnique.mockResolvedValue({
      id: "job-1",
      posterId: "poster-a",
    });

    await expect(
      attachBlueprintToJob("job-1", "poster-b", {
        blueprintId: "bp-1",
        blueprintRef: "ipfs://bp",
        blueprintHash: "hash-1",
      }),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it("attaches blueprint to owned job and broadcasts", async () => {
    mockDb.job.findUnique.mockResolvedValue({
      id: "job-1",
      posterId: "poster-1",
    });
    mockDb.job.update.mockResolvedValue({
      id: "job-1",
      blueprintId: "bp-1",
      blueprintRef: "ipfs://bp",
      blueprintHash: "hash-1",
    });

    const out = await attachBlueprintToJob("job-1", "poster-1", {
      blueprintId: "bp-1",
      blueprintRef: "ipfs://bp",
      blueprintHash: "hash-1",
    });

    expect(mockDb.job.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          blueprintId: "bp-1",
          blueprintRef: "ipfs://bp",
          blueprintHash: "hash-1",
        }),
      }),
    );
    expect(mockBroadcast).toHaveBeenCalledWith(
      "job.blueprint.attached",
      expect.objectContaining({ jobId: "job-1", blueprintId: "bp-1" }),
    );
    expect(out.blueprintId).toBe("bp-1");
  });
});
