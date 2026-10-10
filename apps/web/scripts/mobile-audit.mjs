// Dev-only: renders routes in headless Chrome at iPhone 11 size through the
// DevTools protocol (no npm dependencies; needs Node >= 20.10 with
// --experimental-websocket, or Node >= 22) and reports horizontal overflow,
// too-small inputs and too-small tap targets. Signed-out states only.
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const BASE = process.env.AUDIT_BASE_URL ?? "http://localhost:3000";
const OUT = path.resolve(process.env.AUDIT_OUT_DIR ?? "audit-out");
const PORT = Number(process.env.AUDIT_DEBUG_PORT ?? 9333);
const WIDTH = Number(process.env.AUDIT_WIDTH ?? 414);
const HEIGHT = Number(process.env.AUDIT_HEIGHT ?? 896);
const CHROME =
  process.env.CHROME_PATH ??
  [
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  ].find(existsSync);

const ROUTES = (process.env.AUDIT_ROUTES?.split(",") ?? [
  "/dashboard", "/lookup", "/vocab-bank", "/practice",
  "/reading", "/reading/bilingual", "/reading/part5", "/reading/part6", "/reading/part7",
  "/word-radar", "/knowledge", "/knowledge/new", "/listening", "/listening/dictation",
  "/listening/comprehension", "/interview", "/conversation", "/settings",
]).map((r) => r.trim());

const MEASURE = `(() => {
  const vw = document.documentElement.clientWidth;
  const offenders = [];
  for (const el of document.querySelectorAll("body *")) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    if (r.right > vw + 1 || r.left < -1) {
      let p = el.parentElement, clipped = false;
      while (p && p !== document.body) {
        const s = getComputedStyle(p);
        if (["auto", "scroll", "hidden", "clip"].includes(s.overflowX) && p.getBoundingClientRect().right <= vw + 1) { clipped = true; break; }
        p = p.parentElement;
      }
      if (!clipped) offenders.push({ tag: el.tagName.toLowerCase(), cls: String(el.className).slice(0, 80), left: Math.round(r.left), right: Math.round(r.right) });
    }
  }
  const smallInputs = [...document.querySelectorAll('input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=file]),textarea,select')]
    .filter((e) => parseFloat(getComputedStyle(e).fontSize) < 16).length;
  const smallTargets = [...document.querySelectorAll("button,a[href],input,select,textarea")]
    .filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && (r.height < 44 || r.width < 44); }).length;
  return { vw, scrollWidth: document.documentElement.scrollWidth, overflowX: document.documentElement.scrollWidth > vw, offenders: offenders.slice(0, 12), smallInputs, smallTargets };
})()`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitForTarget() {
  for (let i = 0; i < 60; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      const page = list.find((t) => t.type === "page");
      if (page) return page.webSocketDebuggerUrl;
    } catch {
      /* chrome not up yet */
    }
    await sleep(500);
  }
  throw new Error("Chrome DevTools target did not appear");
}

function connect(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    let id = 0;
    const pending = new Map();
    ws.onmessage = (e) => {
      const m = JSON.parse(e.data);
      if (m.id && pending.has(m.id)) {
        pending.get(m.id)(m);
        pending.delete(m.id);
      }
    };
    ws.onerror = reject;
    ws.onopen = () =>
      resolve({
        send: (method, params = {}) =>
          new Promise((r) => {
            const i = ++id;
            pending.set(i, r);
            ws.send(JSON.stringify({ id: i, method, params }));
          }),
        close: () => ws.close(),
      });
  });
}

async function evaluate(cdp, expression) {
  const res = await cdp.send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  return res.result?.result?.value;
}

async function load(cdp, route) {
  await cdp.send("Page.navigate", { url: BASE + route });
  for (let i = 0; i < 120; i++) {
    if ((await evaluate(cdp, "document.readyState")) === "complete") break;
    await sleep(500);
  }
  await sleep(2500); // let client components render
}

async function shot(cdp, name) {
  const { result } = await cdp.send("Page.captureScreenshot", { format: "png" });
  writeFileSync(path.join(OUT, `${name}.png`), Buffer.from(result.data, "base64"));
}

if (!CHROME) throw new Error("No Chrome/Edge found; set CHROME_PATH");
mkdirSync(OUT, { recursive: true });
const profile = mkdtempSync(path.join(tmpdir(), "mobile-audit-"));
const chrome = spawn(CHROME, [
  "--headless=new", `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
  "--no-first-run", "--disable-gpu", "about:blank",
], { stdio: "ignore" });

const results = [];
try {
  const cdp = await connect(await waitForTarget());
  await cdp.send("Page.enable");
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width: WIDTH, height: HEIGHT, deviceScaleFactor: 2, mobile: true,
  });
  await cdp.send("Emulation.setUserAgentOverride", {
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
  });

  for (const route of ROUTES) {
    await load(cdp, route);
    const m = await evaluate(cdp, MEASURE);
    const slug = route.replace(/^\//, "").replace(/\//g, "_") || "root";
    await shot(cdp, slug);
    results.push({ route, ...m });
  }

  // The "Thêm" sheet.
  await load(cdp, "/dashboard");
  await evaluate(cdp, `document.querySelector(".mtab-more")?.click()`);
  await sleep(500);
  await shot(cdp, "more-sheet");
  cdp.close();
} finally {
  chrome.kill();
}

writeFileSync(path.join(OUT, "report.json"), JSON.stringify(results, null, 2));
let failed = false;
for (const r of results) {
  const bad = r.overflowX || r.smallInputs > 0;
  failed ||= bad;
  console.log(
    `${bad ? "FAIL" : "ok  "} ${r.route.padEnd(28)} scrollW=${r.scrollWidth}/${r.vw} smallInputs=${r.smallInputs} smallTargets=${r.smallTargets}` +
      (r.offenders.length ? `\n      offenders: ${JSON.stringify(r.offenders.slice(0, 5))}` : "")
  );
}
console.log(`screenshots + report.json in ${OUT}`);
process.exit(failed ? 1 : 0);
