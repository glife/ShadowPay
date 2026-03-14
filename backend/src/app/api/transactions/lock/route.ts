import { NextRequest } from "next/server";
import { recordLock } from "@/services/paymentService";
import { requireAuth } from "@/lib/routeAuth";
import { withErrorHandling, json } from "@/lib/http";

export async function POST(req: NextRequest) {
  return withErrorHandling(async () => {
    const auth = await requireAuth(req);
    const body = await req.json();

    const tx = await recordLock(
      body.jobId,
      auth.id,
      body.amount,
      body.txHash,
    );

    return json(tx, 201);
  });
}
