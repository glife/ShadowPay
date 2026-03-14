import { NextRequest } from "next/server";
import { requireAuth } from "@/lib/routeAuth";
import { json, withErrorHandling } from "@/lib/http";
import { getBlueprintAttachReference } from "@/services/councilBlueprintService";
import { attachBlueprintToJob } from "@/services/jobService";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return withErrorHandling(async () => {
    const auth = await requireAuth(req);
    const { id: jobId } = await params;
    const body = await req.json();

    const blueprintId = String(body.blueprintId || "").trim();
    const reference = await getBlueprintAttachReference(blueprintId, auth.id);

    const job = await attachBlueprintToJob(jobId, auth.id, {
      blueprintId: reference.blueprintId,
      blueprintRef: reference.blueprintRef,
      blueprintHash: reference.blueprintHash,
    });

    return json({
      job,
      blueprint: {
        id: reference.blueprintId,
        ref: reference.blueprintRef,
        hash: reference.blueprintHash,
        fileverseDocId: reference.fileverseDocId,
      },
    });
  });
}
