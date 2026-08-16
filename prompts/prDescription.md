---
description: Generate and apply a GitLab/GitHub pull or merge request description from the current branch's diff
argument-hint: "<platform> <id> [target-branch]"
---

Generate a clear, concise merge/pull request description based on the git diff between the current branch and a target branch, then use the selected platform CLI to update the MR/PR description.

## Invocation inputs

The prompt template has already parsed the command arguments into these authoritative values:

- Platform: `$1`
- MR/PR ID: `$2`
- Target branch: `${3:-origin/main}`

Treat these values as supplied user input; do not ask the user to repeat or confirm them. Normalize `glab` to `gitlab` and `gh` to `github`. Ask a follow-up only when Platform or MR/PR ID is empty or invalid. The Target branch is never missing because it defaults to `origin/main`.

Example invocation:

```
/prDescription gitlab 123 origin/develop
```

This means Platform is `gitlab`, MR/PR ID is `123`, and Target branch is `origin/develop`.

If the user explicitly asks only to generate text and not edit the MR/PR, preserve the old behavior: accept an optional target branch, generate the description, and output only the raw Markdown.

Run this git command using the resolved Target branch value above:

```
git diff <target_branch>...HEAD
```

## CLI update workflow

After generating the Markdown description:

1. Save the generated Markdown to a temporary file.
2. Verify the selected CLI is available:
   - GitHub: `command -v gh`
   - GitLab: `command -v glab`
3. Update the MR/PR description:
   - GitHub: `gh pr edit <id> --body-file <temp_file>`
   - GitLab: `description="$(cat "$temp_file")" && glab mr update <id> --description "$description"`
4. If the CLI command succeeds, respond with a concise confirmation naming the platform and MR/PR id.
5. If the CLI command fails, report the CLI error and include the generated Markdown as a manual fallback.
6. Remove the temporary file when finished.

## Output rules

When only generating text, **output ONLY the raw Markdown below — nothing else.**

Do not write any introductory sentence like "Here is your PR description" or "I've generated the following". Do not wrap the output in a code block or any other container. Do not add a closing remark. The output must start directly with the `## Summary` heading so the user can copy and paste it straight into GitLab or GitHub as Markdown.

Do not add leading or trailing horizontal rules (`---`) to generated MR/PR descriptions. They can be mistaken for YAML front matter rather than Markdown content.

When updating via CLI, do not output the raw Markdown unless the CLI update fails.

## Output format

Use this exact Markdown structure:

## Summary

[One or two sentences describing what this MR/PR accomplishes.]

## Motivation

[Explain the *why*. What problem does this solve, or what feature does it add? Infer from the diff if not obvious.]

## Changes

- [Specific change 1, e.g. "Added `useUserProfile` hook to fetch authenticated user data"]
- [Specific change 2, e.g. "Refactored `LoginService` to use async/await"]
- [Continue for each meaningful change]

## How to Test

1. [Step 1]
2. [Step 2]
3. [Continue as needed]

## Related Tickets

Include `Closes [TICKET-NUMBER]` only when a verified ticket identifier is available. Otherwise omit this section.
