const http = require("http");
const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");
const { URL } = require("url");

const rootDir = __dirname;
const port = Number(process.env.PORT || 8080);
const dataDir = process.env.DATA_DIR || path.join(rootDir, "data");
const backupDir = path.join(dataDir, "backups");
const dataFile = path.join(dataDir, "shared_lender_data.json");
const maxBackups = Number(process.env.MAX_BACKUPS || 50);

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".ico": "image/x-icon"
};

let writeQueue = Promise.resolve();

async function ensureDataFiles() {
  await fsp.mkdir(backupDir, { recursive: true });
  try {
    await fsp.access(dataFile, fs.constants.F_OK);
  } catch {
    await fsp.writeFile(dataFile, JSON.stringify({ loans: [] }, null, 2), "utf8");
  }
}

async function readRequestBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function createBackupIfNeeded() {
  try {
    await fsp.access(dataFile, fs.constants.F_OK);
  } catch {
    return;
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupFile = path.join(backupDir, `shared_lender_data-${stamp}.json`);
  await fsp.copyFile(dataFile, backupFile);

  const backupNames = (await fsp.readdir(backupDir))
    .filter((name) => name.startsWith("shared_lender_data-") && name.endsWith(".json"))
    .sort()
    .reverse();

  if (backupNames.length > maxBackups) {
    await Promise.all(
      backupNames.slice(maxBackups).map((name) => fsp.unlink(path.join(backupDir, name)))
    );
  }
}

function sendJson(res, statusCode, payload) {
  const body = Buffer.from(JSON.stringify(payload), "utf8");
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": body.length,
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  });
  res.end(body);
}

function sendText(res, statusCode, message) {
  const body = Buffer.from(message, "utf8");
  res.writeHead(statusCode, {
    "Content-Type": "text/plain; charset=utf-8",
    "Content-Length": body.length,
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  });
  res.end(body);
}

async function handleApiState(req, res) {
  if (req.method === "GET") {
    const body = await fsp.readFile(dataFile);
    res.writeHead(200, {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Length": body.length,
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    });
    res.end(body);
    return;
  }

  if (req.method === "POST") {
    const raw = await readRequestBody(req);
    let parsed;

    try {
      parsed = JSON.parse(raw);
    } catch {
      sendJson(res, 400, { ok: false, error: "invalid json" });
      return;
    }

    writeQueue = writeQueue.then(async () => {
      await createBackupIfNeeded();
      await fsp.writeFile(dataFile, JSON.stringify(parsed, null, 2), "utf8");
    });

    await writeQueue;
    sendJson(res, 200, { ok: true });
    return;
  }

  sendText(res, 405, "Method Not Allowed");
}

async function serveStaticFile(req, res, pathname) {
  const requestedPath = pathname === "/" ? "index.html" : decodeURIComponent(pathname.replace(/^\/+/, ""));
  const fullPath = path.resolve(rootDir, requestedPath);

  if (!fullPath.startsWith(rootDir)) {
    sendText(res, 403, "Forbidden");
    return;
  }

  let stat;
  try {
    stat = await fsp.stat(fullPath);
  } catch {
    sendText(res, 404, "Not Found");
    return;
  }

  if (!stat.isFile()) {
    sendText(res, 404, "Not Found");
    return;
  }

  const ext = path.extname(fullPath).toLowerCase();
  const contentType = contentTypes[ext] || "application/octet-stream";
  const body = await fsp.readFile(fullPath);

  res.writeHead(200, {
    "Content-Type": contentType,
    "Content-Length": body.length
  });
  res.end(body);
}

async function main() {
  await ensureDataFiles();

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);

    if (req.method === "OPTIONS") {
      res.writeHead(204, {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type"
      });
      res.end();
      return;
    }

    try {
      if (url.pathname === "/api/state") {
        await handleApiState(req, res);
        return;
      }

      if (req.method !== "GET") {
        sendText(res, 405, "Method Not Allowed");
        return;
      }

      await serveStaticFile(req, res, url.pathname);
    } catch (error) {
      console.error("Request failed:", error);
      sendJson(res, 500, { ok: false, error: "internal server error" });
    }
  });

  server.listen(port, "0.0.0.0", () => {
    console.log(`Server listening on http://0.0.0.0:${port}`);
    console.log(`Data file: ${dataFile}`);
  });
}

main().catch((error) => {
  console.error("Failed to start server:", error);
  process.exit(1);
});
