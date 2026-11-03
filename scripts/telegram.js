#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");

function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatTelegramCaption(job, heading) {
  const parts = [];
  const title = heading || (job && (job.title || job.role)) || "New Job Opening";
  parts.push(`📢 <b>${escapeHtml(title)}</b>\n`);

  if (job) {
    if (job.company) parts.push(`🏢 <b>Company:</b> ${escapeHtml(job.company)}`);
    if (job.role && job.role !== job.company) parts.push(`💼 <b>Role:</b> ${escapeHtml(job.role)}`);
    if (job.location) parts.push(`📍 <b>Location:</b> ${escapeHtml(job.location)}`);
    if (job.experience && job.experience !== "Not specified") parts.push(`⏳ <b>Experience:</b> ${escapeHtml(job.experience)}`);
    if (job.jobType) parts.push(`💼 <b>Type:</b> ${escapeHtml(job.jobType)}`);
    if (job.workplace && job.workplace !== job.jobType) parts.push(`🏠 <b>Workplace:</b> ${escapeHtml(job.workplace)}`);
    if (job.deadline) parts.push(`📅 <b>Apply by:</b> ${escapeHtml(job.deadline)}`);
    if (job.email) parts.push(`✉️ <b>Email:</b> <code>${escapeHtml(job.email)}</code>`);
    if (job.link) parts.push(`\n🔗 <a href="${escapeHtml(job.link)}">Apply / View Details</a>`);
  }

  let text = parts.join("\n").trim();
  if (text.length > 1024) {
    // If HTML caption exceeds 1024, fall back to safely truncated plain caption
    return formatPlainCaption(job, heading);
  }
  return text;
}

