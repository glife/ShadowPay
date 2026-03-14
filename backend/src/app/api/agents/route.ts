import { NextRequest } from "next/server";
import { listAgents, registerAgent } from "@/services/agentService";
import { withErrorHandling, json } from "@/lib/http";

export async function GET(req: NextRequest) {
  return withErrorHandling(async () => {
    const capability = req.nextUrl.searchParams.get("capability");
    const minRepRaw = req.nextUrl.searchParams.get("minRep");
    const maxPriceRaw = req.nextUrl.searchParams.get("maxPrice");

    const minRep = minRepRaw != null ? Number(minRepRaw) : null;
    const maxPrice = maxPriceRaw != null ? Number(maxPriceRaw) : null;

    const agents = await listAgents({
      capability,
      minRep: Number.isFinite(minRep) ? minRep : null,
      maxPrice: Number.isFinite(maxPrice) ? maxPrice : null,
    });

    return json(agents);
  });
}

export async function POST(req: NextRequest) {
  return withErrorHandling(async () => {
    const body = await req.json();
    const agent = await registerAgent({
      walletAddress: body.walletAddress,
      ensName: body.ensName,
      name: body.name,
      capabilities: Array.isArray(body.capabilities) ? body.capabilities : [],
      minPrice: body.minPrice,
      maxPrice: body.maxPrice,
    });

    return json(agent, 201);
  });
}
