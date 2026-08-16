---
description: Run an Archon workflow with GitLab CLI guidance
argument-hint: "<workflow-name> [additional-info...]"
---
/skill:archon Use Archon workflow $1 to address the user's prompt.

Additional info, if provided: ${@:2}

Important: although this Archon workflow may mention GitHub, the target project uses GitLab. Use the GitLab CLI (`glab`) instead of the GitHub CLI (`gh`) for repository, issue, branch, PR/MR, and project-hosting operations. Translate GitHub terms to GitLab equivalents where needed, especially pull requests to merge requests.
