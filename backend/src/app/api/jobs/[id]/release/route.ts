import { NextRequest } from "next/server";
import { getJob } from "@/services/jobService";
import { release } from "@/services/paymentService";
import { requireAuth } from "@/lib/routeAuth";
import { fail } from "@/lib/errors";
import { withErrorHandling, json } from "@/lib/http";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return withErrorHandling(async () => {
    const auth = await requireAuth(req);
    const { id } = await params;
    const job = await getJob(id);
    if (job.posterId !== auth.id) throw fail("Not your job", 403);

    const tx = await release(id);
    return json(tx);
  });
}
