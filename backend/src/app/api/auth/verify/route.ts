import { NextRequest } from "next/server";
import { consumeNonce, signToken, verifySiwe } from "@/lib/auth";
import { fail } from "@/lib/errors";
import { withErrorHandling, json } from "@/lib/http";
import { db } from "@/lib/db";

export async function POST(req: NextRequest) {
  return withErrorHandling(async () => {
    const body = await req.json();
    const message = String(body.message || "");
    const signature = String(body.signature || "");
    const nonce = String(body.nonce || "");

    if (!message || !signature || !nonce) {
      throw fail("message, signature, nonce are required", 400);
    }

    const address = await verifySiwe(message, signature, nonce);
    const nonceOk = consumeNonce(address, nonce);
    if (!nonceOk) throw fail("Invalid or expired nonce", 401);

    const agent = await db.agent.upsert({
      where: { walletAddress: address },
      update: {},
      create: {
        walletAddress: address,
        capabilities: [],
      },
    });

    const token = await signToken({ sub: agent.id, walletAddress: agent.walletAddress });

    return json({ token, agent });
  });
}
