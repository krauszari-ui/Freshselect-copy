import express, { type Express } from "express";
import fs from "fs";
import { type Server } from "http";
import path from "path";
import { fileURLToPath } from "url";

// Safe __dirname that works in both ESM (import.meta.url is defined) and CJS bundles
// compiled by esbuild --format=cjs (where import.meta.url becomes undefined).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const _importMeta = (typeof import.meta !== "undefined" ? import.meta : {}) as any;
const __filename2 = _importMeta.url ? fileURLToPath(_importMeta.url) : "";
const __dirname2 = __filename2 ? path.dirname(__filename2) : process.cwd();

export async function setupVite(app: Express, server: Server) {
  // Dynamic imports for dev-only dependencies (vite is a devDependency)
  const { nanoid } = await import("nanoid");
  const { createServer: createViteServer } = await import("vite");
  const viteConfig = (await import("../../vite.config")).default;

  const serverOptions = {
    middlewareMode: true,
    hmr: { server },
    allowedHosts: true as const,
  };

  const vite = await createViteServer({
    ...viteConfig,
    configFile: false,
    server: serverOptions,
    appType: "custom",
  });

  app.use(vite.middlewares);
  app.use("*", async (req, res, next) => {
    const url = req.originalUrl;

    try {
      const clientTemplate = path.resolve(
        __dirname2,
        "../..",
        "client",
        "index.html"
      );

      // always reload the index.html file from disk incase it changes
      let template = await fs.promises.readFile(clientTemplate, "utf-8");
      template = template.replace(
        `src="/src/main.tsx"`,
        `src="/src/main.tsx?v=${nanoid()}"`
      );
      const page = await vite.transformIndexHtml(url, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(page);
    } catch (e) {
      vite.ssrFixStacktrace(e as Error);
      next(e);
    }
  });
}

function findPublicDir(): string {
  // Check multiple possible locations for the built frontend assets:
  const candidates = [
    // Vercel: process.cwd() is the project root, public/ is at root
    path.resolve(process.cwd(), "public"),
    // Local production (dist/index.js): public at dist/public (sibling)
    path.resolve(__dirname2, "public"),
    // Fallback: one level up from dist/ then into dist/public
    path.resolve(__dirname2, "..", "dist", "public"),
    // Development: two levels up from server/_core/ then into dist/public
    path.resolve(__dirname2, "../..", "dist", "public"),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(path.resolve(candidate, "index.html"))) {
      return candidate;
    }
  }

  // Return first candidate as fallback (will log error)
  return candidates[0];
}

export function serveStatic(app: Express) {
  // On Vercel, static files are served by the CDN from .vercel/output/static/
  // and SPA routing is handled by config.json (/(.*) → /index.html).
  // The Express function only handles /api/* routes, so skip static serving entirely.
  if (process.env.VERCEL) {
    return;
  }

  const distPath = findPublicDir();

  if (!fs.existsSync(distPath)) {
    console.error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`
    );
  }

  app.use(express.static(distPath));

  // SPA catch-all: serve index.html for any unmatched route.
  app.use("*", (_req, res) => {
    const indexPath = path.resolve(distPath, "index.html");
    if (fs.existsSync(indexPath)) {
      res.sendFile(indexPath);
    } else {
      res.status(404).send("Not found - frontend build may be missing");
    }
  });
}
