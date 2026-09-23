# @moejay/pi-profile

[![CI](https://github.com/moejay/pi-profile-skills/actions/workflows/ci.yml/badge.svg)](https://github.com/moejay/pi-profile-skills/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/%40moejay%2Fpi-profile)](https://www.npmjs.com/package/@moejay/pi-profile)
[![license](https://img.shields.io/npm/l/%40moejay%2Fpi-profile)](LICENSE)

Named profiles for [Pi](https://pi.dev) that preload complete skill instructions and an optional initial system prompt before the first agent turn.

[Project website](https://moejay.github.io/pi-profile-skills/)

Pi normally includes only skill names and descriptions in context, loading each `SKILL.md` on demand. This extension eagerly loads the skills selected by the active profile.

## Install

```bash
pi install npm:@moejay/pi-profile
```

Local development:

```bash
pi -e ./extensions/profile.ts
```

## TUI

Run:

```text
/pi-profiles
```

The menu can:

- Browse and activate available profiles
- Create a global or trusted project profile
- Search and select from every discovered Pi skill
- Set an optional initial prompt/profile instructions
- Save and immediately activate the new profile

`/profile` opens the same menu. `/profile dev` activates a profile directly.

## CLI

```bash
pi --profile dev
```

`-p` is unavailable because Pi reserves it for `--print`. Use an alias if desired:

```bash
alias pi-dev='pi --profile dev'
```

## Configuration

Global profiles are stored in `~/.pi/agent/profiles.json`. Trusted project profiles are stored in `.pi/profiles.json` and override same-named global profiles.

```json
{
  "dev": {
    "skills": ["pi-subagents", "use-railway"],
    "prompt": "Prefer small, tested changes."
  },
  "desktop": {
    "skills": ["omarchy"]
  }
}
```

Skills are referenced by their frontmatter `name` and must be discoverable by Pi. The older `instructions` field remains accepted and is normalized to `prompt`.

## Publishing and pi.dev discovery

This repository is a Pi package through its `package.json` `pi.extensions` manifest. The `pi-package` npm keyword makes it discoverable in the [pi.dev package gallery](https://pi.dev/packages).

```bash
npm login
npm test
npm pack --dry-run
npm publish --access public
```

The unscoped name `pi-profile` is already taken, so this package uses the `@moejay` scope. After the first manual publish, configure npm trusted publishing for this GitHub repository and the `publish.yml` workflow. Publishing a GitHub release will then test and publish the matching package version with provenance.

## Context cost

Every selected `SKILL.md` consumes context tokens. Keep profiles focused; normal on-demand skill loading remains cheaper for occasional capabilities.
