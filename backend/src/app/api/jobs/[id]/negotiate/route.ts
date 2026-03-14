import { NextRequest } from "next/server";
import { accept, counter, makeOffer } from "@/services/negotiationService";
import { requireAuth } from "@/lib/routeAuth";
import { fail } from "@/lib/errors";
import { withErrorHandling, json } from "@/lib/http";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return withErrorHandling(async () => {
    const auth = await requireAuth(req);
    const body = await req.json();
    const action = String(body.action || "");
    const { id } = await params;

    if (action === "offer") {
      const result = await makeOffer(id, auth.id, body.receiverId, body.amount);
      return json(result, 201);
    }

    if (action === "counter") {
      const result = await counter(id, auth.id, body.amount);
      return json(result, 201);
    }

    if (action === "accept") {
      const result = await accept(id, auth.id);
      return json(result, 201);
    }

    throw fail("Invalid action. Use offer, counter, or accept.", 400);
  });
}
