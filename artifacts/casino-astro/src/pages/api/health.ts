import type { APIRoute } from "astro";

export const GET: APIRoute = async () => {
  const uptimeSeconds = Math.floor(process.uptime());
  const memoryUsage = process.memoryUsage();

  return new Response(
    JSON.stringify({
      status: "ok",
      timestamp: new Date().toISOString(),
      uptime: uptimeSeconds,
      version: process.env.npm_package_version ?? "0.0.0",
      memory: {
        rss: `${Math.round(memoryUsage.rss / 1024 / 1024)}MB`,
        heapUsed: `${Math.round(memoryUsage.heapUsed / 1024 / 1024)}MB`,
        heapTotal: `${Math.round(memoryUsage.heapTotal / 1024 / 1024)}MB`,
      },
    }),
    {
      status: 200,
      headers: { "Content-Type": "application/json" },
    },
  );
};
