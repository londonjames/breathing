const http = require("http");
const fs = require("fs");
const path = require("path");

const port = 3000;
const rootDir = __dirname;
const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

function sendJson(res, statusCode, body) {
  res.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

async function handleSpeak(req, res) {
  if (!process.env.OPENAI_API_KEY) {
    sendJson(res, 500, { error: "OPENAI_API_KEY is not set on the server." });
    return;
  }

  let payload;

  try {
    const rawBody = await readRequestBody(req);
    payload = JSON.parse(rawBody || "{}");
  } catch {
    sendJson(res, 400, { error: "Invalid JSON body." });
    return;
  }

  const text = typeof payload.text === "string" ? payload.text.trim() : "";
  if (!text) {
    sendJson(res, 400, { error: "Missing text." });
    return;
  }

  try {
    const response = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini-tts",
        voice: "coral",
        format: "mp3",
        instructions: "Speak calmly with a gentle English accent for a meditation breathing exercise.",
        input: text,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      sendJson(res, response.status, { error: errorText });
      return;
    }

    const audioBuffer = Buffer.from(await response.arrayBuffer());
    res.writeHead(200, {
      "Content-Type": "audio/mpeg",
      "Cache-Control": "no-store",
    });
    res.end(audioBuffer);
  } catch (error) {
    sendJson(res, 500, { error: error.message || "Speech request failed." });
  }
}

function handleStatic(req, res) {
  const requestedPath = req.url === "/" ? "/index.html" : req.url;
  const filePath = path.join(rootDir, path.normalize(requestedPath));

  if (!filePath.startsWith(rootDir)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (error, content) => {
    if (error) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Not found");
      return;
    }

    const extension = path.extname(filePath);
    res.writeHead(200, {
      "Content-Type": mimeTypes[extension] || "application/octet-stream",
      "Cache-Control": "no-store",
    });
    res.end(content);
  });
}

const server = http.createServer((req, res) => {
  if (req.method === "POST" && req.url === "/api/speak") {
    handleSpeak(req, res);
    return;
  }

  if (req.method === "GET") {
    handleStatic(req, res);
    return;
  }

  res.writeHead(405, { "Content-Type": "text/plain; charset=utf-8" });
  res.end("Method not allowed");
});

server.listen(port, () => {
  console.log(`Meditation app running at http://localhost:${port}`);
});
