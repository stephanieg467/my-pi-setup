# Stephanie's Pi setup

This is the shareable part of my [Pi](https://pi.dev/) workspace: a dark GitHub-inspired theme, focused prompts and agent roles, an Archon skill, and a Claude Agent SDK extension. It is intentionally opinionated and personal—not a universal starter kit—but I hope it offers useful ideas and building blocks.

## What's here

- **Claude child agents** — long-lived, background Claude Agent SDK sessions with status, transcript, cancellation, and takeover UI.
- **My skills** — skills I use when working in Pi.
- **Two agent roles** — code reviewer, spec reviewer definitions for `pi-subagents`.
- **Ten prompt templates** — planning, implementation, review, PR writing, project handoff, and Archon/Drupal workflows.
- **A custom theme** — `github-dark-default`, tuned around GitHub's dark palette.
- **Safe examples** — public settings and global instructions without credentials or machine-local state.

## Repository map

```text
.
├── agents/                    # pi-subagents agent definitions (manual merge)
├── extensions/claude-agents/ # package-native Pi extension
├── prompts/                   # package-native prompt templates
├── skills/                    # package-native maintained skills
├── themes/                    # package-native custom theme
├── AGENTS.md                  # example global working preferences
├── settings.example.json      # sanitized settings reference
├── NOTICE.md                  # provenance and third-party notices
└── SETUP.md                   # install, merge, update, and rollback guide
```

## Highlights

The root `package.json` makes this a proper Pi git package. Installing it loads the extension, Claude Agent SDK skill, all prompts, and the theme. The upstream Archon skill remains in `skills/archon/` as a documented snapshot but is not enabled automatically because its setup guide assumes upstream tooling and should be reviewed before use. The files in `agents/`, `AGENTS.md`, and `settings.example.json` are references to merge deliberately; package installation does not replace your existing global configuration.

Most third-party skills stay linked to their upstream repositories rather than being copied here:

- [`agent-browser`](https://github.com/vercel-labs/agent-browser)
- [`code-review`, `diagnosing-bugs`, `domain-modeling`, `improve-codebase-architecture`, `research`, `tdd`, `to-spec`, `to-tickets`](https://github.com/mattpocock/skills)
- [`fallow`](https://github.com/fallow-rs/fallow-skills)
- [`piv-implement`, `piv-plan-implementation`, `piv-review-changes`, `plan-architecture`, `plan-create-prd`](https://github.com/coleam00/skills)

## Quick start

Review the code first, then install the package:

```bash
pi install git:github.com/stephanieg467/my-pi-setup
```

For a local checkout:

```bash
git clone https://github.com/stephanieg467/my-pi-setup.git
cd my-pi-setup
npm install
npm run check
npm run format:check
pi install "$PWD"
```

Then read [SETUP.md](SETUP.md) before merging the optional agents, instructions, or settings. The Claude extension also requires an installed and authenticated Claude Code CLI.

## Thanks

Inspired by and grateful for [Ben Davis's `my-pi-setup`](https://github.com/davis7dotsh/my-pi-setup), which showed how useful a clear, shareable Pi configuration can be. The theme and Claude extension have upstream roots in Ben's setup; see [NOTICE.md](NOTICE.md) for exact provenance and licensing boundaries.

## License

Stephanie-authored portions are [MIT licensed](LICENSE). Upstream-derived resources retain their own terms; see [NOTICE.md](NOTICE.md).
