"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

const telegram = require("../scripts/telegram.js");

test("escapeHtml escapes special characters", () => {
  assert.equal(telegram.escapeHtml("AT&T <Jobs> \"2026\""), "AT&amp;T &lt;Jobs&gt; &quot;2026&quot;");
  assert.equal(telegram.escapeHtml(""), "");
  assert.equal(telegram.escapeHtml(null), "");
});

test("formatTelegramCaption formats job details nicely", () => {
  const job = {
    company: "Google & Alphabet",
    role: "Senior Software Engineer",
    location: "Bangalore, India",
    experience: "3-5 years",
    jobType: "Full-time",
    workplace: "Hybrid",
    deadline: "2026-12-31",
    email: "jobs@google.com",
    link: "https://careers.google.com/job/123"
  };
  const caption = telegram.formatTelegramCaption(job, "Hiring: Senior Software Engineer at Google");
  assert.match(caption, /📢 <b>Hiring: Senior Software Engineer at Google<\/b>/);
  assert.match(caption, /🏢 <b>Company:<\/b> Google &amp; Alphabet/);
  assert.match(caption, /💼 <b>Role:<\/b> Senior Software Engineer/);
  assert.match(caption, /📍 <b>Location:<\/b> Bangalore, India/);
  assert.match(caption, /⏳ <b>Experience:<\/b> 3-5 years/);
  assert.match(caption, /✉️ <b>Email:<\/b> <code>jobs@google.com<\/code>/);
  assert.match(caption, /🔗 <a href="https:\/\/careers\.google\.com\/job\/123">Apply \/ View Details<\/a>/);
  assert.ok(caption.length <= 1024);
});

test("formatTelegramCaption truncates gracefully if over 1024 characters", () => {
  const longText = "A".repeat(1200);
  const job = {
    company: "BigCo",
    role: "Developer",
    location: longText
  };
  const caption = telegram.formatTelegramCaption(job, "Long Heading");
  assert.ok(caption.length <= 1024);
});

