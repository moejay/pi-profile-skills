import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export interface Profile {
  skills: string[];
  prompt?: string;
}

export type Profiles = Record<string, Profile>;

function parseProfile(name: string, value: unknown, source: string): Profile {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${source}: profile "${name}" must be an object`);
  }

  const candidate = value as Record<string, unknown>;
  if (!Array.isArray(candidate.skills) || candidate.skills.some((skill) => typeof skill !== "string" || !skill.trim())) {
    throw new Error(`${source}: profile "${name}" must have a skills array of non-empty names`);
  }
  const prompt = candidate.prompt ?? candidate.instructions;
  if (prompt !== undefined && typeof prompt !== "string") {
    throw new Error(`${source}: profile "${name}" prompt must be a string`);
  }

  return {
    skills: [...new Set(candidate.skills.map((skill) => skill.trim()))],
    ...(prompt ? { prompt } : {}),
  };
}

export function readProfiles(path: string): Profiles {
  if (!existsSync(path)) return {};

  const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`${path}: expected an object keyed by profile name`);
  }

  return Object.fromEntries(
    Object.entries(parsed).map(([name, value]) => {
      if (!name.trim()) throw new Error(`${path}: profile names cannot be empty`);
      return [name, parseProfile(name, value, path)];
    }),
  );
}

export function loadProfiles(globalPath: string, projectPath?: string): Profiles {
  return {
    ...readProfiles(globalPath),
    ...(projectPath ? readProfiles(projectPath) : {}),
  };
}

export function writeProfile(path: string, name: string, profile: Profile): void {
  const profiles = readProfiles(path);
  profiles[name] = profile;

  mkdirSync(dirname(path), { recursive: true });
  const temporaryPath = `${path}.${process.pid}.tmp`;
  writeFileSync(temporaryPath, `${JSON.stringify(profiles, null, 2)}\n`, { mode: 0o600 });
  renameSync(temporaryPath, path);
}
