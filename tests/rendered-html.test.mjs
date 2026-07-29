import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server-renders the Paper + Paint calculator", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>Paper \+ Paint/);
  assert.match(html, /From screen to/);
  assert.match(html, /Enter your Adobe color/);
  assert.match(html, /Your mix recipe/);
  assert.match(html, /Calibrate with your dried swatches/);
  assert.match(html, /Your paper color/);
  assert.match(html, /Thin coats/);
  assert.match(html, /Make a small correction/);
  assert.match(html, /Copy recipe/);
  assert.match(html, /Save image/);
  assert.match(html, /Share project link/);
  assert.match(html, /Master(?:&#x27;|')s Touch/);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape/);
});

test("keeps the calculator client-side and GitHub Pages-ready", async () => {
  const [calculator, workflow, packageJson] = await Promise.all([
    readFile(new URL("../app/paint-calculator.tsx", import.meta.url), "utf8"),
    readFile(new URL("../.github/workflows/deploy-pages.yml", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);

  assert.match(calculator, /^"use client";/);
  assert.match(calculator, /PALETTE_KEY/);
  assert.match(calculator, /Phthalocyanine Blue/);
  assert.match(calculator, /Titanium White/);
  assert.match(calculator, /cmyk\[channel\] === 0 \? "" : cmyk\[channel\]/);
  assert.match(calculator, /placeholder="0"/);
  assert.match(calculator, /allocateExactDrops/);
  assert.match(calculator, /getMatchQuality/);
  assert.match(calculator, /paper-paint-session-v2|SESSION_KEY/);
  assert.match(calculator, /serviceWorker\.register/);
  assert.match(workflow, /actions\/deploy-pages@v4/);
  assert.match(packageJson, /"build:pages": "next build"/);
});

test("ships an installable offline app", async () => {
  const [manifestText, worker, icon192, icon512] = await Promise.all([
    readFile(new URL("../public/manifest.webmanifest", import.meta.url), "utf8"),
    readFile(new URL("../public/sw.js", import.meta.url), "utf8"),
    stat(new URL("../public/icon-192.png", import.meta.url)),
    stat(new URL("../public/icon-512.png", import.meta.url)),
  ]);
  const manifest = JSON.parse(manifestText);

  assert.equal(manifest.display, "standalone");
  assert.equal(manifest.start_url, "./");
  assert.match(worker, /paper-paint-v3/);
  assert.match(worker, /caches\.match/);
  assert.match(worker, /matchAll/);
  assert.ok(icon192.size > 1000);
  assert.ok(icon512.size > 1000);
});
