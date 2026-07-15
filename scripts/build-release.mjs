import { spawnSync } from "node:child_process";
import { readFileSync, readdirSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

const projectRoot = resolve(import.meta.dirname, "..");
const targetRoot = resolve(projectRoot, process.env.CARGO_TARGET_DIR || "src-tauri/target");
const releaseRoot = join(targetRoot, "release");
const bundleRoot = join(releaseRoot, "bundle");
const encodedFlags = [
  process.env.CARGO_ENCODED_RUSTFLAGS,
  `--remap-path-prefix=${projectRoot}=/build/roletailor`,
  `--remap-path-prefix=${homedir()}=/build/home`,
].filter(Boolean).join("\x1f");

rmSync(bundleRoot, { recursive: true, force: true });

const result = spawnSync("tauri", ["build", ...process.argv.slice(2)], {
  cwd: projectRoot,
  env: { ...process.env, CARGO_ENCODED_RUSTFLAGS: encodedFlags },
  stdio: "inherit",
});

if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);

const forbiddenPaths = [projectRoot, homedir()].map((value) => Buffer.from(value));

function filesBelow(root) {
  const files = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) files.push(...filesBelow(path));
    else if (entry.isFile()) files.push(path);
  }
  return files;
}

const rawBinary = join(releaseRoot, "roletailor");
const appImageRoot = join(bundleRoot, "appimage");
const debRoot = join(bundleRoot, "deb");
const appImageFiles = filesBelow(appImageRoot);
const debFiles = filesBelow(debRoot);
const appImageExecutables = appImageFiles.filter((path) => path.endsWith("/usr/bin/roletailor"));
const debExecutables = debFiles.filter((path) => path.endsWith("/data/usr/bin/roletailor"));
const appImages = appImageFiles.filter((path) => path.endsWith(".AppImage"));
const debPackages = debFiles.filter((path) => path.endsWith(".deb"));

for (const [label, paths] of Object.entries({
  "raw release binary": [rawBinary],
  "AppImage executable": appImageExecutables,
  "deb executable": debExecutables,
  "AppImage package": appImages,
  "deb package": debPackages,
})) {
  if (paths.length === 0) throw new Error(`Release build produced no ${label}.`);
}

for (const file of [rawBinary, ...appImageFiles, ...debFiles]) {
  const content = readFileSync(file);
  if (forbiddenPaths.some((value) => content.includes(value))) {
    throw new Error(`Release output contains an absolute local build path: ${file}`);
  }
}

console.log(`Release path audit passed across ${2 + appImageFiles.length + debFiles.length} files.`);
