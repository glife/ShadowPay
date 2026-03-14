import { NextRequest } from "next/server";
import { finalizeDeliverable } from "@/services/fileverseService";
import { requireAuth } from "@/lib/routeAuth";
import { withErrorHandling, json } from "@/lib/http";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; deliverableId: string }> },
) {
  return withErrorHandling(async () => {
    const auth = await requireAuth(req);
    const { id, deliverableId } = await params;

    const row = await finalizeDeliverable(id, deliverableId, auth.id);
    return json(row);
  });
}
