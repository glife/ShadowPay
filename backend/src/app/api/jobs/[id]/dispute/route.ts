import { NextRequest } from "next/server";
import { disputeJob } from "@/services/jobService";
import { requireAuth } from "@/lib/routeAuth";
import { withErrorHandling, json } from "@/lib/http";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return withErrorHandling(async () => {
    const auth = await requireAuth(req);
    const { id } = await params;
    const job = await disputeJob(id, auth.id);
    return json(job);
  });
}
