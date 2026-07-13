import { describe, it, expect } from "vitest";
import Fastify from "fastify";
import { healthRoutes } from "../src/routes/health.js";

describe("Health endpoint", () => {
  it("should return status ok", async () => {
    const app = Fastify();
    await app.register(healthRoutes, { prefix: "/" });

    const response = await app.inject({
      method: "GET",
      url: "/health",
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.status).toBe("ok");
    expect(body.service).toBe("killa-assistant-backend");
    expect(body.timestamp).toBeDefined();
    expect(body.uptime).toBeDefined();

    await app.close();
  });
});
