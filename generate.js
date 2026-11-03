#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const os = require("os");
const { spawnSync } = require("child_process");

const ROOT = __dirname;
const POSTER_DIR = path.join(ROOT, "poster");
const JOBS_PATH = path.join(ROOT, "jobs.json");
const CHROME = process.env.CHROME_BIN || "google-chrome";

const KEYWORDS = [
  "Python", "Java", "JavaScript", "TypeScript", "React", "Node.js", "Node",
  "Flutter", "Dart", "SQL", "NoSQL", "MongoDB", "PostgreSQL", "MySQL",
  "AWS", "Azure", "GCP", "Docker", "Kubernetes", "Terraform", "Ansible",
  "Django", "Flask", "FastAPI", "Spring", "Firebase", "Git", "REST", "API",
  "GraphQL", "Machine Learning", "ML", "AI", "Data Science", "BigQuery",
  "Snowflake", "Spark", "Airflow", "Kafka", "ETL", "DevOps", "CI/CD",
  "HTML", "CSS", "Angular", "Vue", "PHP", "Laravel", ".NET", "C#", "C++",
  "Android", "iOS", "Swift", "Kotlin", "Figma", "Photoshop", "SEO",
  "Excel", "Salesforce", "SAP", "Linux", "Networking", "Cybersecurity"
];

const THEMES = {
  1: [
    { brand: "#0E1B3D", accent: "#FF6B35", bg: "#0E1B3D" },
    { brand: "#12263A", accent: "#F4A261", bg: "#12263A" },
    { brand: "#1F3B2C", accent: "#FF7043", bg: "#1F3B2C" },
    { brand: "#2B1B3D", accent: "#4F7CFF", bg: "#2B1B3D" },
    { brand: "#3A0CA3", accent: "#FFB703", bg: "#3A0CA3" }
  ],
  2: [
    { brand: "#1F8A4C", accent: "#E63946", bg: "#FFFFFF", cardBg: "#161616" },
    { brand: "#4361EE", accent: "#F72585", bg: "#FFFFFF", cardBg: "#161616" },
    { brand: "#264653", accent: "#F4A261", bg: "#FFFBF0", cardBg: "#1B1B1B" },
    { brand: "#7D5260", accent: "#6750A4", bg: "#FFFFFF", cardBg: "#161616" }
  ],
  3: [
    { brand: "#1E88E5", accent: "#FF7043", bg: "#F4F8FE" },
    { brand: "#0E7C86", accent: "#F4A261", bg: "#F1FAFA" },
    { brand: "#3949AB", accent: "#F72585", bg: "#F4F6FF" },
    { brand: "#2E7D32", accent: "#EF6C00", bg: "#F3FAF4" }
  ],
  4: [
    { name: "purple", primary: "#6750A4", primaryContainer: "#EADDFF", onPrimaryContainer: "#21005D", bg: "#FFFBFE" },
    { name: "teal", primary: "#00696D", primaryContainer: "#9CF1F4", onPrimaryContainer: "#002021", bg: "#FAFDFC" },
    { name: "rose", primary: "#7D5260", primaryContainer: "#FFD8E4", onPrimaryContainer: "#31111D", bg: "#FFF8F8" },
    { name: "amber", primary: "#8B5000", primaryContainer: "#FFDCC2", onPrimaryContainer: "#2D1600", bg: "#FFFBF7" },
    { name: "indigo", primary: "#415F91", primaryContainer: "#D6E3FF", onPrimaryContainer: "#001B3E", bg: "#F9F9FF" },
    { name: "green", primary: "#3B6939", primaryContainer: "#BCF0B4", onPrimaryContainer: "#002204", bg: "#F8FFF3" },
    { name: "red", primary: "#BA1A1A", primaryContainer: "#FFDAD6", onPrimaryContainer: "#410002", bg: "#FFFBFF" },
    { name: "cyan", primary: "#00639B", primaryContainer: "#D1E4FF", onPrimaryContainer: "#001D35", bg: "#F8F9FF" },
    { name: "orange", primary: "#9A4520", primaryContainer: "#FFDBCF", onPrimaryContainer: "#380D00", bg: "#FFFBFF" },
    { name: "olive", primary: "#5D6135", primaryContainer: "#E2E6AC", onPrimaryContainer: "#1A1D00", bg: "#FBFBE2" },
    { name: "plum", primary: "#8E4585", primaryContainer: "#FFD7F5", onPrimaryContainer: "#3A0033", bg: "#FFF7FA" },
    { name: "slate", primary: "#4A5C6B", primaryContainer: "#D3E6F8", onPrimaryContainer: "#071E2B", bg: "#F7FAFD" },
    { name: "gold", primary: "#7A5900", primaryContainer: "#FFE08B", onPrimaryContainer: "#261A00", bg: "#FFFCF0" },
    { name: "mint", primary: "#006B5B", primaryContainer: "#7EF8DC", onPrimaryContainer: "#002019", bg: "#F5FFFB" },
    { name: "navy", primary: "#1E3A8A", primaryContainer: "#DBEAFE", onPrimaryContainer: "#172554", bg: "#F8FAFF" },
    { name: "coral", primary: "#B3261E", primaryContainer: "#FFDAD6", onPrimaryContainer: "#410E0B", bg: "#FFFBFF" }
  ],
  5: [
    { ink: "#111111", paper: "#F5EFE6", accent: "#E63946" },
    { ink: "#1A1A1A", paper: "#F3F1EA", accent: "#1D3557" },
    { ink: "#111111", paper: "#FBF7EF", accent: "#B23A22" },
    { ink: "#14213D", paper: "#EFEAD8", accent: "#FCA311" }
  ]
};

