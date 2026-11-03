"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { spawn, spawnSync } = require("node:child_process");

const ROOT = path.resolve(__dirname, "..");
const AUTOMATE_SCRIPT = path.join(ROOT, "scripts", "automate.js");

test("automate.js --help displays telegram options", () => {
  const res = spawnSync("node", [AUTOMATE_SCRIPT, "--help"], { encoding: "utf8" });
  assert.equal(res.status, 0);
  assert.match(res.stdout, /--telegram/);
  assert.match(res.stdout, /--telegram-chat/);
  assert.match(res.stdout, /--telegram-token/);
  assert.match(res.stdout, /--telegram-webhook/);
  assert.match(res.stdout, /TELEGRAM_BOT_TOKEN/);
  assert.match(res.stdout, /TELEGRAM_CHAT_ID/);
});

test("automate.js warns when --telegram is set but credentials missing", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "auto-test-"));
  const tmpData = path.join(tmpDir, "empty-jobs.json");
  const tmpState = path.join(tmpDir, "state.json");
  fs.writeFileSync(tmpData, JSON.stringify([]));

  try {
    const res = spawnSync("node", [
      AUTOMATE_SCRIPT,
      "--telegram",
      "--data", tmpData,
      "--state", tmpState
    ], {
      encoding: "utf8",
      env: { ...process.env, TELEGRAM_BOT_TOKEN: "", TELEGRAM_CHAT_ID: "", TELEGRAM_WEBHOOK_URL: "" }
    });

    assert.equal(res.status, 0);
    assert.match(res.stderr, /Telegram delivery enabled \(--telegram\) but credentials not found/);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("automate.js renders poster and delivers to Telegram webhook", async () => {
  let webhookReceived = false;
  let receivedBody = "";

  const server = http.createServer((req, res) => {
    webhookReceived = true;
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      receivedBody = Buffer.concat(chunks).toString();
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true, result: { message_id: 12345 } }));
    });
  });

  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "auto-render-test-"));
  const tmpData = path.join(tmpDir, "jobs.json");
  const tmpState = path.join(tmpDir, "state.json");
  const tmpOut = path.join(tmpDir, "posts");

  const sampleJob = [{
    id: "testjob001",
    company: "Acme Tech",
    role: "Senior Fullstack Engineer",
    deadline: "2026-12-01",
    link: "https://example.com/jobs/1",
    tech_park: "Infopark",
    description: "Looking for Senior Fullstack Engineer skilled in Node.js and React. Location: Infopark, Kochi. Email: hr@acme.com",
    email: "hr@acme.com",
    scraped_at: new Date().toISOString()
  }];
  fs.writeFileSync(tmpData, JSON.stringify(sampleJob, null, 2));

  try {
    const child = spawn("node", [
      AUTOMATE_SCRIPT,
      "--count", "1",
      "--variant", "4",
      "--scale", "1",
      "--backfill",
      "--data", tmpData,
      "--out", tmpOut,
      "--state", tmpState,
      "--telegram-webhook", `http://127.0.0.1:${port}/webhook`
    ], {
      env: { ...process.env }
    });

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => { stdout += d.toString(); });
    child.stderr.on("data", (d) => { stderr += d.toString(); });

    const exitCode = await new Promise((resolve) => {
      child.on("close", resolve);
    });

    assert.equal(exitCode, 0, "automate.js should exit with code 0. Stderr: " + stderr);
    assert.equal(webhookReceived, true, "Webhook server should have received POST request");
    assert.match(receivedBody, /name="heading"/);
    assert.match(receivedBody, /Senior Fullstack Engineer/);
    assert.match(receivedBody, /filename="v4-acme-tech-senior-fullstack-engineer/);

    const latestJsonPath = path.join(tmpOut, "latest.json");
    assert.ok(fs.existsSync(latestJsonPath), "latest.json should exist");
    const manifest = JSON.parse(fs.readFileSync(latestJsonPath, "utf8"));
    assert.equal(manifest.count, 1);
    assert.equal(manifest.telegram_delivered, 1);
    assert.equal(manifest.posters[0].telegram_sent, true);
  } finally {
    server.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