function formatPlainCaption(job, heading) {
  const parts = [];
  const title = heading || (job && (job.title || job.role)) || "New Job Opening";
  parts.push(title, "");

  if (job) {
    if (job.company) parts.push("Company: " + job.company);
    if (job.role && job.role !== job.company) parts.push("Role: " + job.role);
    if (job.location) parts.push("Location: " + job.location);
    if (job.experience && job.experience !== "Not specified") parts.push("Experience: " + job.experience);
    if (job.jobType) parts.push("Type: " + job.jobType);
    if (job.workplace && job.workplace !== job.jobType) parts.push("Workplace: " + job.workplace);
    if (job.deadline) parts.push("Apply by: " + job.deadline);
    if (job.email) parts.push("Email: " + job.email);
    if (job.link) parts.push("Apply: " + job.link);
  }

  let text = parts.join("\n").trim();
  if (text.length > 1024) {
    text = text.slice(0, 1021) + "...";
  }
  return text;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function sendToTelegram({
  imagePath,
  heading = "",
  caption = null,
  job = null,
  token = process.env.TELEGRAM_BOT_TOKEN,
  chatId = process.env.TELEGRAM_CHAT_ID,
  webhookUrl = process.env.TELEGRAM_WEBHOOK_URL,
  parseMode = "HTML",
  timeoutMs = 30000,
  retries = 2
}) {
  if (!imagePath) {
    throw new Error("sendToTelegram: imagePath is required");
  }
  if (!fs.existsSync(imagePath)) {
    throw new Error(`sendToTelegram: Image file not found at ${imagePath}`);
  }

  const trimmedToken = token ? String(token).trim() : "";
  const trimmedChatId = chatId ? String(chatId).trim() : "";
  const trimmedWebhook = webhookUrl ? String(webhookUrl).trim() : "";

  if (!trimmedWebhook && (!trimmedToken || !trimmedChatId)) {
    throw new Error(
      "Missing Telegram configuration. Provide TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID or TELEGRAM_WEBHOOK_URL."
    );
  }

  const isCustomWebhook = Boolean(trimmedWebhook && !trimmedWebhook.includes("api.telegram.org"));
  const url = trimmedWebhook || `https://api.telegram.org/bot${trimmedToken}/sendPhoto`;

  const finalCaption = caption != null ? caption : formatTelegramCaption(job, heading);
  const fileBuffer = fs.readFileSync(imagePath);
  const fileName = path.basename(imagePath) || "poster.png";

  const form = new FormData();
  if (trimmedChatId) {
    form.append("chat_id", trimmedChatId);
  }
  form.append("photo", new Blob([fileBuffer], { type: "image/png" }), fileName);
  if (finalCaption) {
    form.append("caption", finalCaption);
  }
  if (parseMode && !isCustomWebhook) {
    form.append("parse_mode", parseMode);
  }

  if (isCustomWebhook) {
    // Custom webhook receivers benefit from explicit heading and metadata fields
    if (heading) form.append("heading", heading);
    if (job) form.append("job_data", JSON.stringify(job));
  }

  let attempt = 0;
  while (attempt <= retries) {
    attempt++;
    let res;
    let data;
    try {
      res = await fetch(url, {
        method: "POST",
        body: form,
        signal: AbortSignal.timeout(timeoutMs)
      });
      const text = await res.text();
      try {
        data = JSON.parse(text);
      } catch (err) {
        data = { ok: res.ok, raw: text };
      }
    } catch (netErr) {
      if (attempt <= retries) {
        console.warn(`⚠️ Network error communicating with Telegram (${netErr.message}). Retrying in 2s...`);
        await sleep(2000);
        continue;
      }
      throw new Error(`Telegram request failed: ${netErr.message}`);
    }

    // Handle Telegram rate limit (429)
    if (res.status === 429 || (data && data.error_code === 429)) {
      const waitSec = (data && data.parameters && data.parameters.retry_after) || 3;
      if (attempt <= retries) {
        console.warn(`⚠️ Telegram rate limited (429). Waiting ${waitSec}s before retrying...`);
        await sleep(waitSec * 1000);
        continue;
      }
      throw new Error(`Telegram rate limit exceeded (429). Retry after ${waitSec}s.`);
    }

    // Handle HTML entity parse errors: retry with plain text caption
    if (
      !res.ok &&
      parseMode &&
      data &&
      typeof data.description === "string" &&
      data.description.toLowerCase().includes("can't parse entities")
    ) {
      console.warn("⚠️ Telegram failed to parse HTML entities. Retrying with plain text caption...");
      return sendToTelegram({
        imagePath,
        heading,
        caption: formatPlainCaption(job, heading),
        job,
        token: trimmedToken,
        chatId: trimmedChatId,
        webhookUrl: trimmedWebhook,
        parseMode: null,
        timeoutMs,
        retries: retries - 1
      });
    }

    if (!res.ok || (data && data.ok === false)) {
      const desc = (data && data.description) || (data && data.raw) || res.statusText;
      const code = (data && data.error_code) || res.status;
      throw new Error(`Telegram API error [${code}]: ${desc}`);
    }

    return {
      ok: true,
      data
    };
  }

  throw new Error("Telegram delivery failed after maximum retries.");
}

async function testTelegramConnection({
  token = process.env.TELEGRAM_BOT_TOKEN,
  chatId = process.env.TELEGRAM_CHAT_ID,
  webhookUrl = process.env.TELEGRAM_WEBHOOK_URL
} = {}) {
  const effectiveToken = (token || process.env.TELEGRAM_BOT_TOKEN || "").trim();
  const effectiveChatId = (chatId || process.env.TELEGRAM_CHAT_ID || "").trim();
  const effectiveWebhook = (webhookUrl || process.env.TELEGRAM_WEBHOOK_URL || "").trim();

  if (!effectiveWebhook && (!effectiveToken || !effectiveChatId)) {
    throw new Error("Missing TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID or TELEGRAM_WEBHOOK_URL.");
  }

  const trimmedToken = effectiveToken;
  const trimmedChatId = effectiveChatId;
  const trimmedWebhook = effectiveWebhook;

  if (trimmedWebhook && !trimmedWebhook.includes("api.telegram.org")) {
    console.log("Testing custom webhook endpoint:", trimmedWebhook);
    const res = await fetch(trimmedWebhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ test: true, timestamp: new Date().toISOString() }),
      signal: AbortSignal.timeout(10000)
    });
    return { ok: res.ok, status: res.status };
  }

  console.log("Verifying Telegram bot token...");
  const meRes = await fetch(`https://api.telegram.org/bot${trimmedToken}/getMe`);
  const meData = await meRes.json();
  if (!meData.ok) {
    throw new Error(`getMe failed [${meData.error_code}]: ${meData.description}`);
  }
  console.log(`✓ Bot authenticated: @${meData.result.username} (${meData.result.first_name})`);

  console.log(`Sending test ping to chat: ${trimmedChatId}...`);
  const msgRes = await fetch(`https://api.telegram.org/bot${trimmedToken}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: trimmedChatId,
      text: "🤖 <b>Telegram Webhook Connection Verified!</b>\nAutoposter is configured to send job posters here.",
      parse_mode: "HTML"
    })
  });
  const msgData = await msgRes.json();
  if (!msgData.ok) {
    throw new Error(`sendMessage failed [${msgData.error_code}]: ${msgData.description}`);
  }
  console.log("✓ Test message sent successfully (message_id: " + msgData.result.message_id + ")");
  return { ok: true, bot: meData.result, message: msgData.result };
}

async function sendManifest({
  manifestPath,
  token = process.env.TELEGRAM_BOT_TOKEN,
  chatId = process.env.TELEGRAM_CHAT_ID,
  webhookUrl = process.env.TELEGRAM_WEBHOOK_URL,
  delayMs = 1500
} = {}) {
  const effectiveToken = (token || process.env.TELEGRAM_BOT_TOKEN || "").trim();
  const effectiveChatId = (chatId || process.env.TELEGRAM_CHAT_ID || "").trim();
  const effectiveWebhook = (webhookUrl || process.env.TELEGRAM_WEBHOOK_URL || "").trim();

  const resolvedManifest = path.resolve(manifestPath);
  if (!fs.existsSync(resolvedManifest)) {
    console.log(`ℹ️ Manifest file not found at ${resolvedManifest}. No posters to send.`);
    return { count: 0, sent: 0, failed: 0 };
  }

  const raw = fs.readFileSync(resolvedManifest, "utf8");
  let manifest;
  try {
    manifest = JSON.parse(raw);
  } catch (err) {
    throw new Error(`Failed to parse manifest JSON at ${resolvedManifest}: ${err.message}`);
  }

  const posters = Array.isArray(manifest.posters) ? manifest.posters : [];
  if (!posters.length) {
    console.log("ℹ️ Manifest contains 0 posters. Nothing to send.");
    return { count: 0, sent: 0, failed: 0 };
  }

  const pending = posters.filter((p) => !p.telegram_sent);
  if (!pending.length) {
    console.log(`ℹ️ All ${posters.length} poster(s) in manifest have already been sent to Telegram.`);
    return { count: posters.length, sent: 0, failed: 0 };
  }

  console.log(`🚀 Dispatching ${pending.length} poster(s) to Telegram...`);

  let sent = 0;
  let failed = 0;

  for (let i = 0; i < pending.length; i++) {
    const p = pending[i];
    let actualImage = path.isAbsolute(p.image) ? p.image : path.resolve(ROOT, p.image);
    if (!fs.existsSync(actualImage)) {
      const fallback = path.resolve(path.dirname(resolvedManifest), path.basename(p.image));
      if (fs.existsSync(fallback)) actualImage = fallback;
    }

    const heading = p.heading || p.title || path.basename(p.image);
    console.log(`[${i + 1}/${pending.length}] Sending: ${heading}`);

    try {
      await sendToTelegram({
        imagePath: actualImage,
        heading,
        caption: p.telegram_caption || null,
        job: p,
        token: effectiveToken,
        chatId: effectiveChatId,
        webhookUrl: effectiveWebhook
      });
      p.telegram_sent = true;
      sent++;
      console.log(`  ✈️ Delivered!`);

      // Update manifest progressively so sent status is saved immediately
      manifest.telegram_delivered = posters.filter((x) => x.telegram_sent).length;
      fs.writeFileSync(resolvedManifest, JSON.stringify(manifest, null, 2) + "\n");
      if (manifest.run) {
        const runManifest = path.resolve(path.dirname(resolvedManifest), manifest.run, "posts.json");
        if (fs.existsSync(runManifest) && runManifest !== resolvedManifest) {
          fs.writeFileSync(runManifest, JSON.stringify(manifest, null, 2) + "\n");
        }
      }

      if (i < pending.length - 1) {
        await sleep(delayMs);
      }
    } catch (err) {
      failed++;
      console.error(`  ✗ Delivery failed: ${err.message}`);
    }
  }

  console.log(`\n=== Telegram Dispatch Summary ===`);
  console.log(`Successfully sent: ${sent}/${pending.length}`);
  if (failed > 0) {
    console.warn(`⚠️ Failed: ${failed}`);
    throw new Error(`${failed} poster(s) failed to send to Telegram.`);
  }

  return { count: posters.length, sent, failed };
}

function parseCliArgs(argv) {
  const out = {
    test: false,
    manifest: null,
    image: null,
    heading: "",
    caption: "",
    token: process.env.TELEGRAM_BOT_TOKEN || "",
    chat: process.env.TELEGRAM_CHAT_ID || "",
    webhook: process.env.TELEGRAM_WEBHOOK_URL || "",
    help: false
  };
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    if (a === "--test") out.test = true;
    else if (a === "--manifest" || a === "-m") out.manifest = next();
    else if (a === "--token" || a === "-t") out.token = next();
    else if (a === "--chat" || a === "-c") out.chat = next();
    else if (a === "--webhook" || a === "-w") out.webhook = next();
    else if (a === "--heading") out.heading = next();
    else if (a === "--caption") out.caption = next();
    else if (a === "--help" || a === "-h") out.help = true;
    else if (!a.startsWith("-")) positional.push(a);
    else throw new Error("Unknown argument: " + a);
  }
  if (positional.length > 0 && !out.image && !out.manifest) out.image = positional[0];
  if (positional.length > 1 && !out.heading) out.heading = positional[1];
  if (positional.length > 2 && !out.caption) out.caption = positional[2];
  return out;
}

function usage() {
  console.log(`Telegram Poster Dispatcher

Usage:
  node scripts/telegram.js --test [options]
  node scripts/telegram.js --manifest <manifestPath> [options]
  node scripts/telegram.js <imagePath> [heading] [caption] [options]

Options:
  -m, --manifest PATH      Send all pending posters from a posts.json manifest
  -t, --token TOKEN        Telegram bot token (default: env TELEGRAM_BOT_TOKEN)
  -c, --chat CHAT_ID       Telegram chat / channel ID (default: env TELEGRAM_CHAT_ID)
  -w, --webhook URL        Custom webhook URL (default: env TELEGRAM_WEBHOOK_URL)
      --heading TEXT       Heading to display above caption
      --caption TEXT       Custom caption text
      --test               Verify bot credentials and send a test message
  -h, --help               Show this help message
`);
}

async function cli() {
  const args = parseCliArgs(process.argv.slice(2));
  if (args.help) {
    usage();
    return;
  }

  if (args.test) {
    await testTelegramConnection({
      token: args.token || process.env.TELEGRAM_BOT_TOKEN,
      chatId: args.chat || process.env.TELEGRAM_CHAT_ID,
      webhookUrl: args.webhook || process.env.TELEGRAM_WEBHOOK_URL
    });
    return;
  }

  if (args.manifest) {
    await sendManifest({
      manifestPath: args.manifest,
      token: args.token || process.env.TELEGRAM_BOT_TOKEN,
      chatId: args.chat || process.env.TELEGRAM_CHAT_ID,
      webhookUrl: args.webhook || process.env.TELEGRAM_WEBHOOK_URL
    });
    return;
  }

  if (!args.image) {
    usage();
    process.exit(1);
  }

  const resolvedImage = path.resolve(args.image);
  console.log(`Sending ${resolvedImage} to Telegram...`);
  const res = await sendToTelegram({
    imagePath: resolvedImage,
    heading: args.heading,
    caption: args.caption || null,
    token: args.token || process.env.TELEGRAM_BOT_TOKEN,
    chatId: args.chat || process.env.TELEGRAM_CHAT_ID,
    webhookUrl: args.webhook || process.env.TELEGRAM_WEBHOOK_URL
  });
  console.log("✓ Successfully delivered to Telegram!", res.ok ? "(OK)" : "");
}

if (require.main === module) {
  cli().catch((err) => {
    console.error("telegram:", err.message);
    process.exit(1);
  });
}

module.exports = {
  sendToTelegram,
  sendManifest,
  formatTelegramCaption,
  formatPlainCaption,
  escapeHtml,
  testTelegramConnection,
  sleep,
  parseCliArgs
};
