import { randomUUID } from "crypto";
import { addClient, removeClient } from "@/services/sseManager";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const encoder = new TextEncoder();
  const clientId = randomUUID();

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (payload: string) => controller.enqueue(encoder.encode(payload));
      const close = () => {
        try {
          controller.close();
        } catch {
          // stream already closed
        }
      };

      addClient({ id: clientId, send, close });
      send(`data: ${JSON.stringify({ type: "connected", clientId })}\n\n`);

      const keepAlive = setInterval(() => {
        send(`: keep-alive\n\n`);
      }, 15000);

      req.signal.addEventListener("abort", () => {
        clearInterval(keepAlive);
        removeClient(clientId);
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
