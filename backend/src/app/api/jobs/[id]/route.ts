import { NextRequest } from "next/server";
import { getJob } from "@/services/jobService";
import { withErrorHandling, json } from "@/lib/http";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return withErrorHandling(async () => {
    const { id } = await params;
    const job = await getJob(id);
    return json(job);
  });
}
