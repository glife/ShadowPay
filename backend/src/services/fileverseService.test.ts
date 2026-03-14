import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockDb, mockUploadBuffer, mockBroadcast } = vi.hoisted(() => ({
  mockDb: {
    job: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    jobDeliverable: {
      findFirst: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      updateMany: vi.fn(),
      update: vi.fn(),
    },
    bid: {
      findFirst: vi.fn(),
    },
    negotiationOffer: {
      findMany: vi.fn(),
    },
    $transaction: vi.fn(),
  },
  mockUploadBuffer: vi.fn(),
  mockBroadcast: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ db: mockDb }));
vi.mock("@/lib/fileverse", () => ({ uploadBuffer: mockUploadBuffer }));
vi.mock("@/services/sseManager", () => ({ broadcast: mockBroadcast }));

import {
  buildDisputeEvidence,
  finalizeDeliverable,
  uploadDeliverable,
} from "@/services/fileverseService";

describe("fileverseService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects upload when uploader is not hired agent", async () => {
    mockDb.job.findUnique.mockResolvedValue({
      id: "job-1",
      hiredAgentId: "agent-a",
      status: "in_progress",
    });

    await expect(
      uploadDeliverable({
        jobId: "job-1",
        uploaderId: "agent-b",
        bytes: Buffer.from("hello"),
        filename: "report.md",
        mimeType: "text/markdown",
      }),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it("returns existing deliverable by idempotency key without re-upload", async () => {
    const existing = {
      id: "del-1",
      jobId: "job-1",
      version: 1,
      storageRef: "ipfs://abc",
    };

    mockDb.job.findUnique.mockResolvedValue({
      id: "job-1",
      hiredAgentId: "agent-a",
      status: "in_progress",
    });
    mockDb.jobDeliverable.findFirst.mockResolvedValueOnce(existing);

    const result = await uploadDeliverable({
      jobId: "job-1",
      uploaderId: "agent-a",
      bytes: Buffer.from("hello"),
      filename: "report.md",
      mimeType: "text/markdown",
      idempotencyKey: "idem-1",
    });

    expect(result).toEqual(existing);
    expect(mockUploadBuffer).not.toHaveBeenCalled();
  });

  it("rejects upload when idempotency key exceeds max length", async () => {
    mockDb.job.findUnique.mockResolvedValue({
      id: "job-1",
      hiredAgentId: "agent-a",
      status: "in_progress",
    });

    await expect(
      uploadDeliverable({
        jobId: "job-1",
        uploaderId: "agent-a",
        bytes: Buffer.from("hello"),
        filename: "report.md",
        mimeType: "text/markdown",
        idempotencyKey: "x".repeat(129),
      }),
    ).rejects.toMatchObject({ statusCode: 400 });

    expect(mockUploadBuffer).not.toHaveBeenCalled();
  });

  it("finalizes one deliverable and updates job reference", async () => {
    mockDb.job.findUnique.mockResolvedValue({
      id: "job-1",
      posterId: "poster-1",
    });
    mockDb.jobDeliverable.findUnique.mockResolvedValue({
      id: "del-1",
      jobId: "job-1",
    });

    const tx = {
      jobDeliverable: {
        updateMany: vi.fn().mockResolvedValue({ count: 2 }),
        update: vi.fn().mockResolvedValue({
          id: "del-1",
          jobId: "job-1",
          storageRef: "ipfs://final",
          version: 2,
          isFinal: true,
        }),
      },
      job: {
        update: vi.fn().mockResolvedValue({ id: "job-1" }),
      },
    };

    mockDb.$transaction.mockImplementation(async (fn: any) => fn(tx));

    const result = await finalizeDeliverable("job-1", "del-1", "poster-1");

    expect(tx.jobDeliverable.updateMany).toHaveBeenCalled();
    expect(tx.job.update).toHaveBeenCalledWith({
      where: { id: "job-1" },
      data: { deliverable: "ipfs://final" },
    });
    expect(result.isFinal).toBe(true);
    expect(mockBroadcast).toHaveBeenCalledWith(
      "deliverable.finalized",
      expect.objectContaining({ jobId: "job-1", deliverableId: "del-1" }),
    );
  });

  it("builds dispute evidence and emits event", async () => {
    mockDb.job.findUnique
      .mockResolvedValueOnce({
        id: "job-1",
        posterId: "poster-1",
        hiredAgentId: "agent-a",
      })
      .mockResolvedValueOnce({ id: "job-1", title: "Test job" });

    mockDb.bid.findFirst.mockResolvedValue({ id: "bid-1", status: "accepted" });
    mockDb.negotiationOffer.findMany.mockResolvedValue([{ id: "offer-1" }]);
    mockDb.jobDeliverable.findMany.mockResolvedValue([
      { id: "del-1", version: 1 },
    ]);

    const evidence = await buildDisputeEvidence("job-1", "poster-1");

    expect(evidence).toMatchObject({
      job: { id: "job-1" },
      acceptedBid: { id: "bid-1" },
      offers: [{ id: "offer-1" }],
      deliverables: [{ id: "del-1", version: 1 }],
    });

    expect(mockBroadcast).toHaveBeenCalledWith(
      "dispute.evidence_ready",
      expect.objectContaining({ jobId: "job-1", deliverableCount: 1 }),
    );
  });
});
