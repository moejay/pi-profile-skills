import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  CONFIG_DIR_NAME,
  DynamicBorder,
  getAgentDir,
  getSettingsListTheme,
  type ExtensionAPI,
  type ExtensionCommandContext,
  type ExtensionContext,
  type Skill,
} from "@earendil-works/pi-coding-agent";
import {
  Container,
  type SelectItem,
  SelectList,
  type SettingItem,
  SettingsList,
  Text,
} from "@earendil-works/pi-tui";
import { loadProfiles, writeProfile, type Profile, type Profiles } from "../lib/config.ts";

const SECTION_NAME = "pi_skill_profile";
const CREATE_PROFILE = "\u0000create";

export default function profileExtension(pi: ExtensionAPI) {
  let profiles: Profiles = {};
  let globalPath = join(getAgentDir(), "profiles.json");
  let projectPath: string | undefined;
  let activeName: string | undefined;
  let activeProfile: Profile | undefined;
  const contents = new Map<string, string>();
  const reportedMissing = new Set<string>();

  pi.registerFlag("profile", {
    description: "Preload the skills from a named profile",
    type: "string",
  });

  function report(ctx: ExtensionContext, message: string, level: "info" | "warning" | "error") {
    if (ctx.hasUI) ctx.ui.notify(message, level);
    else console.error(message);
  }

  function reloadProfiles() {
    profiles = loadProfiles(globalPath, projectPath);
  }

  function activate(name: string, ctx: ExtensionContext): boolean {
    const profile = profiles[name];
    if (!profile) {
      const available = Object.keys(profiles).sort().join(", ") || "(none)";
      report(ctx, `Unknown profile "${name}". Available: ${available}`, "error");
      return false;
    }

    activeName = name;
    activeProfile = profile;
    reportedMissing.clear();
    ctx.ui.setStatus("profile", `profile:${name}`);
    return true;
  }

  async function selectItem(
    ctx: ExtensionCommandContext,
    title: string,
    items: SelectItem[],
  ): Promise<string | null> {
    return ctx.ui.custom<string | null>((tui, theme, _keybindings, done) => {
      const container = new Container();
      container.addChild(new DynamicBorder((text: string) => theme.fg("accent", text)));
      container.addChild(new Text(theme.fg("accent", theme.bold(title)), 1, 0));

      const list = new SelectList(items, Math.min(items.length, 14), {
        selectedPrefix: (text) => theme.fg("accent", text),
        selectedText: (text) => theme.fg("accent", text),
        description: (text) => theme.fg("muted", text),
        scrollInfo: (text) => theme.fg("dim", text),
        noMatch: (text) => theme.fg("warning", text),
      });
      list.onSelect = (item) => done(item.value);
      list.onCancel = () => done(null);
      container.addChild(list);
      container.addChild(new Text(theme.fg("dim", "↑↓ navigate • type to search • enter select • esc cancel"), 1, 0));
      container.addChild(new DynamicBorder((text: string) => theme.fg("accent", text)));

      return {
        render: (width) => container.render(width),
        invalidate: () => container.invalidate(),
        handleInput: (data) => {
          list.handleInput(data);
          tui.requestRender();
        },
      };
    });
  }

  async function selectSkills(ctx: ExtensionCommandContext, skills: Skill[]): Promise<string[] | null> {
    const selected = new Set<string>();
    const result = await ctx.ui.custom<"done" | null>((tui, theme, _keybindings, done) => {
      const items: SettingItem[] = skills.map((skill) => ({
        id: skill.name,
        label: skill.name,
        description: skill.description,
        currentValue: "off",
        values: ["on", "off"],
      }));
      const container = new Container();
      container.addChild(new DynamicBorder((text: string) => theme.fg("accent", text)));
      container.addChild(new Text(theme.fg("accent", theme.bold("Select skills to preload")), 1, 0));

      const list = new SettingsList(
        items,
        Math.min(items.length + 2, 16),
        getSettingsListTheme(),
        (id, value) => {
          if (value === "on") selected.add(id);
          else selected.delete(id);
          tui.requestRender();
        },
        () => done("done"),
        { enableSearch: true },
      );
      container.addChild(list);
      container.addChild(new Text(theme.fg("dim", "enter toggles • type to search • esc accepts selection"), 1, 0));
      container.addChild(new DynamicBorder((text: string) => theme.fg("accent", text)));

      return {
        render: (width) => container.render(width),
        invalidate: () => container.invalidate(),
        handleInput: (data) => {
          list.handleInput?.(data);
          tui.requestRender();
        },
      };
    });

    return result === null ? null : [...selected].sort();
  }

  async function createProfile(ctx: ExtensionCommandContext): Promise<void> {
    const scopes: SelectItem[] = [
      { value: "global", label: "Global", description: globalPath },
      ...(projectPath ? [{ value: "project", label: "Project", description: projectPath }] : []),
    ];
    const scope = await selectItem(ctx, "Save profile where?", scopes);
    if (!scope) return;

    const rawName = await ctx.ui.input("Profile name", "dev");
    if (rawName === undefined) return;
    const name = rawName.trim();
    if (!/^[a-z0-9][a-z0-9_-]*$/i.test(name)) {
      report(ctx, "Profile names must use letters, numbers, hyphens, or underscores", "error");
      return;
    }
    if (profiles[name] && !(await ctx.ui.confirm("Overwrite profile?", `A profile named "${name}" already exists.`))) return;

    const skills = [...(ctx.getSystemPromptOptions().skills ?? [])].sort((a, b) => a.name.localeCompare(b.name));
    let selectedSkills: string[];
    if (skills.length === 0) {
      const proceed = await ctx.ui.confirm("No skills discovered", "Create a prompt-only profile?");
      if (!proceed) return;
      selectedSkills = [];
    } else {
      const selection = await selectSkills(ctx, skills);
      if (selection === null) return;
      selectedSkills = selection;
    }

    const prompt = await ctx.ui.editor(
      "Initial prompt / profile instructions (optional)",
      profiles[name]?.prompt ?? "",
    );
    if (prompt === undefined) return;

    const profile: Profile = {
      skills: selectedSkills,
      ...(prompt.trim() ? { prompt: prompt.trim() } : {}),
    };
    const summary = [
      `Name: ${name}`,
      `Scope: ${scope}`,
      `Skills: ${selectedSkills.join(", ") || "none"}`,
      `Initial prompt: ${profile.prompt ? "set" : "none"}`,
    ].join("\n");
    if (!(await ctx.ui.confirm("Create profile?", summary))) return;

    const path = scope === "project" ? projectPath : globalPath;
    if (!path) return;

    try {
      writeProfile(path, name, profile);
      reloadProfiles();
      activate(name, ctx);
      report(ctx, `Profile "${name}" saved and activated`, "info");
    } catch (error) {
      report(ctx, error instanceof Error ? error.message : String(error), "error");
    }
  }

  async function showProfiles(ctx: ExtensionCommandContext): Promise<void> {
    if (ctx.mode !== "tui") {
      report(ctx, "/pi-profiles requires TUI mode", "error");
      return;
    }

    const items: SelectItem[] = [
      ...Object.entries(profiles)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([name, profile]) => ({
          value: name,
          label: name === activeName ? `${name} (active)` : name,
          description: `${profile.skills.join(", ") || "no skills"}${profile.prompt ? " • initial prompt" : ""}`,
        })),
      { value: CREATE_PROFILE, label: "+ Create profile", description: "Choose skills and set an initial prompt" },
    ];

    const choice = await selectItem(ctx, "Pi Profiles", items);
    if (!choice) return;
    if (choice === CREATE_PROFILE) {
      await createProfile(ctx);
      return;
    }
    if (activate(choice, ctx)) report(ctx, `Profile "${choice}" activated`, "info");
  }

  pi.registerCommand("pi-profiles", {
    description: "Browse, create, and activate skill profiles",
    handler: async (_args, ctx) => showProfiles(ctx),
  });

  pi.registerCommand("profile", {
    description: "Activate a skill profile by name",
    getArgumentCompletions: (prefix) => {
      const matches = Object.keys(profiles)
        .sort()
        .filter((name) => name.startsWith(prefix))
        .map((name) => ({ value: name, label: name, description: profiles[name].skills.join(", ") }));
      return matches.length ? matches : null;
    },
    handler: async (args, ctx) => {
      const name = args.trim();
      if (!name) {
        await showProfiles(ctx);
        return;
      }
      if (activate(name, ctx)) report(ctx, `Profile "${name}" activated`, "info");
    },
  });

  pi.on("session_start", (_event, ctx) => {
    globalPath = join(getAgentDir(), "profiles.json");
    projectPath = ctx.isProjectTrusted() ? join(ctx.cwd, CONFIG_DIR_NAME, "profiles.json") : undefined;

    try {
      reloadProfiles();
    } catch (error) {
      profiles = {};
      report(ctx, error instanceof Error ? error.message : String(error), "error");
      return;
    }

    const flag = pi.getFlag("profile");
    if (typeof flag === "string" && flag) {
      if (activate(flag, ctx)) report(ctx, `Profile "${flag}" activated`, "info");
    }
  });

  pi.on("before_agent_start", async (event, ctx) => {
    if (!activeName || !activeProfile) return;

    const skillsByName = new Map(event.systemPromptOptions.skills.map((skill) => [skill.name, skill]));
    const selected: Skill[] = [];

    for (const name of activeProfile.skills) {
      const skill = skillsByName.get(name);
      if (skill) selected.push(skill);
      else if (!reportedMissing.has(name)) {
        reportedMissing.add(name);
        report(ctx, `Profile "${activeName}": skill "${name}" was not discovered`, "warning");
      }
    }

    const loaded = await Promise.all(
      selected.map(async (skill) => {
        let content = contents.get(skill.filePath);
        if (content === undefined) {
          content = await readFile(skill.filePath, "utf8");
          contents.set(skill.filePath, content);
        }
        return `## Skill: ${skill.name}\nSource: ${skill.filePath}\nBase directory: ${skill.baseDir}\n\n${content.trim()}`;
      }),
    );

    const parts = [
      `Active profile: ${activeName}`,
      "The following skill instructions are preloaded. Apply them whenever relevant. Resolve their relative paths from the stated base directory.",
      ...loaded,
    ];
    if (activeProfile.prompt) parts.push(`## Initial profile prompt\n${activeProfile.prompt}`);

    event.systemPromptOptions.sections[SECTION_NAME] = parts.join("\n\n---\n\n");
  });
}
