import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { extname } from "node:path";
import { describe, expect, it } from "vitest";

const textExtensions = new Set([".css", ".html", ".js", ".json", ".md", ".mjs", ".rs", ".toml", ".ts", ".tsx"]);
const trackedFiles = execFileSync("git", ["ls-files"], { encoding: "utf8" })
  .split("\n")
  .filter((path) => path && existsSync(path));

describe("public source tree", () => {
  it("does not track private CV sources or runtime data", () => {
    expect(trackedFiles.filter((path) => /(^|\/)(archive|exports|user-data)\//.test(path))).toEqual([]);
    expect(trackedFiles.filter((path) => /(^|\/)(source-cvs|source-assets)\//.test(path))).toEqual([]);
    expect(trackedFiles.filter((path) => /cv-portfolio(?:-[a-z]{2})?\.pdf$/i.test(path))).toEqual([]);
  });

  it("does not embed a developer home path or real contact email", () => {
    const findings: string[] = [];
    for (const path of trackedFiles) {
      if (!textExtensions.has(extname(path)) || path.startsWith("shared/codex-protocol/")) continue;
      const source = readFileSync(path, "utf8");
      if (/\/home\/[a-z0-9._-]+\//i.test(source)) findings.push(`${path}: home path`);
      const emails = source.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || [];
      if (emails.some((email) => !email.endsWith("@example.com") && !email.endsWith("@users.noreply.github.com"))) findings.push(`${path}: contact email`);
    }
    expect(findings).toEqual([]);
  });
});
