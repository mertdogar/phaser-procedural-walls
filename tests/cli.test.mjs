import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { fileURLToPath } from "node:url";

const cli = fileURLToPath(new URL("../bin/cli.mjs", import.meta.url));
test("CLI help and invalid arguments", () => {
  assert.equal(spawnSync(process.execPath, [cli, "--help"]).status, 0);
  for (const args of [["unknown"], ["editor", "--port", "abc"], ["editor", "--port", "65536"]]) {
    assert.equal(spawnSync(process.execPath, [cli, ...args]).status, 1);
  }
});

test("editor serves bundled assets from any working directory", { timeout: 10000 }, async () => {
  const child = spawn(process.execPath, [cli, "editor"], { cwd: "/", stdio: ["ignore", "pipe", "pipe"] });
  try {
    const [output] = await once(child.stdout, "data");
    const url = String(output).match(/http:\/\/127\.0\.0\.1:\d+\//)?.[0];
    assert.ok(url);
    const response = await fetch(url);
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.match(html, /Wallcraft/);
    const script = html.match(/src="([^"]+\.js)"/)?.[1];
    assert.ok(script);
    const asset = await fetch(new URL(script, url));
    assert.equal(asset.status, 200);
    assert.match(asset.headers.get("content-type"), /javascript/);
    assert.equal((await fetch(new URL("missing.js", url))).status, 404);
    assert.equal((await fetch(url, { method: "POST" })).status, 405);
    assert.equal((await fetch(new URL("/%2e%2e%2fpackage.json", url))).status, 403);
  } finally {
    child.kill();
    await once(child, "exit");
  }
});
