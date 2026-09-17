export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({
    status: "ok",
    service: "killa-assistant",
    timestamp: new Date().toISOString(),
  });
}
