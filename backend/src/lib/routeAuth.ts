import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { fail } from "@/lib/errors";
import { getBearerToken, verifyToken } from "@/lib/auth";

export const requireAuth = async (req: NextRequest) => {
  const token = getBearerToken(req.headers.get("authorization"));
  const payload = await verifyToken(token);

  const agent = await db.agent.findUnique({
    where: { id: payload.sub },
    select: { id: true, walletAddress: true, isActive: true },
  });

  if (!agent) throw fail("Agent not found", 404);
  if (!agent.isActive) throw fail("Agent is inactive", 403);

  return agent;
};

export const requireJobParticipant = async (jobId: string, requesterId: string) => {
  const job = await db.job.findUnique({
    where: { id: jobId },
    select: { id: true, posterId: true, hiredAgentId: true },
  });

  if (!job) throw fail("Job not found", 404);

  const participants = [job.posterId, job.hiredAgentId].filter(Boolean);
  if (!participants.includes(requesterId)) throw fail("Forbidden", 403);

  return job;
};
