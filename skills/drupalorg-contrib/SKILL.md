---
name: drupalorg-contrib
description: File and search Drupal.org contrib project issues and merge requests via the git.drupalcode.org GitLab API. Use this whenever the user wants to search a Drupal.org issue queue (for duplicates of a local patch, existing fixes, or related bugs), create an upstream issue, contribute a patch upstream, or open a merge request against a Drupal contrib module (e.g. canvas, webform, pathauto).
disable-model-invocation: true
---

# Drupal.org contrib: search, issue, and MR workflow

Everything goes through the GitLab API at `https://git.drupalcode.org/api/v4/`. The
non-obvious parts — and the reason this skill exists — are that drupalcode **blocks
personal forks**, uses **shared issue forks** created by a bot command, and that some
projects still use the legacy drupal.org issue queue where none of this applies.

## Step 0: Legacy queue or GitLab work items?

Check where the project's issues live before doing anything:

```bash
curl -s -o /dev/null -w "%{http_code} %{redirect_url}\n" "https://www.drupal.org/project/issues/PROJECT"
```

- **301 to `git.drupalcode.org/.../work_items`** → migrated project. The full API
  workflow below applies.
- **200 (stays on drupal.org)** → legacy queue. Issues are drupal.org nodes; they
  cannot be created via the GitLab API. Search with WebFetch/WebSearch on
  drupal.org, and direct the user to create the issue in the drupal.org web UI.
  Issue forks for legacy issues are created from the button on the drupal.org
  issue page, not via `/do:fork`.

Also check whether the project was **renamed** (e.g. `experience_builder` → `canvas`):
old issues may live under the old project name on drupal.org while new ones are in
the new project's GitLab. Search both when hunting duplicates.

## Searching the issue queue (optional duplicate/prior-art hunting)

Search the Drupal.org issue queue unless the user explicitly says it has already been
searched, provides an existing issue/MR to use, or asks to skip duplicate hunting. In
those cases, acknowledge that prior search context and continue with the requested
issue/MR workflow instead of re-running searches.

When searching is needed, the GitLab issues API is faster and more reliable than
scraping the SPA work-items UI (which renders via JS and returns an empty shell to
curl):

```bash
curl -s "https://git.drupalcode.org/api/v4/projects/PROJECT_PATH/issues?search=TERM&scope=all&per_page=20"
# PROJECT_PATH is URL-encoded, e.g. project%2Fcanvas
# add &state=opened to filter; results have .iid, .state, .title, .web_url
```

Search tips that matter in practice:
- Run several distinct phrasings: the reporter's symptom words ("too many redirects",
  "modal does not open"), the class/method name (`redirectCanvasToDefaultLanguage`),
  and the subsystem term. Each surfaces different issues.
- Complement with `WebSearch` restricted to `drupal.org` — it finds issues under old
  project names and in release notes that the GitLab search misses.
- To check whether a fix landed in a release, don't trust issue state alone: fetch the
  actual file at the release tag and compare with the default branch:
  ```bash
  curl -s "https://git.drupalcode.org/api/v4/projects/PROJECT_PATH/repository/files/URLENCODED%2FFILE%2FPATH.php/raw?ref=TAG"
  ```
- MR status: `GET /projects/PROJECT_PATH/merge_requests/IID` → `.state`, `.merged_at`.
  An MR referenced in composer patches may still be open — worth reporting to the user.

## Authentication

Write operations need a personal access token with `api` scope
(GitLab → Preferences → Access Tokens; users log in to git.drupalcode.org with their
drupal.org account via SSO).

- Look for `DRUPALCODE_TOKEN` in the environment first; otherwise ask the user.
- Pass it as a `PRIVATE-TOKEN:` header. Keep it out of the repo and out of command
  echoes where practical (store in a mode-600 scratchpad file and `$(cat ...)` it).
- If the user pasted the token into the chat, remind them to revoke it when done —
  it's been exposed.
- Verify it before use: `GET /api/v4/user` should return their username.

## Creating an issue

```bash
curl -s -X POST -H "PRIVATE-TOKEN: $TOKEN" \
  --data-urlencode "title=..." \
  --data-urlencode "description@issue_body.md" \
  "https://git.drupalcode.org/api/v4/projects/PROJECT_PATH/issues"
# response: .iid (the issue number), .web_url
```

Follow Drupal issue conventions in the body — maintainers expect these sections:

```markdown
### Overview
What's wrong, why, and on which version it was confirmed.

### Steps to reproduce
Numbered steps + **Expected** / **Actual**.

### Proposed resolution
What the fix does. Mention alternatives if the approach is debatable
(e.g. "hardcoding a contrib module name here may not be desirable — could
instead be made opt-out-able generically").

### Related issues
- #NNNNNNN (with a word on how each relates)
```

