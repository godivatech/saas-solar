import express, { type Express } from "express";
import fs from "fs";
import path from "path";
import { createServer as createViteServer, createLogger } from "vite";
import { type Server } from "http";
import viteConfig from "../vite.config";
import { nanoid } from "nanoid";

const viteLogger = createLogger();

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

export async function setupVite(app: Express, server: Server) {
  const serverOptions = {
    middlewareMode: true,
    hmr: { server },
    allowedHosts: true as true,
  };

  const vite = await createViteServer({
    ...viteConfig,
    configFile: false,
    customLogger: {
      ...viteLogger,
      error: (msg, options) => {
        viteLogger.error(msg, options);
        process.exit(1);
      },
    },
    server: serverOptions,
    appType: "custom",
  });

  app.use(vite.middlewares);
  app.use("*", async (req, res, next) => {
    const url = req.originalUrl;

    try {
      const clientTemplate = path.resolve(
        import.meta.dirname,
        "..",
        "client",
        "index.html",
      );

      // always reload the index.html file from disk incase it changes
      let template = await fs.promises.readFile(clientTemplate, "utf-8");
      template = template.replace(
        `src="/src/main.tsx"`,
        `src="/src/main.tsx?v=${nanoid()}"`,
      );
      const page = await vite.transformIndexHtml(url, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(page);
    } catch (e) {
      vite.ssrFixStacktrace(e as Error);
      next(e);
    }
  });
}

import { fileURLToPath } from "url";
import { dirname } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export function serveStatic(app: Express) {
  // Use robust path resolution for bundled ESM
  const distPath = path.resolve(__dirname, "public");

  log(`[DEBUG] serveStatic called`);
  log(`[DEBUG] __dirname: ${__dirname}`);
  log(`[DEBUG] distPath: ${distPath}`);

  if (!fs.existsSync(distPath)) {
    log(`[ERROR] Build directory NOT found at: ${distPath}`);
    // List contents of __dirname to help debugging
    try {
      const dirContents = fs.readdirSync(__dirname);
      log(`[DEBUG] Contents of ${__dirname}: ${JSON.stringify(dirContents)}`);
    } catch (e: any) {
      log(`[DEBUG] Could not read directory: ${e.message}`);
    }

    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`,
    );
  }

  log(`[DEBUG] Build directory exists. Contents: ${JSON.stringify(fs.readdirSync(distPath))}`);

  app.use(express.static(distPath));

  // fall through to index.html if the file doesn't exist
  app.use("*", (_req, res) => {
    const indexPath = path.resolve(distPath, "index.html");
    log(`[DEBUG] Serving fallback: ${indexPath}`);
    if (fs.existsSync(indexPath)) {
      res.sendFile(indexPath);
    } else {
      log(`[ERROR] index.html not found at ${indexPath}`);
      res.status(404).send("Application build files missing");
    }
  });
}
