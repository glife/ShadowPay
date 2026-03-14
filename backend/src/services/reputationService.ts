import { db } from "@/lib/db";

export const recordEvent = async (
  agentId: string,
  jobId: string,
  delta: string | number,
  reason: string,
  txHash?: string,
) => {
  await db.reputationEvent.create({
    data: {
      agentId,
      jobId,
      scoreDelta: String(delta),
      reason,
      txHash: txHash ?? null,
    },
  });

  const aggregate = await db.reputationEvent.aggregate({
    where: { agentId },
    _sum: { scoreDelta: true },
  });

  await db.agent.update({
    where: { id: agentId },
    data: {
      reputationScore: aggregate._sum.scoreDelta ?? 0,
    },
  });
};