Reference related issues as `#NNNNNNN` — GitLab links them automatically. Note the
API cannot set version/component/priority metadata on drupalcode work items; after
creating, tell the user to add those in the web UI (and set "Needs review" once an
MR exists).

## Creating the issue fork (the part that breaks everyone)

`POST /projects/.../fork` is **blocked** on drupalcode — it 301s to
`drupal.org/git-error`. Do not retry it or try to create projects in the `issue/`
namespace. Instead, comment the DrupalBot command on the issue:

```bash
curl -s -X POST -H "PRIVATE-TOKEN: $TOKEN" --data-urlencode "body=/do:fork" \
  "https://git.drupalcode.org/api/v4/projects/PROJECT_PATH/issues/IID/notes"
```

DrupalBot creates a **shared fork** at `issue/PROJECT-IID` (e.g. `issue/canvas-3591772`)
within ~10–30 seconds, with push access for whoever posted the command. Poll for it:

```bash
curl -s -H "PRIVATE-TOKEN: $TOKEN" \
  "https://git.drupalcode.org/api/v4/projects/issue%2FPROJECT-IID"
# 404 until ready; then .id, .default_branch
```

The fork contains all upstream branches. It is shared — other contributors may push
to it later; that's by design.

## Committing the change

No local clone needed — use the commits API to create the branch and commit in one
call. Branch naming convention is `{iid}-short-kebab-description`; commit messages
start with `Issue #NNNNNNN:`.

To build the file content: download the file from the fork's default branch, apply
the local patch to it (`patch -p1 --dry-run` first), then send the whole patched file:

```bash
# python/json is easier than curl form-encoding for full file contents:
POST /api/v4/projects/issue%2FPROJECT-IID/repository/commits
{
  "branch": "3591772-skip-language-prefix-redirect",
  "start_branch": "1.x",                      # upstream default/target branch
  "commit_message": "Issue #3591772: Skip language-prefix redirect when ...",
  "actions": [
    {"action": "update", "file_path": "src/...php", "content": "<full file>"}
  ]
}
```

Use `"action": "create"` for new files (e.g. tests). Multiple files go in one
`actions` array — keep it one commit unless there's a reason not to.

Before committing PHP service changes, check whether `*.services.yml` needs updating:
if the module's services file has `_defaults: autowire: true`, constructor-injection
changes need no services.yml edit; otherwise the service definition needs the new
argument listed.

## Opening the merge request

Cross-project MR from the issue fork to upstream:

```bash
POST /api/v4/projects/issue%2FPROJECT-IID/merge_requests
{
  "source_branch": "3591772-skip-language-prefix-redirect",
  "target_branch": "1.x",                     # or 11.x etc. — the development branch
  "target_project_id": <upstream numeric id>, # GET /projects/PROJECT_PATH → .id
  "title": "#3591772: Skip language-prefix redirect when canvas_multilingual is installed",
  "description": "Fixes #3591772.\n\n<what and why, note anything reviewers should check>",
  "allow_collaboration": true                 # Drupal norm: maintainers push to MR branches
}
# response: .iid, .web_url
```

`target_project_id` is what makes it land on the upstream project instead of the
fork. Target the development branch (`1.x`, `2.x`, `11.x`), never a release tag —
even if the fix was developed against a tagged release. If the file differs between
the tag and the dev branch, re-verify the patch applies to the dev branch first.

## After filing — close the loop

Report the issue and MR URLs plainly, then offer these follow-ups:

- **composer.json**: the MR is consumable as a patch at
  `https://git.drupalcode.org/project/PROJECT/-/merge_requests/IID.patch`. Trade-off
  to surface: the URL's content changes whenever the branch gets new commits, so a
  local patch file is more stable; the MR URL self-documents the upstream thread.
  Either way, put the issue number in the patch description or filename.
- Remind the user to set the issue's version/component and "Needs review" status in
  the web UI, and to revoke the token if it was shared in chat.

## Troubleshooting

- **Fork API returns 301 / drupal.org/git-error** → expected; use `/do:fork`.
- **`issue/PROJECT-IID` 404s after a minute** → check the `/do:fork` note posted
  (GET the issue notes); the bot only reacts to the bare command as the note body.
- **Empty results scraping work_items pages** → it's a JS SPA; use the API.
- **GitLab project search finds nothing for a contrib module** → the module may not
  be migrated (Step 0), or issues may live under a former project name.
- **Commit API 400 "branch already exists"** → omit `start_branch` and commit to the
  existing branch, or pick the branch up where it is.
