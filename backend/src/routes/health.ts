import { FastifyInstance } from "fastify";

export async function healthRoutes(app: FastifyInstance) {
  app.get("/health", async (_request, reply) => {
    return reply.code(200).send({
      status: "ok",
      service: "killa-assistant-backend",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    });
  });
}
