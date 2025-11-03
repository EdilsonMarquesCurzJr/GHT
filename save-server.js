// Simple save server to write trens.json in the project folder.
// Usage:
// 1) npm install express cors
// 2) node save-server.js
// The server accepts POST /save with JSON body and writes trens.json

const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

const PORT = process.env.PORT || 3000;
const OUT_FILE = path.join(__dirname, 'trens.json');

app.get('/', (req, res) => {
  res.send('save-server running\n');
});

app.post('/save', (req, res) => {
  const payload = req.body;
  if (!payload || typeof payload !== 'object') {
    return res.status(400).json({ ok: false, error: 'invalid payload' });
  }
  fs.writeFile(OUT_FILE, JSON.stringify(payload, null, 2), 'utf8', (err) => {
    if (err) {
      console.error('Failed to write:', err);
      return res.status(500).json({ ok: false, error: err.message });
    }
    console.log('Saved timetable to', OUT_FILE);
    res.json({ ok: true, path: OUT_FILE });
  });
});

app.listen(PORT, () => {
  console.log(`save-server listening on http://localhost:${PORT}/`);
  console.log(`Writing to ${OUT_FILE}`);
});
// Simple save server to write trens.json in the project folder.
// Usage:
// 1) npm install express cors
// 2) node save-server.js
// The server accepts POST /save with JSON body and writes trens.json

const express = require("express");
const fs = require("fs");
const path = require("path");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json({ limit: "10mb" }));

const PORT = process.env.PORT || 3000;
const OUT_FILE = path.join(__dirname, "trens.json");

app.get("/", (req, res) => {
  res.send("save-server running\n");
});

app.post("/save", (req, res) => {
  const payload = req.body;
  // basic validation
  if (!payload || typeof payload !== "object") {
    return res.status(400).json({ ok: false, error: "invalid payload" });
  }
  fs.writeFile(OUT_FILE, JSON.stringify(payload, null, 2), "utf8", (err) => {
    if (err) {
      console.error("Failed to write:", err);
      return res.status(500).json({ ok: false, error: err.message });
    }
    console.log("Saved timetable to", OUT_FILE);
    res.json({ ok: true, path: OUT_FILE });
  });
});

app.listen(PORT, () => {
  console.log(`save-server listening on http://localhost:${PORT}/`);
  console.log(`Writing to ${OUT_FILE}`);
});
