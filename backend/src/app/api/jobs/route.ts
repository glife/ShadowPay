import { NextRequest } from "next/server";
import { JobStatus } from "@prisma/client";
import { createJob, listJobs } from "@/services/jobService";
import { getBlueprintAttachReference } from "@/services/councilBlueprintService";
import { requireAuth } from "@/lib/routeAuth";
import { withErrorHandling, json } from "@/lib/http";

const isValidStatus = (value: string | null): value is JobStatus =>
  !!value &&
  [
    "open",
    "bidding",
    "in_progress",
    "delivered",
    "completed",
    "disputed",
  ].includes(value);

export async function GET(req: NextRequest) {
  return withErrorHandling(async () => {
    const statusParam = req.nextUrl.searchParams.get("status");
    const posterId = req.nextUrl.searchParams.get("posterId");
    const hiredAgentId = req.nextUrl.searchParams.get("hiredAgentId");
    const blueprintId = req.nextUrl.searchParams.get("blueprintId");

    const jobs = await listJobs({
      status: isValidStatus(statusParam) ? statusParam : null,
      posterId,
      hiredAgentId,
      blueprintId,
    });

    return json(jobs);
  });
}

export async function POST(req: NextRequest) {
  return withErrorHandling(async () => {
    const auth = await requireAuth(req);
    const body = await req.json();

    const blueprintId =
      typeof body.blueprintId === "string" ? body.blueprintId : null;

    const blueprintRefData = blueprintId
      ? await getBlueprintAttachReference(blueprintId, auth.id)
      : null;

    const job = await createJob(auth.id, {
      title: body.title,
      description: body.description,
      budgetMin: body.budgetMin,
      budgetMax: body.budgetMax,
      parentJobId: body.parentJobId,
      blueprintId: blueprintRefData?.blueprintId ?? null,
      blueprintRef: blueprintRefData?.blueprintRef ?? null,
      blueprintHash: blueprintRefData?.blueprintHash ?? null,
    });

    return json(job, 201);
  });
}
