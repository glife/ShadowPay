import { NextRequest } from "next/server";
import { requireAuth } from "@/lib/routeAuth";
import { json, withErrorHandling } from "@/lib/http";
import { getBlueprintById } from "@/services/councilBlueprintService";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return withErrorHandling(async () => {
    const auth = await requireAuth(req);
    const { id } = await params;

    const row = await getBlueprintById(id, auth.id);
    return json(row);
  });
}
