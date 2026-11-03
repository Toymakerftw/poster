#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const gen = require("../generate.js");

const ROOT = path.resolve(__dirname, "..");

function parseArgs(argv) {
  const out = {
    count: 0,
    variant: 4,
    palette: "rotate",
    scale: 2,
    backfill: false,
    data: path.join(ROOT, "jobs.json"),
    out: path.join(ROOT, "posts"),
    state: path.join(ROOT, "state", "processed.json")
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    if (a === "--count" || a === "-n") out.count = parseInt(next(), 10);
    else if (a === "--variant" || a === "-v") out.variant = parseInt(next(), 10);
    else if (a === "--palette" || a === "-p") out.palette = next();
    else if (a === "--scale") out.scale = parseFloat(next());
    else if (a === "--data" || a === "-d") out.data = path.resolve(next());
    else if (a === "--out" || a === "-o") out.out = path.resolve(next());
    else if (a === "--state" || a === "-s") out.state = path.resolve(next());
    else if (a === "--backfill") out.backfill = true;
    else if (a === "--help" || a === "-h") out.help = true;
    else throw new Error("Unknown option: " + a);
  }
  return out;
}

function usage() {
  console.log(`Automated poster runner (one batch per invocation)

Usage: node scripts/automate.js [options]

  -n, --count N       max new posts this run, 0 = all (default 0)
  -v, --variant N     2, 4 or 5                     (default 4)
  -p, --palette P     rotate | all | name | 1-based index (default rotate)
      --scale N       device scale factor           (default 2)
      --backfill      on first run, process every existing job
  -d, --data FILE     jobs JSON                     (default ./jobs.json)
  -o, --out DIR       output root                   (default ./posts)
  -s, --state FILE    seen-id state                 (default ./state/processed.json)

Behaviour:
  - The first run records a baseline (all current ids). It still renders the
    newest scrape batch unless --backfill is passed.
  - Later runs render only job ids that were not seen on a previous run.

Each run writes:
  <out>/<timestamp>/*.png        timestamped posters
  <out>/<timestamp>/posts.json   Instagram heading + metadata per poster
  <out>/latest.json              copy of the newest posts.json
`);
}

function loadState(file) {
  try {
    const raw = JSON.parse(fs.readFileSync(file, "utf8"));
    const ids = Array.isArray(raw.ids) ? raw.ids : [];
    return { ids, initialized: raw.initialized === true || ids.length > 0 };
  } catch (e) {
    return { ids: [], initialized: false };
  }
}

function saveState(file, state) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(state, null, 2) + "\n");
}

function timestamp() {
  return new Date().toISOString().slice(0, 19).replace(/:/g, "-") + "Z";
}

function rel(p) {
  return path.relative(ROOT, p).split(path.sep).join("/");
}

function paletteIndices(spec, job) {
  const all = gen.THEMES[4];
  if (!spec || spec === "rotate") return [job.index % all.length];
  if (spec === "all") return all.map((_, i) => i);
  const n = parseInt(spec, 10);
  if (!isNaN(n) && n >= 1 && n <= all.length) return [n - 1];
  const k = all.findIndex((t) => t.name.toLowerCase() === String(spec).toLowerCase());
  if (k >= 0) return [k];
  throw new Error("Unknown palette: " + spec);
}

