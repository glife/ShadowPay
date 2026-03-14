import { NextRequest } from "next/server";
import { requireAuth } from "@/lib/routeAuth";
import { json, withErrorHandling } from "@/lib/http";
import { listBlueprintAccess } from "@/services/blueprintAccessService";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return withErrorHandling(async () => {
    const auth = await requireAuth(req);
    const { id } = await params;

    const includeRevoked =
      req.nextUrl.searchParams.get("includeRevoked") === "true";

    const grants = await listBlueprintAccess({
      blueprintId: id,
      ownerId: auth.id,
      includeRevoked,
    });

    return json(grants);
  });
}
