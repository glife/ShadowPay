import { db } from "@/lib/db";
import { fail } from "@/lib/errors";

export const recordLock = async (
  jobId: string,
  fromAgentId: string,
  amount: string | number,
  txHash?: string,
) => {
  return db.transaction.create({
    data: {
      jobId,
      fromAgentId,
      amount: String(amount),
      type: "escrow_lock",
      txHash: txHash ?? null,
    },
  });
};

export const release = async (jobId: string, txHash?: string) => {
  const job = await db.job.findUnique({ where: { id: jobId } });
  if (!job) throw fail("Job not found", 404);
  if (!job.hiredAgentId) throw fail("No hired agent for this job", 400);

  const acceptedBid = await db.bid.findFirst({
    where: { jobId, status: "accepted" },
  });
  if (!acceptedBid) throw fail("No accepted bid found", 400);

  return db.transaction.create({
    data: {
      jobId,
      toAgentId: job.hiredAgentId,
      amount: acceptedBid.amount,
      type: "escrow_release",
      txHash: txHash ?? null,
    },
  });
};
