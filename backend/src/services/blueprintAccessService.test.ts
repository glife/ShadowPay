import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockDb, mockBroadcast } = vi.hoisted(() => ({
  mockDb: {
    councilBlueprint: {
      findUnique: vi.fn(),
    },
    job: {
      findUnique: vi.fn(),
    },
    agent: {
      findUnique: vi.fn(),
    },
    blueprintAccessGrant: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      findMany: vi.fn(),
    },
  },
  mockBroadcast: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ db: mockDb }));
vi.mock("@/services/sseManager", () => ({ broadcast: mockBroadcast }));

import {
  getJobScopedBlueprintForExecution,
  grantBlueprintAccess,
  listBlueprintAccess,
  revokeBlueprintAccess,
  verifyBlueprintAccess,
} from "@/services/blueprintAccessService";

describe("blueprintAccessService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects grant when requester is not blueprint owner", async () => {
    mockDb.councilBlueprint.findUnique.mockResolvedValue({
      id: "bp-1",
      createdByAgentId: "owner-a",
    });

    await expect(
      grantBlueprintAccess({
        blueprintId: "bp-1",
        ownerId: "owner-b",
        targetAgentId: "agent-1",
        encryptedKeyForAgent: "enc-key",
      }),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it("creates a new access grant", async () => {
    mockDb.councilBlueprint.findUnique.mockResolvedValue({
      id: "bp-1",
      createdByAgentId: "owner-a",
    });
    mockDb.agent.findUnique.mockResolvedValue({
      id: "agent-1",
      isActive: true,
    });
    mockDb.blueprintAccessGrant.findFirst.mockResolvedValue(null);
    mockDb.blueprintAccessGrant.create.mockResolvedValue({
      id: "grant-1",
      blueprintId: "bp-1",
      agentId: "agent-1",
      revokedAt: null,
    });

    const row = await grantBlueprintAccess({
      blueprintId: "bp-1",
      ownerId: "owner-a",
      targetAgentId: "agent-1",
      encryptedKeyForAgent: "enc-key",
    });

    expect(mockDb.blueprintAccessGrant.create).toHaveBeenCalled();
    expect(row.id).toBe("grant-1");
    expect(mockBroadcast).toHaveBeenCalledWith(
      "blueprint.access.granted",
      expect.objectContaining({
        blueprintId: "bp-1",
        targetAgentId: "agent-1",
      }),
    );
  });

  it("re-activates existing grant on re-grant", async () => {
    mockDb.councilBlueprint.findUnique.mockResolvedValue({
      id: "bp-1",
      createdByAgentId: "owner-a",
    });
    mockDb.agent.findUnique.mockResolvedValue({
      id: "agent-1",
      isActive: true,
    });
    mockDb.blueprintAccessGrant.findFirst.mockResolvedValue({
      id: "grant-1",
      blueprintId: "bp-1",
      agentId: "agent-1",
      revokedAt: new Date(),
    });
    mockDb.blueprintAccessGrant.update.mockResolvedValue({
      id: "grant-1",
      revokedAt: null,
    });

    const row = await grantBlueprintAccess({
      blueprintId: "bp-1",
      ownerId: "owner-a",
      targetAgentId: "agent-1",
      encryptedKeyForAgent: "enc-key-new",
    });

    expect(mockDb.blueprintAccessGrant.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "grant-1" } }),
    );
    expect(row.id).toBe("grant-1");
  });

  it("revokes active grant", async () => {
    mockDb.councilBlueprint.findUnique.mockResolvedValue({
      id: "bp-1",
      createdByAgentId: "owner-a",
    });
    mockDb.blueprintAccessGrant.findFirst.mockResolvedValue({
      id: "grant-1",
      blueprintId: "bp-1",
      agentId: "agent-1",
      revokedAt: null,
    });
    mockDb.blueprintAccessGrant.update.mockResolvedValue({
      id: "grant-1",
      revokedAt: new Date(),
    });

    const row = await revokeBlueprintAccess({
      blueprintId: "bp-1",
      ownerId: "owner-a",
      targetAgentId: "agent-1",
    });

    expect(row.id).toBe("grant-1");
    expect(mockBroadcast).toHaveBeenCalledWith(
      "blueprint.access.revoked",
      expect.objectContaining({
        blueprintId: "bp-1",
        targetAgentId: "agent-1",
      }),
    );
  });

  it("lists active grants by default", async () => {
    mockDb.councilBlueprint.findUnique.mockResolvedValue({
      id: "bp-1",
      createdByAgentId: "owner-a",
    });
    mockDb.blueprintAccessGrant.findMany.mockResolvedValue([
      { id: "grant-1", revokedAt: null },
    ]);

    const rows = await listBlueprintAccess({
      blueprintId: "bp-1",
      ownerId: "owner-a",
    });

    expect(mockDb.blueprintAccessGrant.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ revokedAt: null }),
      }),
    );
    expect(rows).toHaveLength(1);
  });

  it("verifies whether an agent has active access", async () => {
    mockDb.blueprintAccessGrant.findFirst.mockResolvedValue({
      id: "grant-1",
      revokedAt: null,
    });

    const out = await verifyBlueprintAccess({
      blueprintId: "bp-1",
      agentId: "agent-1",
    });

    expect(out.hasAccess).toBe(true);
    expect(out.grant?.id).toBe("grant-1");
  });

  it("returns owner-scoped blueprint payload for job execution", async () => {
    mockDb.job.findUnique.mockResolvedValue({
      id: "job-1",
      posterId: "owner-a",
      blueprintId: "bp-1",
      blueprintRef: "ipfs://bp-1",
      blueprintHash: "hash-1",
      blueprintAttachedAt: new Date("2025-01-01T00:00:00.000Z"),
      blueprint: {
        id: "bp-1",
        fileverseDocId: "doc-1",
        storageRef: "ipfs://bp-1",
        contentHash: "hash-1",
        status: "generated",
      },
    });

    const out = await getJobScopedBlueprintForExecution({
      jobId: "job-1",
      requesterId: "owner-a",
    });

    expect(out).toMatchObject({
      authorized: true,
      role: "owner",
      jobId: "job-1",
      blueprintId: "bp-1",
      blueprintRef: "ipfs://bp-1",
      blueprintHash: "hash-1",
      fileverseDocId: "doc-1",
      encryptedKeyForAgent: null,
    });
  });

  it("returns granted-agent payload with encrypted key for job execution", async () => {
    mockDb.job.findUnique.mockResolvedValue({
      id: "job-1",
      posterId: "owner-a",
      blueprintId: "bp-1",
      blueprintRef: "ipfs://bp-1",
      blueprintHash: "hash-1",
      blueprintAttachedAt: new Date("2025-01-01T00:00:00.000Z"),
      blueprint: {
        id: "bp-1",
        fileverseDocId: "doc-1",
        storageRef: "ipfs://bp-1",
        contentHash: "hash-1",
        status: "generated",
      },
    });
    mockDb.blueprintAccessGrant.findFirst.mockResolvedValue({
      id: "grant-1",
      encryptedKeyForAgent: "enc-key-agent-1",
      grantedAt: new Date("2025-01-01T01:00:00.000Z"),
      revokedAt: null,
    });

    const out = await getJobScopedBlueprintForExecution({
      jobId: "job-1",
      requesterId: "agent-1",
    });

    expect(out).toMatchObject({
      authorized: true,
      role: "granted_agent",
      jobId: "job-1",
      blueprintId: "bp-1",
      blueprintRef: "ipfs://bp-1",
      blueprintHash: "hash-1",
      fileverseDocId: "doc-1",
      encryptedKeyForAgent: "enc-key-agent-1",
      grantId: "grant-1",
    });
  });

  it("rejects job-scoped blueprint retrieval when no active grant exists", async () => {
    mockDb.job.findUnique.mockResolvedValue({
      id: "job-1",
      posterId: "owner-a",
      blueprintId: "bp-1",
      blueprintRef: "ipfs://bp-1",
      blueprintHash: "hash-1",
      blueprintAttachedAt: new Date("2025-01-01T00:00:00.000Z"),
      blueprint: {
        id: "bp-1",
        fileverseDocId: "doc-1",
        storageRef: "ipfs://bp-1",
        contentHash: "hash-1",
        status: "generated",
      },
    });
    mockDb.blueprintAccessGrant.findFirst.mockResolvedValue(null);

    await expect(
      getJobScopedBlueprintForExecution({
        jobId: "job-1",
        requesterId: "agent-no-access",
      }),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it("rejects job-scoped blueprint retrieval when no blueprint is attached", async () => {
    mockDb.job.findUnique.mockResolvedValue({
      id: "job-1",
      posterId: "owner-a",
      blueprintId: null,
      blueprintRef: null,
      blueprintHash: null,
      blueprintAttachedAt: null,
      blueprint: null,
    });

    await expect(
      getJobScopedBlueprintForExecution({
        jobId: "job-1",
        requesterId: "owner-a",
      }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});
