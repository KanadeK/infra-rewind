import { createServer, type Server } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";

const contentTypes: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
};

export interface StaticSite {
  server: Server;
  url: string;
}

export async function listenStaticSite(directory: string): Promise<StaticSite> {
  const root = path.resolve(directory);
  const server = createServer(async (request, response) => {
    try {
      const requestUrl = new URL(request.url ?? "/", "http://127.0.0.1");
      const relativePath =
        requestUrl.pathname === "/"
          ? "index.html"
          : decodeURIComponent(requestUrl.pathname.slice(1));
      const candidate = path.resolve(root, relativePath);
      if (candidate !== root && !candidate.startsWith(`${root}${path.sep}`)) {
        response.writeHead(403).end("Forbidden");
        return;
      }

      const body = await readFile(candidate);
      response.writeHead(200, {
        "Content-Type": contentTypes[path.extname(candidate)] ?? "application/octet-stream",
        "Cache-Control": "no-store",
      });
      response.end(body);
    } catch (error) {
      const status =
        error && typeof error === "object" && "code" in error && error.code === "ENOENT"
          ? 404
          : 500;
      response.writeHead(status).end(status === 404 ? "Not found" : "Internal server error");
    }
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    server.close();
    throw new Error("Static site server did not expose a TCP address.");
  }
  return { server, url: `http://127.0.0.1:${address.port}` };
}

export async function closeStaticSite(site: StaticSite): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    site.server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}
