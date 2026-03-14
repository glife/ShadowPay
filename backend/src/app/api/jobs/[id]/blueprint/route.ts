import { NextRequest } from "next/server";
import { requireAuth } from "@/lib/routeAuth";
import { json, withErrorHandling } from "@/lib/http";
import { getJobScopedBlueprintForExecution } from "@/services/blueprintAccessService";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return withErrorHandling(async () => {
    const auth = await requireAuth(req);
    const { id } = await params;

    const payload = await getJobScopedBlueprintForExecution({
      jobId: id,
      requesterId: auth.id,
    });

    return json(payload);
  });
}
