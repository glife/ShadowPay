import { NextRequest } from "next/server";
import { acceptBid } from "@/services/bidService";
import { requireAuth } from "@/lib/routeAuth";
import { withErrorHandling, json } from "@/lib/http";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; bidId: string }> },
) {
  return withErrorHandling(async () => {
    const auth = await requireAuth(req);
    const { id, bidId } = await params;
    const bid = await acceptBid(id, bidId, auth.id);
    return json(bid);
  });
}
