import { db } from "@/lib/db";
import { fail } from "@/lib/errors";

export type ListAgentsInput = {
  capability?: string | null;
  minRep?: number | null;
  maxPrice?: number | null;
};

export const registerAgent = async (input: {
  walletAddress: string;
  ensName?: string | null;
  name?: string | null;
  capabilities?: string[];
  minPrice?: string | number | null;
  maxPrice?: string | number | null;
}) => {
  const walletAddress = input.walletAddress?.toLowerCase();
  if (!walletAddress) throw fail("walletAddress is required", 400);

  return db.agent.upsert({
    where: { walletAddress },
    update: {
      ensName: input.ensName ?? undefined,
      name: input.name ?? undefined,
      capabilities: input.capabilities ?? undefined,
      minPrice: input.minPrice == null ? undefined : String(input.minPrice),
      maxPrice: input.maxPrice == null ? undefined : String(input.maxPrice),
    },
    create: {
      walletAddress,
      ensName: input.ensName ?? null,
      name: input.name ?? null,
      capabilities: input.capabilities ?? [],
      minPrice: input.minPrice == null ? null : String(input.minPrice),
      maxPrice: input.maxPrice == null ? null : String(input.maxPrice),
    },
  });
};

export const getAgentById = async (id: string) => {
  const agent = await db.agent.findUnique({ where: { id } });
  if (!agent) throw fail("Agent not found", 404);
  return agent;
};

export const listAgents = async ({ capability, minRep, maxPrice }: ListAgentsInput) => {
  return db.agent.findMany({
    where: {
      isActive: true,
      ...(capability ? { capabilities: { hasSome: [capability] } } : {}),
      ...(typeof minRep === "number" ? { reputationScore: { gte: minRep } } : {}),
      ...(typeof maxPrice === "number" ? { minPrice: { lte: maxPrice } } : {}),
    },
    orderBy: { reputationScore: "desc" },
  });
};
