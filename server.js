import express from "express";
import cors from "cors";
import fetch from "node-fetch";

const app = express();
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: "200kb" }));

const GEMINI_API_KEY = "AIzaSyBJggaq5EN098CJGVZrYryfELvd1Ichz4Q";
const GEMINI_MODEL = "gemini-2.0-flash";
const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

app.get("/health", (req, res) => {
  res.json({ status: "Proxy running" });
});

app.post("/gemini", async (req, res) => {
  try {
    console.log("[PROXY] Request received");
    const r = await fetch(`${GEMINI_ENDPOINT}?key=${encodeURIComponent(GEMINI_API_KEY)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req.body),
    });

    const text = await r.text();
    try {
      const json = JSON.parse(text);
      res.status(r.status).json(json);
    } catch (e) {
      res.status(r.status).type("text").send(text);
    }
  } catch (err) {
    console.error("[PROXY] Error:", err.message);
    res.status(500).json({ error: "Proxy error", details: err.message });
  }
});

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`\n✅ MindWell Proxy running on http://localhost:${PORT}`);
  console.log(`📌 Proxy endpoint: http://localhost:${PORT}/gemini\n`);
});
