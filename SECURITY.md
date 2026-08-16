# Security

## Trust model

Pi packages are executable configuration. Extensions run arbitrary code with your user account's permissions, and skills/prompts can instruct an agent to read files, run commands, or use network services. Review this repository and its dependency changes before installing or updating it.

The Claude child-agent extension starts headless Claude Code SDK jobs with permission prompts bypassed. To reduce accidental exposure, it only starts a job after the working directory is trusted by Pi. Treat trusted directories as a meaningful security boundary, review their instructions and code, and never run the extension in an untrusted checkout.

Authentication comes from your installed Claude Code CLI. Do not put API keys, tokens, `.env` files, Pi authentication data, or trust decisions in this repository. The examples contain placeholders only.

Claude transcripts, Pi sessions, extension artifacts, logs, and other runtime state remain local to the user's machine and are intentionally excluded from this repository. They may still contain source code, prompts, command output, or other sensitive data; protect and delete local state according to your own retention needs.

## Reporting a vulnerability

Please do not open a public issue containing a secret, exploit details, private transcript, or affected user's data. Use GitHub's private vulnerability reporting feature for the repository when available. If private reporting is unavailable, open a minimal public issue asking for a private contact channel without including sensitive details.

If a credential may have been exposed, revoke or rotate it immediately before reporting. Include the affected version or commit, impact, reproduction steps with sanitized data, and any suggested mitigation. Security reports will be acknowledged and handled as promptly as possible, but no response-time guarantee is offered for this personal project.
