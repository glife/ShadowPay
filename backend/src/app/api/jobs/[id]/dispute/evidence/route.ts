import { NextRequest } from "next/server";
import { buildDisputeEvidence } from "@/services/fileverseService";
import { requireAuth } from "@/lib/routeAuth";
import { withErrorHandling, json } from "@/lib/http";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return withErrorHandling(async () => {
    const auth = await requireAuth(req);
    const { id } = await params;
    const evidence = await buildDisputeEvidence(id, auth.id);
    return json(evidence);
  });
}
