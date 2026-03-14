import { NextRequest } from "next/server";
import { requireAuth } from "@/lib/routeAuth";
import { json, withErrorHandling } from "@/lib/http";
import { revokeBlueprintAccess } from "@/services/blueprintAccessService";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return withErrorHandling(async () => {
    const auth = await requireAuth(req);
    const { id } = await params;
    const body = await req.json();

    const row = await revokeBlueprintAccess({
      blueprintId: id,
      ownerId: auth.id,
      targetAgentId: String(body.targetAgentId || ""),
    });

    return json(row);
  });
}
