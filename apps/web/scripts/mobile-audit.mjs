// Dev-only: renders routes in headless Chrome at iPhone 11 size through the
// DevTools protocol (no npm dependencies; needs Node >= 20.10 with
// --experimental-websocket, or Node >= 22) and reports horizontal overflow,
// too-small inputs and too-small tap targets. Signed-out states only: every
// route renders just its heading and the sign-in prompt, so it cannot verify
// content-dependent layout (see the task report).
//
// AUDIT_SELFTEST=1 additionally injects a 900px-wide element into .main and
// exits non-zero unless the overflow detector flags it.
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";

const BASE = process.env.AUDIT_BASE_URL ?? "http://localhost:3000";
const OUT = path.resolve(process.env.AUDIT_OUT_DIR ?? "audit-out");
const WIDTH = Number(process.env.AUDIT_WIDTH ?? 414);
const HEIGHT = Number(process.env.AUDIT_HEIGHT ?? 896);
const SELFTEST = process.env.AUDIT_SELFTEST === "1";
const SEND_TIMEOUT_MS = 30000;
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

// .app-frame is overflow:hidden and .main is overflow-y:auto (which forces
// overflow-x:auto), so they hide overflow from documentElement.scrollWidth and
// must never count as a legitimate clipping container: check their own
// scrollWidth instead.
const MEASURE = `(() => {
  const vw = document.documentElement.clientWidth;
  const main = document.querySelector(".main");
  const frame = document.querySelector(".app-frame");
  const shell = (p) => p === document.body || p === document.documentElement || p === main || p === frame;
  const offenders = [];
  for (const el of document.querySelectorAll("body *")) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    if (r.right > vw + 1 || r.left < -1) {
      let p = el.parentElement, clipped = false;
      while (p && p !== document.body) {
        if (!shell(p)) {
          const s = getComputedStyle(p);
          if (["auto", "scroll", "hidden", "clip"].includes(s.overflowX) && p.getBoundingClientRect().right <= vw + 1) { clipped = true; break; }
        }
        p = p.parentElement;
      }
      if (!clipped) offenders.push({ tag: el.tagName.toLowerCase(), cls: String(el.className).slice(0, 80), left: Math.round(r.left), right: Math.round(r.right) });
    }
  }
  const smallInputs = [...document.querySelectorAll('input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=file]),textarea,select')]
    .filter((e) => parseFloat(getComputedStyle(e).fontSize) < 16).length;
  const smallTargets = [...document.querySelectorAll("button,a[href],input,select,textarea")]
    .filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && (r.height < 44 || r.width < 44); }).length;
  const docScrollWidth = document.documentElement.scrollWidth;
  const mainOverflowX = main ? main.scrollWidth > main.clientWidth + 1 : false;
  const frameOverflowX = frame ? frame.scrollWidth > frame.clientWidth + 1 : false;
  return {
    href: location.href, vw, noShell: !main || !frame,
    scrollWidth: Math.max(docScrollWidth, main ? main.scrollWidth : 0, frame ? frame.scrollWidth : 0),
    docOverflowX: docScrollWidth > vw, mainOverflowX, frameOverflowX,
    offenders: offenders.slice(0, 12), offenderCount: offenders.length, smallInputs, smallTargets,
  };
})()`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function freePort() {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.once("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

async function waitForTarget(port) {
  for (let i = 0; i < 60; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
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
    const rejectAll = (err) => {
      for (const { reject: rej, timer } of pending.values()) {
        clearTimeout(timer);
        rej(err);
      }
      pending.clear();
    };
    ws.onmessage = (e) => {
      const m = JSON.parse(e.data);
      const p = m.id && pending.get(m.id);
      if (p) {
        clearTimeout(p.timer);
        pending.delete(m.id);
        if (m.error) p.reject(new Error(`${p.method}: ${m.error.message}`));
        else p.resolve(m);
      }
    };
    ws.onerror = () => {
      const err = new Error("DevTools socket error");
      reject(err);
      rejectAll(err);
    };
    ws.onclose = () => rejectAll(new Error("DevTools socket closed"));
    ws.onopen = () =>
      resolve({
        send: (method, params = {}) =>
          new Promise((res, rej) => {
            const i = ++id;
            const timer = setTimeout(() => {
              pending.delete(i);
              rej(new Error(`${method}: timed out after ${SEND_TIMEOUT_MS}ms`));
            }, SEND_TIMEOUT_MS);
            pending.set(i, { resolve: res, reject: rej, timer, method });
            try {
              ws.send(JSON.stringify({ id: i, method, params }));
            } catch (err) {
              clearTimeout(timer);
              pending.delete(i);
              rej(err);
            }
          }),
        close: () => ws.close(),
      });
  });
}

async function evaluate(cdp, expression) {
  const res = await cdp.send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (res.result?.exceptionDetails) {
    throw new Error(`page expression threw: ${res.result.exceptionDetails.text ?? "unknown"}`);
  }
  return res.result?.result?.value;
}

async function load(cdp, route) {
  const nav = await cdp.send("Page.navigate", { url: BASE + route });
  if (nav.result?.errorText) throw new Error(`navigation failed: ${nav.result.errorText}`);
  let ready = false;
  for (let i = 0; i < 120; i++) {
    if ((await evaluate(cdp, "document.readyState")) === "complete") {
      ready = true;
      break;
    }
    await sleep(500);
  }
  if (!ready) throw new Error("page never reached readyState=complete");
  await sleep(2500); // let client components render
  const href = await evaluate(cdp, "location.href");
  if (typeof href !== "string" || !href.startsWith(BASE)) throw new Error(`route did not load (location=${href})`);
}

async function measure(cdp) {
  const m = await evaluate(cdp, MEASURE);
  if (!m || typeof m !== "object") throw new Error("measurement returned no data");
  return m;
}

async function shot(cdp, name) {
  const { result } = await cdp.send("Page.captureScreenshot", { format: "png" });
  writeFileSync(path.join(OUT, `${name}.png`), Buffer.from(result.data, "base64"));
}

if (!CHROME) throw new Error("No Chrome/Edge found; set CHROME_PATH");
mkdirSync(OUT, { recursive: true });
const PORT = Number(process.env.AUDIT_DEBUG_PORT ?? (await freePort()));
const profile = mkdtempSync(path.join(tmpdir(), "mobile-audit-"));
const chrome = spawn(CHROME, [
  "--headless=new", `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
  "--no-first-run", "--disable-gpu", "about:blank",
], { stdio: "ignore" });

const results = [];
let sheet = null;
let selftest = null;
try {
  const cdp = await connect(await waitForTarget(PORT));
  await cdp.send("Page.enable");
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width: WIDTH, height: HEIGHT, deviceScaleFactor: 2, mobile: true,
  });
  await cdp.send("Emulation.setUserAgentOverride", {
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
  });

  for (const route of ROUTES) {
    const slug = route.replace(/^\//, "").replace(/\//g, "_") || "root";
    try {
      await load(cdp, route);
      const m = await measure(cdp);
      await shot(cdp, slug);
      results.push({ route, ...m });
    } catch (err) {
      results.push({ route, error: String(err?.message ?? err) });
    }
  }

  // The "Thêm" sheet: must open and sit above the tab bar.
  try {
    await load(cdp, "/dashboard");
    sheet = await evaluate(cdp, `(() => {
      const btn = document.querySelector(".mtab-more");
      if (!btn) return { error: "no .mtab-more button" };
      btn.click();
      return new Promise((resolve) => setTimeout(() => {
        const s = document.querySelector(".mtab-sheet"), bar = document.querySelector(".mtab");
        if (!s || !bar) return resolve({ error: "sheet or tab bar missing" });
        const sr = s.getBoundingClientRect(), br = bar.getBoundingClientRect();
        resolve({ sheetBottom: Math.round(sr.bottom), barTop: Math.round(br.top), height: Math.round(sr.height), aboveBar: sr.height > 0 && sr.bottom <= br.top + 1 });
      }, 500));
    })()`);
    await shot(cdp, "more-sheet");
  } catch (err) {
    sheet = { error: String(err?.message ?? err) };
  }

  if (SELFTEST) {
    try {
      await load(cdp, "/dashboard");
      const clean = await measure(cdp);
      await evaluate(cdp, `(() => {
        const d = document.createElement("div");
        d.className = "audit-selftest";
        d.style.cssText = "width:900px;height:10px";
        document.querySelector(".main").appendChild(d);
      })()`);
      const dirty = await measure(cdp);
      const flagged = dirty.mainOverflowX && dirty.offenders.some((o) => String(o.cls).includes("audit-selftest"));
      selftest = { ok: flagged, cleanMainOverflowX: clean.mainOverflowX, mainOverflowX: dirty.mainOverflowX, scrollWidth: dirty.scrollWidth, docOverflowX: dirty.docOverflowX, offenders: dirty.offenders.slice(0, 3) };
    } catch (err) {
      selftest = { ok: false, error: String(err?.message ?? err) };
    }
  }
  cdp.close();
} finally {
  if (process.platform === "win32" && chrome.pid) {
    spawnSync("taskkill", ["/pid", String(chrome.pid), "/T", "/F"], { stdio: "ignore" });
  } else {
    chrome.kill();
  }
  await sleep(500);
  try {
    rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  } catch {
    /* best effort */
  }
}

writeFileSync(path.join(OUT, "report.json"), JSON.stringify({ results, sheet, selftest }, null, 2));
let failed = false;
for (const r of results) {
  if (r.error) {
    failed = true;
    console.log(`FAIL ${r.route.padEnd(28)} ${r.error}`);
    continue;
  }
  const bad = r.docOverflowX || r.mainOverflowX || r.frameOverflowX || r.offenderCount > 0 || r.smallInputs > 0 || r.noShell;
  failed ||= bad;
  console.log(
    `${bad ? "FAIL" : "ok  "} ${r.route.padEnd(28)} scrollW=${r.scrollWidth}/${r.vw} mainOverflowX=${r.mainOverflowX} frameOverflowX=${r.frameOverflowX}` +
      ` smallInputs=${r.smallInputs} smallTargets=${r.smallTargets}${r.noShell ? " NO-SHELL" : ""}` +
      (r.offenders.length ? `\n      offenders(${r.offenderCount}): ${JSON.stringify(r.offenders.slice(0, 5))}` : "")
  );
}
if (!sheet || sheet.error || !sheet.aboveBar) {
  failed = true;
  console.log(`FAIL Thêm sheet ${JSON.stringify(sheet)}`);
} else {
  console.log(`ok   Thêm sheet bottom=${sheet.sheetBottom} tabbarTop=${sheet.barTop} height=${sheet.height}`);
}
if (SELFTEST) {
  if (selftest?.ok) {
    console.log("selftest: detector flagged injected overflow " + JSON.stringify(selftest));
  } else {
    failed = true;
    console.log("selftest: FAILED, detector did NOT flag injected overflow " + JSON.stringify(selftest));
  }
}
console.log(`screenshots + report.json in ${OUT}`);
process.exit(failed ? 1 : 0);
