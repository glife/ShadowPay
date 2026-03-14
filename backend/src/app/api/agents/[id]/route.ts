import { NextRequest } from "next/server";
import { getAgentById } from "@/services/agentService";
import { withErrorHandling, json } from "@/lib/http";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return withErrorHandling(async () => {
    const { id } = await params;
    const agent = await getAgentById(id);
    return json(agent);
  });
}