function caption(job) {
  const lines = [gen.instagramTitle(job), ""];
  if (job.location) lines.push("Location: " + job.location);
  if (job.experience) lines.push("Experience: " + job.experience);
  if (job.jobType) lines.push("Type: " + job.jobType);
  if (job.deadline) lines.push("Apply by: " + job.deadline);
  if (job.link) lines.push("Details: " + job.link);
  if (job.email) lines.push("Email: " + job.email);
  return lines.join("\n").trim();
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) return usage();
  if (![2, 4, 5].includes(args.variant)) throw new Error("--variant must be 2, 4 or 5");
  if (args.count < 0) throw new Error("--count must be >= 0");

  const jobs = JSON.parse(fs.readFileSync(args.data, "utf8"));
  if (!Array.isArray(jobs)) throw new Error("Expected a JSON array in " + args.data);

  const state = loadState(args.state);
  const seen = new Set(state.ids);
  const parsed = jobs.map((r, i) => gen.parseJob(r, i));
  const baseline = !state.initialized;

  let queue;
  if (baseline && !args.backfill) {
    const latest = parsed.reduce((max, j) => (j.scrapedAt > max ? j.scrapedAt : max), "");
    const batchHour = latest.slice(0, 13);
    queue = parsed.filter((j) => j.rawText && !seen.has(j.id) && j.scrapedAt.slice(0, 13) === batchHour);
    console.log("First run: recording baseline; rendering newest scrape batch " + (batchHour || "(unknown)"));
  } else {
    queue = parsed.filter((j) => j.rawText && !seen.has(j.id));
  }

  if (!queue.length) {
    if (baseline) {
      state.ids = [...new Set(parsed.map((j) => j.id))];
      state.initialized = true;
      state.last_run = timestamp();
      state.updated_at = new Date().toISOString();
      saveState(args.state, state);
      console.log("Baseline saved: " + state.ids.length + " existing jobs recorded. Future runs will only process new posts.");
    } else {
      console.log("No new job posts. Nothing to do.");
    }
    return;
  }

  const batch = args.count > 0 ? queue.slice(0, args.count) : queue;
  const skippedIds = queue.slice(batch.length).map((j) => j.id);
  const stamp = timestamp();
  const runDir = path.join(args.out, stamp);
  fs.mkdirSync(runDir, { recursive: true });

  const posts = [];
  const processedNow = [];
  let failures = 0;

  for (const job of batch) {
    let ok = false;
    for (const pi of paletteIndices(args.palette, job)) {
      const palette = gen.THEMES[4][pi].name;
      const name = "v" + args.variant + "-" + gen.slug(job.company) + "-" + gen.slug(job.role) +
        (args.variant === 4 ? "-" + palette : "") + "-" + job.id.slice(0, 8) + ".png";
      const outFile = path.join(runDir, name);
      try {
        gen.renderJob(job, { variant: args.variant, paletteIndex: pi, outFile, scale: args.scale });
        const heading = gen.instagramTitle(job);
        posts.push({
          heading,
          title: heading,
          caption: caption(job),
          image: rel(outFile),
          job_id: job.id,
          company: job.company,
          role: job.role,
          location: job.location,
          experience: job.experience,
          employment_type: job.jobType,
          workplace: job.workplace,
          deadline: job.deadline,
          email: job.email,
          apply_url: job.link,
          variant: args.variant,
          palette: args.variant === 4 ? palette : null,
          generated_at: new Date().toISOString()
        });
        ok = true;
        console.log("✓", rel(outFile));
      } catch (e) {
        failures++;
        console.error("✗", name, "-", e.message.split("\n")[0]);
      }
    }
    if (ok) processedNow.push(job.id);
  }

  if (!posts.length) {
    console.error("No posters generated.");
    process.exitCode = 1;
    return;
  }

  const manifest = {
    generated_at: new Date().toISOString(),
    run: stamp,
    count: posts.length,
    posters: posts
  };
  fs.writeFileSync(path.join(runDir, "posts.json"), JSON.stringify(manifest, null, 2) + "\n");
  fs.writeFileSync(path.join(args.out, "latest.json"), JSON.stringify(manifest, null, 2) + "\n");

  const unprocessable = parsed.filter((j) => !j.rawText).map((j) => j.id);
  if (baseline) {
    const failed = batch.filter((j) => !processedNow.includes(j.id)).map((j) => j.id);
    const seed = parsed.map((j) => j.id).filter((id) => !skippedIds.includes(id) && !failed.includes(id));
    state.ids = [...new Set([...state.ids, ...seed, ...processedNow, ...unprocessable])];
  } else {
    state.ids = [...new Set([...state.ids, ...processedNow, ...unprocessable])];
  }
  state.initialized = true;
  state.last_run = stamp;
  state.updated_at = new Date().toISOString();
  saveState(args.state, state);

  console.log("\nGenerated " + posts.length + " poster(s) for " + processedNow.length + " new job(s)");
  console.log("Manifest: " + rel(path.join(runDir, "posts.json")));
  if (failures) process.exitCode = 1;
}

try {
  main();
} catch (e) {
  console.error("automate:", e.message);
  process.exit(1);
}
