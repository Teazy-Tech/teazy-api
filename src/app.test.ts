import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "./app.js";

describe("GET /healthz", () => {
  it("reports the process is up", async () => {
    const res = await request(createApp()).get("/healthz");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok" });
  });
});

describe("GET /readyz", () => {
  it("reports ready when the readiness check passes", async () => {
    const app = createApp({ readiness: async () => true });
    const res = await request(app).get("/readyz");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ready" });
  });

  it("returns 503 when the readiness check fails", async () => {
    const app = createApp({ readiness: async () => false });
    const res = await request(app).get("/readyz");

    expect(res.status).toBe(503);
    expect(res.body).toEqual({ status: "unavailable" });
  });

  it("returns 503 when the readiness check throws", async () => {
    const app = createApp({
      readiness: async () => {
        throw new Error("database is down");
      },
    });
    const res = await request(app).get("/readyz");

    expect(res.status).toBe(503);
    expect(res.body).toEqual({ status: "unavailable" });
  });

  it("returns 503 when no readiness check is configured", async () => {
    const res = await request(createApp()).get("/readyz");

    expect(res.status).toBe(503);
    expect(res.body).toEqual({ status: "unavailable" });
  });
});
