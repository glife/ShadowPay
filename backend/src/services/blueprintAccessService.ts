import { db } from "@/lib/db";
import { fail } from "@/lib/errors";
import { broadcast } from "@/services/sseManager";

const blueprintModel = () => (db as any).councilBlueprint;
const grantModel = () => (db as any).blueprintAccessGrant;
const jobModel = () => (db as any).job;

const ensureBlueprintOwner = async (
  blueprintId: string,
  requesterId: string,
) => {
  const blueprint = await blueprintModel().findUnique({
    where: { id: blueprintId },
    select: {
      id: true,
      createdByAgentId: true,
    },
  });

  if (!blueprint) throw fail("Blueprint not found", 404);
  if (blueprint.createdByAgentId !== requesterId) {
    throw fail("Only blueprint creator can manage access", 403);
  }

  return blueprint;
};

export const grantBlueprintAccess = async (input: {
  blueprintId: string;
  ownerId: string;
  targetAgentId: string;
  encryptedKeyForAgent: string;
}) => {
  const blueprintId = input.blueprintId?.trim();
  const targetAgentId = input.targetAgentId?.trim();
  const encryptedKeyForAgent = input.encryptedKeyForAgent?.trim();

  if (!blueprintId) throw fail("blueprintId is required", 400);
  if (!targetAgentId) throw fail("targetAgentId is required", 400);
  if (!encryptedKeyForAgent)
    throw fail("encryptedKeyForAgent is required", 400);

  await ensureBlueprintOwner(blueprintId, input.ownerId);

  const agent = await db.agent.findUnique({
    where: { id: targetAgentId },
    select: { id: true, isActive: true },
  });
  if (!agent) throw fail("Target agent not found", 404);
  if (!agent.isActive) throw fail("Target agent is inactive", 400);

  const existing = await grantModel().findFirst({
    where: {
      blueprintId,
      agentId: targetAgentId,
    },
  });

  const row = existing
    ? await grantModel().update({
        where: { id: existing.id },
        data: {
          encryptedKeyForAgent,
          grantedByAgentId: input.ownerId,
          revokedAt: null,
          grantedAt: new Date(),
        },
      })
    : await grantModel().create({
        data: {
          blueprintId,
          agentId: targetAgentId,
          grantedByAgentId: input.ownerId,
          encryptedKeyForAgent,
        },
      });

  broadcast("blueprint.access.granted", {
    blueprintId,
    targetAgentId,
    grantedByAgentId: input.ownerId,
    grantId: row.id,
  });

  return row;
};

export const revokeBlueprintAccess = async (input: {
  blueprintId: string;
  ownerId: string;
  targetAgentId: string;
}) => {
  const blueprintId = input.blueprintId?.trim();
  const targetAgentId = input.targetAgentId?.trim();

  if (!blueprintId) throw fail("blueprintId is required", 400);
  if (!targetAgentId) throw fail("targetAgentId is required", 400);

  await ensureBlueprintOwner(blueprintId, input.ownerId);

  const existing = await grantModel().findFirst({
    where: {
      blueprintId,
      agentId: targetAgentId,
      revokedAt: null,
    },
  });

  if (!existing) throw fail("Active access grant not found", 404);

  const row = await grantModel().update({
    where: { id: existing.id },
    data: {
      revokedAt: new Date(),
    },
  });

  broadcast("blueprint.access.revoked", {
    blueprintId,
    targetAgentId,
    revokedByAgentId: input.ownerId,
    grantId: row.id,
  });

  return row;
};

export const listBlueprintAccess = async (input: {
  blueprintId: string;
  ownerId: string;
  includeRevoked?: boolean;
}) => {
  const blueprintId = input.blueprintId?.trim();
  if (!blueprintId) throw fail("blueprintId is required", 400);

  await ensureBlueprintOwner(blueprintId, input.ownerId);

  return grantModel().findMany({
    where: {
      blueprintId,
      ...(input.includeRevoked ? {} : { revokedAt: null }),
    },
    orderBy: { grantedAt: "desc" },
  });
};

export const verifyBlueprintAccess = async (input: {
  blueprintId: string;
  agentId: string;
}) => {
  const grant = await grantModel().findFirst({
    where: {
      blueprintId: input.blueprintId,
      agentId: input.agentId,
      revokedAt: null,
    },
  });

  return {
    hasAccess: !!grant,
    grant: grant || null,
  };
};

export const getJobScopedBlueprintForExecution = async (input: {
  jobId: string;
  requesterId: string;
}) => {
  const jobId = input.jobId?.trim();
  if (!jobId) throw fail("jobId is required", 400);

  const job = await jobModel().findUnique({
    where: { id: jobId },
    select: {
      id: true,
      posterId: true,
      blueprintId: true,
      blueprintRef: true,
      blueprintHash: true,
      blueprintAttachedAt: true,
      blueprint: {
        select: {
          id: true,
          fileverseDocId: true,
          storageRef: true,
          contentHash: true,
          status: true,
        },
      },
    },
  });

  if (!job) throw fail("Job not found", 404);
  if (
    !job.blueprintId ||
    !job.blueprintRef ||
    !job.blueprintHash ||
    !job.blueprint
  ) {
    throw fail("No blueprint attached to job", 404);
  }

  if (job.posterId === input.requesterId) {
    return {
      authorized: true,
      role: "owner" as const,
      jobId: job.id,
      blueprintId: job.blueprint.id,
      blueprintRef: job.blueprint.storageRef,
      blueprintHash: job.blueprint.contentHash,
      fileverseDocId: job.blueprint.fileverseDocId,
      encryptedKeyForAgent: null,
      blueprintAttachedAt: job.blueprintAttachedAt,
    };
  }

  const grant = await grantModel().findFirst({
    where: {
      blueprintId: job.blueprintId,
      agentId: input.requesterId,
      revokedAt: null,
    },
    select: {
      id: true,
      encryptedKeyForAgent: true,
      grantedAt: true,
      revokedAt: true,
    },
  });

  if (!grant) {
    throw fail("No active blueprint access grant for this agent", 403);
  }

  return {
    authorized: true,
    role: "granted_agent" as const,
    jobId: job.id,
    blueprintId: job.blueprint.id,
    blueprintRef: job.blueprint.storageRef,
    blueprintHash: job.blueprint.contentHash,
    fileverseDocId: job.blueprint.fileverseDocId,
    encryptedKeyForAgent: grant.encryptedKeyForAgent,
    grantId: grant.id,
    grantedAt: grant.grantedAt,
    blueprintAttachedAt: job.blueprintAttachedAt,
  };
};
