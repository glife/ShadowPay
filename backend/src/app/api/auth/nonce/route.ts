import { NextRequest } from "next/server";
import { issueNonce } from "@/lib/auth";
import { fail } from "@/lib/errors";
import { withErrorHandling, json } from "@/lib/http";

export async function POST(req: NextRequest) {
  return withErrorHandling(async () => {
    const body = await req.json();
    const walletAddress = String(body.walletAddress || "").toLowerCase();
    if (!walletAddress) throw fail("walletAddress is required", 400);

    const nonce = issueNonce(walletAddress);
    return json({ nonce });
  });
}
