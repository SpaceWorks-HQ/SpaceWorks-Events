import { NextResponse } from "next/server";
import { withApiMonitoring } from "@/lib/apiMonitor";
import { handleMachineApiRequest } from "@/lib/api/v1/handler";
import { apiError } from "@/lib/api/v1/errors";
import { decodeCursor } from "@/lib/api/v1/pagination";
import { apiResourceIdSchema, collectionQuerySchema } from "@/lib/api/v1/schemas";
import { listApiOrders } from "@/lib/api/v1/events";

type Context = { params: Promise<{ eventId: string }> };

export const GET = withApiMonitoring(
  "GET /api/v1/events/:eventId/orders",
  async (request: Request, routeContext: Context) =>
    handleMachineApiRequest(request, "orders:read", async (context) => {
      const params = await routeContext.params;
      const eventId = apiResourceIdSchema.safeParse(params.eventId);
      if (!eventId.success) return apiError("INVALID_REQUEST", 400);
      const query = collectionQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams.entries()));
      if (!query.success) return apiError("INVALID_REQUEST", 400);
      const cursor = decodeCursor(query.data.cursor);
      if (query.data.cursor && !cursor) return apiError("INVALID_REQUEST", 400);
      const response = await listApiOrders(context.organisationId, eventId.data, query.data.limit, cursor);
      if (!response) return apiError("RESOURCE_NOT_FOUND", 404);
      return NextResponse.json(response, { headers: { "Cache-Control": "no-store" } });
    }),
);
