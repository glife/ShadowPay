import { NextRequest } from "next/server";
import { listDeliverables } from "@/services/fileverseService";
import { requireAuth } from "@/lib/routeAuth";
import { withErrorHandling, json } from "@/lib/http";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return withErrorHandling(async () => {
    const auth = await requireAuth(req);
    const { id } = await params;
    const rows = await listDeliverables(id, auth.id);
    return json(rows);
  });
}
