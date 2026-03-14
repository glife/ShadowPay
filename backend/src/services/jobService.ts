import { JobStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { fail } from "@/lib/errors";
import { broadcast } from "@/services/sseManager";

const TRANSITIONS: Record<JobStatus, JobStatus[]> = {
  open: ["bidding"],
  bidding: ["in_progress"],
  in_progress: ["delivered"],
  delivered: ["completed", "disputed"],
  completed: [],
  disputed: [],
};

export const createJob = async (
  posterId: string,
  input: {
    title: string;
    description?: string | null;
    budgetMin?: string | number | null;
    budgetMax?: string | number | null;
    parentJobId?: string | null;
    blueprintId?: string | null;
    blueprintRef?: string | null;
    blueprintHash?: string | null;
  },
) => {
  if (!input.title?.trim()) throw fail("title is required", 400);

  const job = await db.job.create({
    data: {
      posterId,
      title: input.title,
      description: input.description ?? null,
      budgetMin: input.budgetMin == null ? null : String(input.budgetMin),
      budgetMax: input.budgetMax == null ? null : String(input.budgetMax),
      parentJobId: input.parentJobId ?? null,
      ...(input.blueprintId || input.blueprintRef || input.blueprintHash
        ? ({
            blueprintId: input.blueprintId ?? null,
            blueprintRef: input.blueprintRef ?? null,
            blueprintHash: input.blueprintHash ?? null,
            blueprintAttachedAt: new Date(),
          } as Record<string, unknown>)
        : {}),
    },
  });

  broadcast("job.created", { jobId: job.id, posterId });
  return job;
};

export const listJobs = async (filters: {
  status?: JobStatus | null;
  posterId?: string | null;
  hiredAgentId?: string | null;
  blueprintId?: string | null;
}) => {
  return db.job.findMany({
    where: {
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.posterId ? { posterId: filters.posterId } : {}),
      ...(filters.hiredAgentId ? { hiredAgentId: filters.hiredAgentId } : {}),
      ...(filters.blueprintId ? { blueprintId: filters.blueprintId } : {}),
    },
    orderBy: { createdAt: "desc" },
  });
};

export const getJob = async (jobId: string) => {
  const job = await db.job.findUnique({ where: { id: jobId } });
  if (!job) throw fail("Job not found", 404);
  return job;
};

export const transitionStatus = async (jobId: string, newStatus: JobStatus) => {
  const job = await getJob(jobId);
  const allowed = TRANSITIONS[job.status] || [];
  if (!allowed.includes(newStatus)) {
    throw fail(`Cannot transition from ${job.status} to ${newStatus}`, 400);
  }

  const updated = await db.job.update({
    where: { id: jobId },
    data: { status: newStatus },
  });

  broadcast("job.status_changed", { jobId, from: job.status, to: newStatus });
  return updated;
};

export const deliverJob = async (
  jobId: string,
  agentId: string,
  deliverable: string,
) => {
  const job = await getJob(jobId);
  if (job.hiredAgentId !== agentId) throw fail("Not your job", 403);
  if (job.status !== "in_progress") throw fail("Job is not in progress", 400);

  await db.job.update({ where: { id: jobId }, data: { deliverable } });
  const updated = await transitionStatus(jobId, "delivered");

  broadcast("job.delivered", { jobId, agentId });
  return updated;
};

export const completeJob = async (jobId: string, posterId: string) => {
  const job = await getJob(jobId);
  if (job.posterId !== posterId) throw fail("Not your job", 403);
  if (job.status !== "delivered") throw fail("Job is not delivered", 400);

  const updated = await transitionStatus(jobId, "completed");
  broadcast("job.completed", {
    jobId,
    posterId,
    hiredAgentId: job.hiredAgentId,
  });
  return updated;
};

export const disputeJob = async (jobId: string, posterId: string) => {
  const job = await getJob(jobId);
  if (job.posterId !== posterId) throw fail("Not your job", 403);
  if (job.status !== "delivered")
    throw fail("Only delivered jobs can be disputed", 400);

  const updated = await transitionStatus(jobId, "disputed");
  broadcast("job.disputed", {
    jobId,
    posterId,
    hiredAgentId: job.hiredAgentId,
  });
  return updated;
};

export const attachBlueprintToJob = async (
  jobId: string,
  posterId: string,
  input: {
    blueprintId: string;
    blueprintRef: string;
    blueprintHash: string;
  },
) => {
  if (!input.blueprintId?.trim()) throw fail("blueprintId is required", 400);
  if (!input.blueprintRef?.trim()) throw fail("blueprintRef is required", 400);
  if (!input.blueprintHash?.trim())
    throw fail("blueprintHash is required", 400);

  const job = await getJob(jobId);
  if (job.posterId !== posterId) throw fail("Not your job", 403);

  const updated = await db.job.update({
    where: { id: jobId },
    data: {
      ...({
        blueprintId: input.blueprintId,
        blueprintRef: input.blueprintRef,
        blueprintHash: input.blueprintHash,
        blueprintAttachedAt: new Date(),
      } as Record<string, unknown>),
    },
  });

  broadcast("job.blueprint.attached", {
    jobId,
    posterId,
    blueprintId: input.blueprintId,
    blueprintRef: input.blueprintRef,
    blueprintHash: input.blueprintHash,
  });

  return updated;
};