function parseArgs(argv) {
  const out = { variant: "4", limit: 0, start: 0, out: path.join(ROOT, "out"), scale: 1, data: JOBS_PATH, json: false, colors: "" };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    if (a === "--variant" || a === "-v") out.variant = next();
    else if (a === "--limit" || a === "-n") out.limit = parseInt(next(), 10);
    else if (a === "--start" || a === "-s") out.start = parseInt(next(), 10);
    else if (a === "--out" || a === "-o") out.out = path.resolve(next());
    else if (a === "--scale") out.scale = parseFloat(next());
    else if (a === "--data" || a === "-d") out.data = path.resolve(next());
    else if (a === "--colors" || a === "-c") out.colors = next();
    else if (a === "--json") out.json = true;
    else if (a === "--help" || a === "-h") out.help = true;
    else if (!a.startsWith("-")) out.variant = a;
  }
  return out;
}

function usage() {
  console.log(`Job poster generator

Usage: node generate.js [variant] [options]

  variant           2, 4, 5 or "all"        (default 4)
  -n, --limit N     max posters to render   (default 0 = all)
  -s, --start N     skip first N records    (default 0)
  -o, --out DIR     output directory        (default ./out)
      --scale N     device scale factor     (default 1; 2 = 2160x2160)
  -d, --data FILE   jobs JSON path          (default ./jobs.json)
  -c, --colors L    variant 4 palettes: all, names, or 1-based indexes
                    e.g. --colors all | --colors purple,teal | --colors 1,4
      --json        print mapped data, do not render
      --help        show this help

Examples:
  node generate.js 4 --limit 5
  node generate.js 4 --colors all --limit 3 --scale 2
  node generate.js all --limit 3
`);
}

function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function uniq(arr) {
  return [...new Set(arr)];
}

function boldKeywords(text) {
  let out = esc(text);
  for (const kw of KEYWORDS) {
    const re = new RegExp("(^|[^A-Za-z0-9])(" + kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + ")(?![A-Za-z0-9])", "i");
    out = out.replace(re, (m, pre, hit) => pre + "<strong>" + hit + "</strong>");
  }
  return out;
}

function clip(text, max) {
  const s = String(text).replace(/\s+/g, " ").trim();
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  const sp = cut.lastIndexOf(" ");
  return (sp > max * 0.6 ? cut.slice(0, sp) : cut).trim() + "…";
}

