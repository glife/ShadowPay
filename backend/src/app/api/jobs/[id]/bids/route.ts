import { NextRequest } from "next/server";
import { listBidsForJob, submitBid } from "@/services/bidService";
import { requireAuth } from "@/lib/routeAuth";
import { withErrorHandling, json } from "@/lib/http";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return withErrorHandling(async () => {
    const { id } = await params;
    const bids = await listBidsForJob(id);
    return json(bids);
  });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return withErrorHandling(async () => {
    const auth = await requireAuth(req);
    const body = await req.json();
    const { id } = await params;

    const bid = await submitBid(id, auth.id, body.amount, body.proposal);
    return json(bid, 201);
  });
}
