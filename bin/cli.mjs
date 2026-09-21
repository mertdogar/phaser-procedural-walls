#!/usr/bin/env node
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { extname, resolve, sep } from "node:path";

const help = `Usage: phaser-procedural-walls editor [--port <number>]

Start Wallcraft on http://127.0.0.1 using an available port.
Use --port to choose a port. Press Ctrl+C to stop.
`;
const args = process.argv.slice(2);
if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
  console.log(help);
} else {
  try {
    if (args[0] !== "editor" || (args.length !== 1 && (args.length !== 3 || args[1] !== "--port"))) {
      throw new Error(`Unknown command or option.\n${help}`);
    }
    const port = args[2] === undefined ? 0 : Number(args[2]);
    if (!Number.isInteger(port) || port < 0 || port > 65535 || (args[2] !== undefined && !/^\d+$/.test(args[2]))) {
      throw new Error("Port must be an integer between 0 and 65535.");
    }
    const root = fileURLToPath(new URL("../dist/editor/", import.meta.url));
    await stat(resolve(root, "index.html")).catch(() => { throw new Error("Editor build is missing. From a source checkout, run pnpm build first."); });
    const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".png": "image/png", ".svg": "image/svg+xml", ".ico": "image/x-icon" };
    const server = createServer(async (request, response) => {
      if (request.method !== "GET" && request.method !== "HEAD") {
        response.writeHead(405, { Allow: "GET, HEAD" }).end();
        return;
      }
      try {
        const pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
        const file = resolve(root, `.${pathname === "/" ? "/index.html" : pathname}`);
        if (!file.startsWith(root.endsWith(sep) ? root : root + sep)) {
          response.writeHead(403).end("Forbidden");
          return;
        }
        const data = await readFile(file);
        response.writeHead(200, { "Content-Type": types[extname(file)] ?? "application/octet-stream", "X-Content-Type-Options": "nosniff" });
        response.end(request.method === "HEAD" ? undefined : data);
      } catch (error) {
        response.writeHead(error.code === "ENOENT" || error.code === "EISDIR" ? 404 : 400).end("Not found or invalid request");
      }
    });
    server.on("error", (error) => { console.error(`Wallcraft: ${error.message}`); process.exitCode = 1; });
    server.listen(port, "127.0.0.1", () => {
      console.log(`Wallcraft: http://127.0.0.1:${server.address().port}/\nPress Ctrl+C to stop. Export your map before closing the browser.`);
    });
  } catch (error) {
    console.error(`Wallcraft: ${error.message}`);
    process.exitCode = 1;
  }
}