test("sendToTelegram sends multipart payload to Telegram Bot API", async () => {
  let receivedHeaders = null;
  let receivedBody = "";

  const server = http.createServer((req, res) => {
    receivedHeaders = req.headers;
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      receivedBody = Buffer.concat(chunks).toString();
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true, result: { message_id: 999 } }));
    });
  });

  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;

  // Create temporary image file
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "tg-test-"));
  const tmpImg = path.join(tmpDir, "test.png");
  fs.writeFileSync(tmpImg, Buffer.from("fake-png-content"));

  try {
    const res = await telegram.sendToTelegram({
      imagePath: tmpImg,
      heading: "Test Heading",
      caption: "<b>Test Heading</b>\nDetails here",
      token: "fake-token",
      chatId: "@mytestchannel",
      webhookUrl: `http://127.0.0.1:${port}/sendPhoto`
    });

    assert.equal(res.ok, true);
    assert.match(receivedHeaders["content-type"], /^multipart\/form-data; boundary=/);
    assert.match(receivedBody, /name="chat_id"[\r\n]+@mytestchannel/);
    assert.match(receivedBody, /name="caption"[\r\n]+<b>Test Heading<\/b>\r?\nDetails here/);
    assert.match(receivedBody, /filename="test.png"/);
    assert.match(receivedBody, /fake-png-content/);
  } finally {
    server.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("sendToTelegram retries on 429 rate limit", async () => {
  let callCount = 0;
  const server = http.createServer((req, res) => {
    callCount++;
    if (callCount === 1) {
      res.writeHead(429, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        ok: false,
        error_code: 429,
        description: "Too Many Requests",
        parameters: { retry_after: 1 }
      }));
    } else {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true, result: { message_id: 1000 } }));
    }
  });

  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "tg-test-"));
  const tmpImg = path.join(tmpDir, "test.png");
  fs.writeFileSync(tmpImg, Buffer.from("image"));

  try {
    const res = await telegram.sendToTelegram({
      imagePath: tmpImg,
      heading: "Rate limit test",
      token: "fake-token",
      chatId: "12345",
      webhookUrl: `http://127.0.0.1:${port}/sendPhoto`
    });

    assert.equal(res.ok, true);
    assert.equal(callCount, 2);
  } finally {
    server.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("sendToTelegram falls back to plain text if HTML entity parse error occurs", async () => {
  let callCount = 0;
  let secondCallBody = "";

  const server = http.createServer((req, res) => {
    callCount++;
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const body = Buffer.concat(chunks).toString();
      if (callCount === 1) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          ok: false,
          error_code: 400,
          description: "Bad Request: can't parse entities: Character '<' is reserved"
        }));
      } else {
        secondCallBody = body;
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true, result: { message_id: 1001 } }));
      }
    });
  });

  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "tg-test-"));
  const tmpImg = path.join(tmpDir, "test.png");
  fs.writeFileSync(tmpImg, Buffer.from("image"));

  try {
    const res = await telegram.sendToTelegram({
      imagePath: tmpImg,
      heading: "Entity test",
      token: "fake-token",
      chatId: "12345",
      webhookUrl: `http://127.0.0.1:${port}/sendPhoto`
    });

    assert.equal(res.ok, true);
    assert.equal(callCount, 2);
    // In fallback retry, parse_mode should not be present
    assert.ok(!secondCallBody.includes('name="parse_mode"'));
  } finally {
    server.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("sendToTelegram throws when missing image or credentials", async () => {
  await assert.rejects(
    async () => telegram.sendToTelegram({ imagePath: "/nonexistent/img.png", token: "a", chatId: "b" }),
    /Image file not found/
  );

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "tg-test-"));
  const tmpImg = path.join(tmpDir, "test.png");
  fs.writeFileSync(tmpImg, Buffer.from("image"));

  try {
    await assert.rejects(
      async () => telegram.sendToTelegram({ imagePath: tmpImg, token: "", chatId: "", webhookUrl: "" }),
      /Missing Telegram configuration/
    );
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("parseCliArgs defaults to environment variables when flags are omitted", () => {
  const origToken = process.env.TELEGRAM_BOT_TOKEN;
  const origChat = process.env.TELEGRAM_CHAT_ID;
  const origWebhook = process.env.TELEGRAM_WEBHOOK_URL;

  try {
    process.env.TELEGRAM_BOT_TOKEN = "env-bot-token";
    process.env.TELEGRAM_CHAT_ID = "env-chat-id";
    process.env.TELEGRAM_WEBHOOK_URL = "https://custom.webhook.test";

    const parsed = telegram.parseCliArgs(["--manifest", "posts/latest.json"]);
    assert.equal(parsed.manifest, "posts/latest.json");
    assert.equal(parsed.token, "env-bot-token");
    assert.equal(parsed.chat, "env-chat-id");
    assert.equal(parsed.webhook, "https://custom.webhook.test");

    // Explicit CLI flags override environment variables
    const overridden = telegram.parseCliArgs(["--token", "cli-token", "--chat", "cli-chat"]);
    assert.equal(overridden.token, "cli-token");
    assert.equal(overridden.chat, "cli-chat");
  } finally {
    if (origToken !== undefined) process.env.TELEGRAM_BOT_TOKEN = origToken;
    else delete process.env.TELEGRAM_BOT_TOKEN;
    if (origChat !== undefined) process.env.TELEGRAM_CHAT_ID = origChat;
    else delete process.env.TELEGRAM_CHAT_ID;
    if (origWebhook !== undefined) process.env.TELEGRAM_WEBHOOK_URL = origWebhook;
    else delete process.env.TELEGRAM_WEBHOOK_URL;
  }
});

test("sendManifest reads credentials from environment variables", async () => {
  let requestCount = 0;
  const server = http.createServer((req, res) => {
    requestCount++;
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true, result: { message_id: 12345 } }));
    });
  });

  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "tg-manifest-test-"));
  const tmpImg = path.join(tmpDir, "test.png");
  fs.writeFileSync(tmpImg, Buffer.from("dummy-poster"));

  const manifestPath = path.join(tmpDir, "manifest.json");
  fs.writeFileSync(
    manifestPath,
    JSON.stringify({
      count: 1,
      posters: [
        {
          image: tmpImg,
          heading: "Test Job",
          telegram_sent: false
        }
      ]
    })
  );

  const origWebhook = process.env.TELEGRAM_WEBHOOK_URL;
  try {
    process.env.TELEGRAM_WEBHOOK_URL = `http://127.0.0.1:${port}/sendPhoto`;
    const res = await telegram.sendManifest({ manifestPath, delayMs: 10 });
    assert.equal(res.sent, 1);
    assert.equal(res.failed, 0);
    assert.equal(requestCount, 1);

    const updated = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    assert.equal(updated.posters[0].telegram_sent, true);
  } finally {
    server.close();
    if (origWebhook !== undefined) process.env.TELEGRAM_WEBHOOK_URL = origWebhook;
    else delete process.env.TELEGRAM_WEBHOOK_URL;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
