import { NextRequest } from "next/server";
import { completeJob, getJob } from "@/services/jobService";
import { release } from "@/services/paymentService";
import { recordEvent } from "@/services/reputationService";
import { requireAuth } from "@/lib/routeAuth";
import { withErrorHandling, json } from "@/lib/http";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return withErrorHandling(async () => {
    const auth = await requireAuth(req);
    const { id } = await params;

    const before = await getJob(id);
    const job = await completeJob(id, auth.id);
    const tx = await release(id);

    if (before.hiredAgentId) {
      await recordEvent(before.hiredAgentId, id, 1, "Completed job successfully", tx.txHash ?? undefined);
    }

    await recordEvent(auth.id, id, 0.2, "Closed job successfully", tx.txHash ?? undefined);

    return json({ job, payment: tx });
  });
}
