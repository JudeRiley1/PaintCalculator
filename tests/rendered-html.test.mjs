import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
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
  assert.match(calculator, /paper-paint-colors/);
  assert.match(calculator, /Phthalocyanine Blue/);
  assert.match(calculator, /Titanium White/);
  assert.match(workflow, /actions\/deploy-pages@v4/);
  assert.match(packageJson, /"build:pages": "next build"/);
});
