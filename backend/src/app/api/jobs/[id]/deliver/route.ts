import { NextRequest } from "next/server";
import { deliverJob, getJob } from "@/services/jobService";
import { uploadDeliverable } from "@/services/fileverseService";
import { requireAuth } from "@/lib/routeAuth";
import { fail } from "@/lib/errors";
import { withErrorHandling, json } from "@/lib/http";

export const runtime = "nodejs";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return withErrorHandling(async () => {
    const auth = await requireAuth(req);
    const { id } = await params;

    const form = await req.formData();
    const file = form.get("file");

    if (!(file instanceof File)) {
      throw fail("file is required (multipart/form-data)", 400);
    }

    const arrayBuffer = await file.arrayBuffer();
    const bytes = Buffer.from(arrayBuffer);

    const deliverable = await uploadDeliverable({
      jobId: id,
      uploaderId: auth.id,
      bytes,
      filename: file.name || "deliverable.bin",
      mimeType: file.type || "application/octet-stream",
      idempotencyKey: req.headers.get("idempotency-key"),
    });

    const current = await getJob(id);
    const job =
      current.status === "in_progress"
        ? await deliverJob(id, auth.id, deliverable.storageRef)
        : current;

    return json({ job, deliverable });
  });
}
