import { db } from "@/lib/db";
import { fail } from "@/lib/errors";
import { transitionStatus } from "@/services/jobService";
import { broadcast } from "@/services/sseManager";

export const listBidsForJob = async (jobId: string) => {
  return db.bid.findMany({
    where: { jobId },
    orderBy: { createdAt: "asc" },
  });
};

export const submitBid = async (
  jobId: string,
  agentId: string,
  amount: string | number,
  proposal?: string,
) => {
  const job = await db.job.findUnique({ where: { id: jobId } });
  if (!job) throw fail("Job not found", 404);
  if (!["open", "bidding"].includes(job.status)) {
    throw fail("Job is not open for bids", 400);
  }

  const existing = await db.bid.findFirst({
    where: { jobId, agentId },
  });
  if (existing) throw fail("Bid already exists for this job", 400);

  const bid = await db.bid.create({
    data: {
      jobId,
      agentId,
      amount: String(amount),
      proposal: proposal ?? null,
    },
  });

  if (job.status === "open") {
    await transitionStatus(jobId, "bidding");
  }

  broadcast("bid.submitted", { jobId, bidId: bid.id, agentId, amount: String(amount) });
  return bid;
};

export const acceptBid = async (jobId: string, bidId: string, posterId: string) => {
  const acceptedBid = await db.$transaction(async (tx) => {
    const job = await tx.job.findUnique({ where: { id: jobId } });
    if (!job) throw fail("Job not found", 404);
    if (job.posterId !== posterId) throw fail("Forbidden", 403);
    if (job.status !== "bidding") throw fail("Job is not in bidding state", 400);

    const bid = await tx.bid.findUnique({ where: { id: bidId } });
    if (!bid || bid.jobId !== jobId) throw fail("Bid not found", 404);

    const updatedAccepted = await tx.bid.update({
      where: { id: bidId },
      data: { status: "accepted" },
    });

    await tx.bid.updateMany({
      where: {
        jobId,
        id: { not: bidId },
      },
      data: { status: "rejected" },
    });

    await tx.job.update({
      where: { id: jobId },
      data: {
        hiredAgentId: updatedAccepted.agentId,
        status: "in_progress",
      },
    });

    return updatedAccepted;
  });

  broadcast("bid.accepted", {
    jobId,
    bidId,
    agentId: acceptedBid.agentId,
    amount: acceptedBid.amount.toString(),
  });

  return acceptedBid;
};