function extractSkills(text) {
  const found = [];
  for (const kw of KEYWORDS) {
    const re = new RegExp("(^|[^A-Za-z0-9])(" + kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + ")(?![A-Za-z0-9])", "i");
    if (re.test(text)) found.push(kw);
    if (found.length >= 5) break;
  }
  return uniq(found);
}

const HEADER_RE = /^(about( the)? (company|us|role|team)|job description|job summary|job overview|job details|role overview|key responsibilities|responsibilities|roles? (and|&) responsibilities|requirements?|skills?( set| required)?|preferred( qualifications| skills)?|key skills|technical skills|what you(?:'|’)?ll do|what we(?:'|’)?re looking for|benefits?|perks?|why join.*|job title|company name|location|job type|shift( timing)?|experience|salary|compensation|department|reporting to|notice period|how to apply|walk[- ]?in( date| time)?|job published|contact email|brief description|eligibility)\b/i;

function isHeader(line) {
  const s = line.trim();
  if (!s || s.length > 42) return false;
  if (HEADER_RE.test(s)) return true;
  if (/[.!?]$/.test(s)) return false;
  if (s.split(/\s+/).length > 5) return false;
  return /^[A-Z0-9]/.test(s) && /^[A-Za-z0-9 &/,'’()+-]+:?$/.test(s);
}

function parseJob(r, index) {
  const desc = String(r.description || "").replace(/\r/g, "");
  const lines = desc.split("\n").map((l) => l.trim()).filter(Boolean);

  const companyRaw = String(r.company || "").replace(/\s+/g, " ").trim();
  const recordRole = String(r.role || "").replace(/\s+/g, " ").trim();
  const roleUsable = recordRole.length >= 3 && recordRole.toLowerCase() !== companyRaw.toLowerCase();

  let title = "";
  if (roleUsable) {
    title = recordRole.split("|")[0].trim() || recordRole;
  } else {
    const mTitle = desc.match(/Job Title\s*:\s*(.+)/i);
    if (mTitle) title = mTitle[1].trim();
    if (!title) {
      title = lines.find((l) => l.length >= 3 && l.length <= 80 && !/https?:|@/.test(l) && !HEADER_RE.test(l)) || "";
    }
    if (!title) title = recordRole;
  }

  const grab = (re) => {
    const m = desc.match(re);
    return m ? m[1].replace(/\s+/g, " ").trim() : "";
  };

  const company = companyRaw || "Company";
  const locRaw = grab(/(?:^|\n)\s*(?:Location|Job Location)\s*:\s*(.+)/i).trim();
  const locValue = /^(in person|remote|hybrid|onsite|on-site)$/i.test(locRaw) ? "" : locRaw;
  const location = locValue || r.location || r.tech_park || "Kerala, India";
  const jobType = grab(/Job Type\s*:\s*(.+)/i) || r.job_type || "Full-time";
  const shift = grab(/Shift(?:\s*Timing)?\s*:\s*(.+)/i);
  const expMatch = desc.match(/(\d+\s*[-–]\s*\d+)\s*\+?\s*years?/i) || desc.match(/(\d+)\+?\s*years?/i);
  const experience = expMatch ? expMatch[1].replace(/\s+/g, " ").trim() + " years" : "";
  const workplace = /walk[- ]?in/i.test(desc) || r.is_walk_in ? "Walk-in" : /work from home|remote/i.test(desc) ? "Remote" : /hybrid/i.test(desc) ? "Hybrid" : "Onsite";

  let about = "";
  const mAbout = desc.match(/about (?:the )?company[^\n]*\n+([^\n]+)/i);
  if (mAbout && mAbout[1].trim().length > 40) about = mAbout[1].trim();

  const bullets = [];
  let section = "";
  for (const line of lines) {
    if (isHeader(line)) {
      section = line.toLowerCase();
      continue;
    }
    const bullet = /^[•▪◦●\-–*]\s+/.test(line) || /^\d{1,2}[.)]\s+/.test(line);
    const clean = line.replace(/^[•▪◦●\-–*]\s+/, "").replace(/^\d{1,2}[.)]\s+/, "").trim();
    if (!clean || clean.length < 18) continue;
    if (clean.includes("@") || /https?:/i.test(clean)) continue;
    if (/^(the candidate|our expectation|we are looking|we(?:'|’)?re looking|if this opportunity)/i.test(clean)) continue;
    const wanted = /responsib|requirement|skill|qualification|duties|expectation|what you|looking for/.test(section) && !/overview|about/.test(section);
    if (bullet || wanted) bullets.push(clean);
  }

  if (bullets.length < 3) {
    const sentences = desc.replace(/\n+/g, " ").split(/(?<=[.!?])\s+/);
    for (const s of sentences) {
      const t = s.trim();
      if (t.length < 35 || t.length > 180) continue;
      if (HEADER_RE.test(t) || bullets.includes(t)) continue;
      if (/^(we are looking|we(?:'|’)?re looking|the candidate|if this opportunity|about |our expectation)/i.test(t)) continue;
      if (t.includes("@") || /https?:/i.test(t)) continue;
      bullets.push(t);
      if (bullets.length >= 6) break;
    }
  }

  const requirements = uniq(bullets)
    .filter((b) => b.length >= 18)
    .slice(0, 6)
    .map((b) => clip(b, 118));

  return {
    index,
    id: r.id || String(index),
    company,
    role: clip(title, 64).replace(/…$/, ""),
    tagline: r.tech_park ? "Now hiring · " + r.tech_park : "Now hiring",
    summary: about || (company + " is hiring a " + clip(title, 48) + " to join the team in " + clip(location, 40) + "."),
    location: clip(location, 56),
    jobType: clip(jobType, 32),
    workplace: workplace + (shift ? " · " + clip(shift, 20) : ""),
    experience: clip(experience || "Not specified", 32),
    email: r.email || "",
    techPark: r.tech_park || "",
    deadline: r.deadline || "",
    scrapedAt: r.scraped_at || "",
    postedDate: r.posted_date || "",
    link: r.link_canon || r.link || "",
    requirements,
    skills: extractSkills(desc),
    rawText: desc
  };
}

function accentWord(role) {
  const base = String(role).replace(/\([^)]*\)/g, "").trim() || String(role);
  const words = base.replace(/[()]/g, "").split(/\s+/).filter(Boolean);
  if (!words.length) return "";
  for (const kw of KEYWORDS) {
    const hit = words.find((w) => w.toLowerCase() === kw.toLowerCase());
    if (hit) return hit;
  }
  return words[words.length - 1];
}

function themeFor(variant, index) {
  const list = THEMES[variant];
  const { name, ...theme } = list[index % list.length];
  return theme;
}

function toVariant(job, variant, themeOverride) {
  const req = job.requirements.length ? job.requirements : ["Relevant experience in a similar role", "Strong communication and problem-solving skills", "Ability to work independently and in a team"];
  const cta = "Apply Now";
  const skills = job.skills.length ? job.skills : [job.techPark, "Communication", "Problem Solving"].filter(Boolean);

  if (variant === 1) {
    return {
      company: job.company,
      logoLetter: (job.company[0] || "?").toUpperCase(),
      tagline: job.tagline,
      role: esc(job.role),
      roleAccentWord: accentWord(job.role),
      location: job.location,
      experience: job.experience,
      education: "",
      email: job.email,
      cta,
      requirements: req.slice(0, 4).map(boldKeywords),
      skills: skills.slice(0, 5),
      heroImage: "",
      theme: themeFor(1, job.index)
    };
  }

  if (variant === 2) {
    return {
      company: job.company,
      role: job.role,
      location: job.location,
      cta: "Join Our Team",
      requirements: req.slice(0, 3),
      social: ["Be", "in", "Ig", "X"],
      theme: themeFor(2, job.index)
    };
  }

  if (variant === 3) {
    return {
      company: job.company,
      logoLetter: (job.company[0] || "?").toUpperCase(),
      tagline: job.tagline,
      role: esc(job.role),
      roleAccentWord: accentWord(job.role),
      location: job.location,
      experience: job.experience,
      employmentType: job.jobType,
      email: job.email,
      cta,
      requirements: req.slice(0, 6).map(boldKeywords),
      heroImage: "",
      theme: themeFor(3, job.index)
    };
  }

  if (variant === 4) {
    return {
      company: job.company,
      logoLetter: (job.company[0] || "?").toUpperCase(),
      tagline: job.tagline,
      role: job.role,
      heroSub: clip(job.summary || (job.company + " is hiring a " + job.role + "."), 150),
      location: job.location,
      experience: job.experience,
      employmentType: job.jobType,
      workplace: job.workplace,
      email: job.email,
      cta,
      requirements: req.slice(0, 5).map(boldKeywords),
      chips: [
        { icon: "pin", label: job.location },
        { icon: "brief", label: job.experience },
        { icon: "tag", label: job.jobType },
        { icon: "home", label: job.workplace }
      ].map((c) => ({ icon: c.icon, label: esc(c.label) })),
      theme: themeOverride || themeFor(4, job.index)
    };
  }

  const facts = [
    { k: "Location", v: job.location },
    { k: "Experience", v: job.experience },
    { k: "Type", v: job.jobType },
    { k: "Workplace", v: job.workplace },
    job.deadline ? { k: "Apply by", v: job.deadline } : null
  ].filter(Boolean);

  return {
    company: job.company,
    issue: "№ " + String(job.index + 1).padStart(3, "0") + " · " + (job.techPark || "Careers") + " Edition",
    dateLabel: String(new Date().getFullYear()),
    role: esc(job.role),
    roleItalicWord: accentWord(job.role),
    lede: clip(job.summary || (job.company + " is looking for a " + job.role + " to join the team in " + job.location + "."), 220),
    requirements: req.slice(0, 6).map(boldKeywords),
    facts: facts.map((f) => ({ k: esc(f.k), v: esc(f.v) })),
    email: job.email,
    cta: "Apply",
    ctaText: job.email ? "Write to us at " + job.email + " — we'd love to read your note." : "If this sounds like you, we'd love to read your note.",
    theme: themeFor(5, job.index)
  };
}

function resolvePalettes(spec, variants) {
  if (!spec || !variants.includes(4)) return null;
  const all = THEMES[4];
  const idx = [];
  for (const part of spec.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean)) {
    if (part === "all") return all.map((_, i) => i);
    const n = parseInt(part, 10);
    if (!isNaN(n) && n >= 1 && n <= all.length) idx.push(n - 1);
    else {
      const k = all.findIndex((t) => t.name.toLowerCase() === part);
      if (k >= 0) idx.push(k);
    }
  }
  return idx.length ? [...new Set(idx)] : null;
}

function slug(s) {
  return String(s)
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "job";
}

function inject(variant, data) {
  const src = fs.readFileSync(path.join(POSTER_DIR, "variant-" + variant + ".html"), "utf8");
  const payload = JSON.stringify(data).replace(/</g, "\\u003c").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
  const idx = src.indexOf("<script>");
  if (idx === -1) throw new Error("no <script> in variant-" + variant);
  return src.slice(0, idx) + "<script>window.POSTER_DATA = " + payload + ";</script>\n" + src.slice(idx);
}

function render(html, outFile, scale) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "poster-"));
  const htmlFile = path.join(tmpDir, "poster.html");
  fs.writeFileSync(htmlFile, html);
  const args = [
    "--headless",
    "--disable-gpu",
    "--no-sandbox",
    "--hide-scrollbars",
    "--allow-file-access-from-files",
    "--force-device-scale-factor=" + scale,
    "--window-size=1080,1080",
    "--virtual-time-budget=4000",
    "--screenshot=" + outFile,
    "file://" + htmlFile
  ];
  const res = spawnSync(CHROME, args, { encoding: "utf8" });
  fs.rmSync(tmpDir, { recursive: true, force: true });
  if (res.error) throw res.error;
  if (res.status !== 0) throw new Error("chrome exited " + res.status + "\n" + (res.stderr || ""));
}

