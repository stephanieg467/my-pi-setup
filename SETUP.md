# Setup

This repository separates resources Pi can install as a package from personal configuration that should be merged by hand. Nothing here requires replacing `~/.pi/agent`.

## What installation does—and does not do

The root Pi manifest installs these **package-native resources**:

- `extensions/ask-user/index.ts`
- `extensions/claude-agents/index.ts`
- `extensions/file-search/index.ts`
- `skills/claude-agent-sdk/`
- every template in `prompts/`
- the theme in `themes/`

Pi's package system does not install `agents/`, `AGENTS.md`, or `settings.example.json`:

- `agents/` contains definitions consumed by the separately installed `pi-subagents` package.
- `AGENTS.md` is Stephanie's example global instruction file.
- `settings.example.json` is a sanitized reference, not a file to copy over live settings blindly.

## Prerequisites

1. A current Node.js and npm installation.
2. [Pi](https://pi.dev/) installed and working.
3. For the Claude extension, the Claude Code CLI installed and authenticated. Confirm `claude --version` works; if needed, start `claude` and run `/login` interactively.
4. A trusted working directory. Claude child jobs are headless and bypass Claude Code permission prompts, so the extension refuses to launch them from directories Pi has not trusted.

## Safe install into an existing setup

First back up the small set of files you may merge:

```bash
backup="$HOME/.pi/agent-backup-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$backup"
cp -a "$HOME/.pi/agent/settings.json" "$backup/" 2>/dev/null || true
cp -a "$HOME/.pi/agent/AGENTS.md" "$backup/" 2>/dev/null || true
cp -a "$HOME/.pi/agent/agents" "$backup/" 2>/dev/null || true
```

Review the checkout, then install it as a package. Use the published URL when available:

```bash
pi install git:github.com/stephanieg467/my-pi-setup
# Or, from a local checkout (Pi does not install local-path dependencies):
npm install
pi install "$PWD"
```

Pi records the package in `~/.pi/agent/settings.json` and keeps package files in its package-managed location. It does **not** replace `~/.pi/agent`. Run `pi config` to enable or disable individual package resources.

To install only for one trusted project, run this in that project instead:

```bash
pi install -l git:github.com/stephanieg467/my-pi-setup
```

That writes to `.pi/settings.json`; inspect it before committing it for a team.

## Ask-user tool

The `ask-user` extension lets the model present one multiple-choice question with two to five options. Pi always adds a free-form answer option. The interactive picker is available in TUI mode; in other modes, the tool tells the model to ask in plain text instead.

## File-search tools

The `file-search` extension registers `fd` for file discovery and `rg` for content search. It first uses system-installed binaries (`fdfind` is also supported on Debian/Ubuntu), then checks `~/.pi/agent/bin/`. If neither is available, it downloads checksummed official binaries on supported macOS and Linux systems. Install `fd` and `rg` manually if your platform is unsupported.

## Merge the optional agent definitions

Install `pi-subagents` if it is not already present:

```bash
pi install npm:pi-subagents
```

Compare definitions before copying. The following loop preserves any existing file instead of overwriting it:

```bash
mkdir -p "$HOME/.pi/agent/agents"
for file in agents/*.md; do
  target="$HOME/.pi/agent/agents/$(basename "$file")"
  if [ -e "$target" ]; then
    echo "compare existing: $target"
    diff -u "$target" "$file" || true
  else
    cp "$file" "$target"
  fi
done
```

Merge any differences you want from the per-file output. Restart Pi after changing agent definitions.

## Merge global instructions

Read `AGENTS.md` and copy only preferences that fit your workflow. If you have no global instructions yet, you may copy it directly:

```bash
cp AGENTS.md "$HOME/.pi/agent/AGENTS.md"
```

If that destination exists, edit it manually—do not overwrite it. Project-level `AGENTS.md` files may be a better home for project-specific rules.

## Merge settings

`settings.example.json` documents Stephanie's public defaults, including the model, thinking level, theme, `pi-web-access`, `pi-subagents`, and researcher/reviewer overrides. It intentionally excludes changelog state, authentication, trust decisions, model caches, sessions, and logs.

Open your current settings and the example side by side:

```bash
${EDITOR:-vi} "$HOME/.pi/agent/settings.json" settings.example.json
```

Merge only desired keys. Keep existing package entries and private settings. Do not replace your settings file wholesale, and do not copy credentials into this repository. Pi can also manage package entries interactively with `pi config`.

## Third-party linked skills

This repository does not vendor the third-party skills listed in [README.md](README.md). Follow each upstream repository's installation instructions, then link or copy selected skills into `~/.pi/agent/skills/`. Linking keeps provenance clear and makes upstream updates intentional.

## Update

For a git-package install, run:

```bash
pi update --extensions
# Or update this package specifically using the source shown by `pi list`:
pi update git:github.com/stephanieg467/my-pi-setup
```

Package updates do not re-merge `agents/`, `AGENTS.md`, or the settings example. Compare those files against your live copies and merge deliberately. For a local checkout, `git pull`, run `npm install`, validate, and restart Pi.

## Uninstall

Find the exact recorded package source, then remove it:

```bash
pi list
pi remove git:github.com/stephanieg467/my-pi-setup
```

For a project-local install, use `pi remove -l ...`. Remove copied agent definitions only if you are sure they are not locally modified. Package removal does not delete manually copied files.

## Roll back

For a pinned git install, reinstall a known tag or commit:

```bash
ref=<tag-or-commit>
pi install "git:github.com/stephanieg467/my-pi-setup@$ref"
```

If a manual merge caused trouble, restore `settings.json`, `AGENTS.md`, or `agents/` from the timestamped backup created above. Keep the current files until you have compared them, then restart Pi. Runtime transcripts and state remain local and are not part of this repository.
