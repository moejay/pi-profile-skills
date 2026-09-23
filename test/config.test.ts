import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { loadProfiles, readProfiles, writeProfile } from "../lib/config.ts";

function jsonFile(name: string, value: unknown): string {
  const dir = mkdtempSync(join(tmpdir(), "pi-profile-"));
  const path = join(dir, name);
  writeFileSync(path, JSON.stringify(value));
  return path;
}

test("reads and normalizes profiles", () => {
  const path = jsonFile("profiles.json", {
    dev: { skills: [" skill-a ", "skill-a", "skill-b"], instructions: "Be precise." },
  });

  assert.deepEqual(readProfiles(path), {
    dev: { skills: ["skill-a", "skill-b"], prompt: "Be precise." },
  });
});

test("project profiles override global profiles", () => {
  const globalPath = jsonFile("global.json", {
    dev: { skills: ["global-skill"] },
    review: { skills: ["review-skill"] },
  });
  const projectPath = jsonFile("project.json", {
    dev: { skills: ["project-skill"] },
  });

  assert.deepEqual(loadProfiles(globalPath, projectPath), {
    dev: { skills: ["project-skill"] },
    review: { skills: ["review-skill"] },
  });
});

test("writes profiles without discarding existing profiles", () => {
  const path = jsonFile("profiles.json", { review: { skills: ["review-skill"] } });

  writeProfile(path, "dev", { skills: ["dev-skill"], prompt: "Build it." });

  assert.deepEqual(JSON.parse(readFileSync(path, "utf8")), {
    review: { skills: ["review-skill"] },
    dev: { skills: ["dev-skill"], prompt: "Build it." },
  });
});

test("rejects malformed skill lists", () => {
  const path = jsonFile("profiles.json", { dev: { skills: [""] } });
  assert.throws(() => readProfiles(path), /skills array of non-empty names/);
});
