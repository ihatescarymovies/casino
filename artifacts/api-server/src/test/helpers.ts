import http from "node:http";
import type { Express } from "express";

/**
 * Supertest-style request helper using node:http directly.
 * No external dependencies needed.
 */
export function request(app: Express) {
  return {
    get(path: string): Promise<{
      status: number;
      body: unknown;
      headers: Record<string, string | string[] | undefined>;
    }> {
      return new Promise((resolve, reject) => {
        const server = app.listen(0, () => {
          const addr = server.address();
          if (!addr || typeof addr === "string") {
            server.close();
            reject(new Error("Failed to get server address"));
            return;
          }
          const port = addr.port;
          const req = http.request(
            `http://127.0.0.1:${port}${path}`,
            { method: "GET" },
            (res) => {
              let data = "";
              res.on("data", (chunk: string) => {
                data += chunk;
              });
              res.on("end", () => {
                server.close();
                let body: unknown;
                try {
                  body = JSON.parse(data);
                } catch {
                  body = data;
                }
                resolve({
                  status: res.statusCode ?? 0,
                  body,
                  headers: res.headers,
                });
              });
            },
          );
          req.on("error", (err) => {
            server.close();
            reject(err);
          });
          req.end();
        });
      });
    },
    post(
      path: string,
      body?: unknown,
    ): Promise<{
      status: number;
      body: unknown;
      headers: Record<string, string | string[] | undefined>;
    }> {
      return new Promise((resolve, reject) => {
        const server = app.listen(0, () => {
          const addr = server.address();
          if (!addr || typeof addr === "string") {
            server.close();
            reject(new Error("Failed to get server address"));
            return;
          }
          const port = addr.port;
          const json = body != null ? JSON.stringify(body) : undefined;
          const req = http.request(
            `http://127.0.0.1:${port}${path}`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                ...(json != null
                  ? { "Content-Length": Buffer.byteLength(json).toString() }
                  : {}),
              },
            },
            (res) => {
              let data = "";
              res.on("data", (chunk: string) => {
                data += chunk;
              });
              res.on("end", () => {
                server.close();
                let parsed: unknown;
                try {
                  parsed = JSON.parse(data);
                } catch {
                  parsed = data;
                }
                resolve({
                  status: res.statusCode ?? 0,
                  body: parsed,
                  headers: res.headers,
                });
              });
            },
          );
          req.on("error", (err) => {
            server.close();
            reject(err);
          });
          if (json != null) req.write(json);
          req.end();
        });
      });
    },
  };
}
