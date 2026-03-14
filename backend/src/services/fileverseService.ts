import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { fail } from "@/lib/errors";
import { uploadBuffer } from "@/lib/fileverse";
import { broadcast } from "@/services/sseManager";

const maxBytes = Number(process.env.MAX_DELIVERABLE_BYTES || 10 * 1024 * 1024);
const allowedMime = new Set(
  String(
    process.env.ALLOWED_DELIVERABLE_MIME ||
      "text/plain,text/markdown,application/pdf,application/json",
  )
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
);

const sanitizeFilename = (name: string) =>
  name.replace(/[\\/:*?"<>|\x00-\x1F]/g, "_").slice(0, 255);

const maxIdempotencyKeyLength = Number(
  process.env.MAX_IDEMPOTENCY_KEY_LENGTH || 128,
);

const requireJobParticipant = async (jobId: string, requesterId: string) => {
  const job = await db.job.findUnique({ where: { id: jobId } });
  if (!job) throw fail("Job not found", 404);

  const allowed = [job.posterId, job.hiredAgentId].filter(Boolean);
  if (!allowed.includes(requesterId)) throw fail("Forbidden", 403);

  return job;
};

const isUniqueViolation = (err: unknown) =>
  err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";

export const uploadDeliverable = async (input: {
  jobId: string;
  uploaderId: string;
  bytes: Buffer;
  filename: string;
  mimeType: string;
  idempotencyKey?: string | null;
}) => {
  const job = await db.job.findUnique({ where: { id: input.jobId } });
  if (!job) throw fail("Job not found", 404);
  if (job.hiredAgentId !== input.uploaderId) {
    throw fail("Only hired agent can upload deliverables", 403);
  }
  if (!["in_progress", "delivered"].includes(job.status)) {
    throw fail("Job is not in a deliverable state", 400);
  }

  if (!input.bytes.length) throw fail("File is empty", 400);
  if (input.bytes.length > maxBytes)
    throw fail("File exceeds maximum size", 413);
  if (!allowedMime.has(input.mimeType))
    throw fail("Unsupported file type", 415);

  const filename = sanitizeFilename(input.filename || "deliverable.bin");
  const cleanIdempotencyKey = input.idempotencyKey?.trim() || null;

  if (
    cleanIdempotencyKey &&
    cleanIdempotencyKey.length > maxIdempotencyKeyLength
  ) {
    throw fail(
      `Idempotency key exceeds max length (${maxIdempotencyKeyLength})`,
      400,
    );
  }

  if (cleanIdempotencyKey) {
    const existingByIdempotency = await db.jobDeliverable.findFirst({
      where: {
        jobId: input.jobId,
        idempotencyKey: cleanIdempotencyKey,
      },
    });
    if (existingByIdempotency) return existingByIdempotency;
  }

  const uploaded = await uploadBuffer({
    file: input.bytes,
    filename,
    mimeType: input.mimeType,
  });

  const existingByHash = await db.jobDeliverable.findFirst({
    where: {
      jobId: input.jobId,
      contentHash: uploaded.contentHash,
    },
  });
  if (existingByHash) return existingByHash;

  const version =
    (await db.jobDeliverable.count({ where: { jobId: input.jobId } })) + 1;

  try {
    const row = await db.jobDeliverable.create({
      data: {
        jobId: input.jobId,
        uploaderId: input.uploaderId,
        fileverseDocId: uploaded.docId,
        contentHash: uploaded.contentHash,
        storageRef: uploaded.storageRef,
        mimeType: uploaded.mimeType,
        filename: uploaded.filename,
        byteSize: uploaded.byteSize,
        version,
        idempotencyKey: cleanIdempotencyKey,
        isFinal: false,
      },
    });

    broadcast("deliverable.uploaded", {
      jobId: input.jobId,
      deliverableId: row.id,
      version: row.version,
      uploaderId: input.uploaderId,
    });

    return row;
  } catch (err) {
    if (isUniqueViolation(err)) {
      const retry = await db.jobDeliverable.findFirst({
        where: {
          jobId: input.jobId,
          OR: [
            { contentHash: uploaded.contentHash },
            ...(cleanIdempotencyKey
              ? [{ idempotencyKey: cleanIdempotencyKey }]
              : []),
          ],
        },
        orderBy: { createdAt: "desc" },
      });

      if (retry) return retry;
    }

    throw err;
  }
};

export const listDeliverables = async (jobId: string, requesterId: string) => {
  await requireJobParticipant(jobId, requesterId);

  return db.jobDeliverable.findMany({
    where: { jobId },
    orderBy: { version: "asc" },
  });
};

export const finalizeDeliverable = async (
  jobId: string,
  deliverableId: string,
  requesterId: string,
) => {
  const job = await db.job.findUnique({ where: { id: jobId } });
  if (!job) throw fail("Job not found", 404);
  if (job.posterId !== requesterId) {
    throw fail("Only poster can finalize deliverable", 403);
  }

  const deliverable = await db.jobDeliverable.findUnique({
    where: { id: deliverableId },
  });
  if (!deliverable || deliverable.jobId !== jobId) {
    throw fail("Deliverable not found", 404);
  }

  const result = await db.$transaction(async (tx) => {
    await tx.jobDeliverable.updateMany({
      where: { jobId },
      data: { isFinal: false },
    });

    const final = await tx.jobDeliverable.update({
      where: { id: deliverableId },
      data: { isFinal: true },
    });

    await tx.job.update({
      where: { id: jobId },
      data: { deliverable: final.storageRef },
    });

    return final;
  });

  broadcast("deliverable.finalized", {
    jobId,
    deliverableId: result.id,
    version: result.version,
    finalizedBy: requesterId,
  });

  return result;
};

export const buildDisputeEvidence = async (
  jobId: string,
  requesterId: string,
) => {
  await requireJobParticipant(jobId, requesterId);

  const [job, acceptedBid, offers, deliverables] = await Promise.all([
    db.job.findUnique({ where: { id: jobId } }),
    db.bid.findFirst({ where: { jobId, status: "accepted" } }),
    db.negotiationOffer.findMany({
      where: { jobId },
      orderBy: { createdAt: "asc" },
    }),
    db.jobDeliverable.findMany({
      where: { jobId },
      orderBy: { version: "asc" },
    }),
  ]);

  const evidence = {
    job,
    acceptedBid,
    offers,
    deliverables,
    generatedAt: new Date().toISOString(),
  };

  broadcast("dispute.evidence_ready", {
    jobId,
    requestedBy: requesterId,
    deliverableCount: deliverables.length,
  });

  return evidence;
};
