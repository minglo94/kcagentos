import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { officeFailure, officeUser } from "@/lib/office/http";
import { owned } from "@/lib/office/store";
export const dynamic = "force-dynamic";
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const userId = await officeUser(req);
    await owned(prisma, params.id, userId);
    const raw = req.headers.get("last-event-id") || req.nextUrl.searchParams.get("after") || "0";
    let cursor = /^\d{1,9}$/.test(raw) ? Number(raw) : 0;
    const encoder = new TextEncoder();
    let timer: ReturnType<typeof setTimeout>;
    let closed = false;
    const stream = new ReadableStream({
      start(controller) {
        const until = Date.now() + 25_000;
        const tick = async () => {
          if (closed) return;
          try {
            // Recheck active account during long-lived subscriptions.
            const active = await prisma.user.findFirst({ where: { id: userId, isActive: true }, select: { id: true } });
            if (!active || req.signal.aborted || Date.now() > until) { closed = true; controller.close(); return; }
            const events = await prisma.officeEvent.findMany({ where: { jobId: params.id, id: { gt: cursor } }, orderBy: { id: "asc" }, take: 100 });
            for (const event of events) { cursor = event.id; controller.enqueue(encoder.encode(`id: ${event.id}\ndata: ${JSON.stringify(event)}\n\n`)); }
            controller.enqueue(encoder.encode(": heartbeat\n\n"));
            timer = setTimeout(tick, 1000);
          } catch { closed = true; try { controller.close(); } catch { /* Client disconnected. */ } }
        };
        void tick();
      },
      cancel() { closed = true; clearTimeout(timer); },
    });
    return new Response(stream, { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no" } });
  } catch (error) { return officeFailure(error); }
}
