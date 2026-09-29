"use strict";

const { spawnSync } = require("node:child_process");
const path = require("node:path");

// Render's existing Node build runs `yarn`; the postinstall hook provisions
// pinned translation artifacts in that build image only. Local installs stay
// untouched unless explicitly running in Render's build environment.
if (process.env.RENDER !== "true" || process.env.RENDER_SERVICE_NAME !== "liude-xiaozhan-mp-backend") {
  console.log("Skipping offline translation provisioning outside Render.");
  process.exit(0);
}

const root = path.resolve(__dirname, "..");
const python = process.env.PYTHON || "python3";
function run(args) {
  const result = spawnSync(python, args, { cwd: root, stdio: "inherit", env: process.env });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Offline translation build step failed (${args[0]}).`);
}

try {
  run([
    "-m", "pip", "install", "--disable-pip-version-check", "--no-cache-dir", "--target", ".offline-deps",
    "ctranslate2==4.8.2", "sentencepiece==0.2.2", "numpy==2.5.3", "pyyaml==6.0.3"
  ]);
  run(["scripts/install_offline_translation.py"]);
  console.log("Offline translation runtime and SHA-256-pinned models are ready.");
} catch {
  console.error("Could not provision the offline translation runtime. The existing live deploy remains active.");
  process.exit(1);
}