function renderJob(job, opts) {
  const { variant = 4, paletteIndex = null, outFile, scale = 1 } = opts || {};
  let theme = null;
  if (variant === 4 && paletteIndex != null) {
    const { name, ...t } = THEMES[4][paletteIndex % THEMES[4].length];
    theme = t;
  }
  const data = toVariant(job, variant, theme);
  render(inject(variant, data), outFile, scale);
  return data;
}

function instagramTitle(job) {
  const role = String(job.role || "").replace(/\s*\([^)]*\)\s*/g, " ").replace(/\s+/g, " ").trim();
  let title = "Hiring: " + role + " at " + job.company;
  const city = String(job.location || "").split(",")[0].trim();
  if (city) title += " · " + city;
  return clip(title, 125);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) return usage();

  if (!fs.existsSync(args.data)) {
    console.error("Jobs data not found:", args.data);
    process.exit(1);
  }

  let jobs;
  try {
    jobs = JSON.parse(fs.readFileSync(args.data, "utf8"));
  } catch (e) {
    console.error("Failed to parse", args.data, "-", e.message);
    process.exit(1);
  }
  if (!Array.isArray(jobs)) {
    console.error("Expected a JSON array in", args.data);
    process.exit(1);
  }

  const variants = args.variant === "all" ? [2, 4, 5] : [parseInt(args.variant, 10)];
  if (variants.some((v) => ![2, 4, 5].includes(v))) {
    console.error("Variant must be 2, 4, 5 or all");
    process.exit(1);
  }

  const selected = jobs.slice(args.start, args.limit > 0 ? args.start + args.limit : undefined);
  fs.mkdirSync(args.out, { recursive: true });

  const palettes = resolvePalettes(args.colors, variants);
  if (args.colors && !palettes) {
    console.error("No matching palettes for --colors", args.colors);
    process.exit(1);
  }

  if (args.json) {
    const job = parseJob(selected[0], args.start);
    const key = (v, p) => (p ? "v" + v + ":" + p : "v" + v);
    const out = {};
    for (const v of variants) {
      if (v === 4) for (const pi of palettes || [job.index % THEMES[4].length]) out[key(4, THEMES[4][pi].name)] = toVariant(job, 4, themeFor(4, pi));
      else out[key(v)] = toVariant(job, v);
    }
    console.log(JSON.stringify({ parsed: job, variants: out }, null, 2));
    return;
  }

  let count = 0;
  for (let i = 0; i < selected.length; i++) {
    const job = parseJob(selected[i], args.start + i);
    const jobsToRender = [];
    for (const v of variants) {
      if (v === 4) {
        for (const pi of palettes || [job.index % THEMES[4].length]) {
          const { name: pname, ...theme } = THEMES[4][pi];
          jobsToRender.push({ v, data: toVariant(job, 4, theme), palette: pname });
        }
      } else {
        jobsToRender.push({ v, data: toVariant(job, v), palette: "" });
      }
    }
    for (const item of jobsToRender) {
      const name = "v" + item.v + "-" + slug(job.company) + "-" + slug(job.role) +
        (item.palette ? "-" + item.palette : "") + "-" + job.id.slice(0, 8) + ".png";
      const outFile = path.join(args.out, name);
      try {
        render(inject(item.v, item.data), outFile, args.scale);
        count++;
        console.log("✓", path.relative(ROOT, outFile));
      } catch (e) {
        console.error("✗", name, "-", e.message.split("\n")[0]);
      }
    }
  }
  console.log("\nRendered " + count + " poster(s) to " + path.relative(ROOT, args.out));
}

if (require.main === module) main();

module.exports = {
  parseJob,
  toVariant,
  renderJob,
  inject,
  render,
  themeFor,
  instagramTitle,
  THEMES,
  slug,
  clip
};
