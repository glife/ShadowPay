import { NextRequest } from "next/server";
import { BlueprintStatus } from "@prisma/client";
import { requireAuth } from "@/lib/routeAuth";
import { json, withErrorHandling } from "@/lib/http";
import {
  createBlueprint,
  listBlueprints,
} from "@/services/councilBlueprintService";

const isBlueprintStatus = (value: string | null): value is BlueprintStatus =>
  !!value && ["generated", "archived"].includes(value);

export async function GET(req: NextRequest) {
  return withErrorHandling(async () => {
    const auth = await requireAuth(req);
    const statusParam = req.nextUrl.searchParams.get("status");

    const rows = await listBlueprints({
      createdByAgentId: auth.id,
      status: isBlueprintStatus(statusParam) ? statusParam : null,
    });

    return json(rows);
  });
}

export async function POST(req: NextRequest) {
  return withErrorHandling(async () => {
    const auth = await requireAuth(req);
    const body = await req.json();

    const row = await createBlueprint({
      requestId: String(body.requestId || ""),
      createdByAgentId: auth.id,
      title: body.title,
      markdown: body.markdown,
      inputJson: body.inputJson,
      idempotencyKey: req.headers.get("idempotency-key") || body.idempotencyKey,
    });

    return json(row, 201);
  });
}
