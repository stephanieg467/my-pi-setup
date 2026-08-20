---
name: communication
description: Use whenever communicating with the human (eg. in chat). This skill is not used for code generation or code review.
---

# Communication

Communicate clearly and concisely without filler.

## Invocation modes

### Automatic invocation

When invoked without an explicit request, apply these guidelines to the next human-facing response:

- Lead with the direct answer or outcome.
- Prefer plain language over jargon.
- Use bullets, numbered steps, or tables when they improve readability.
- Be specific and actionable.
- Keep explanations proportional to the question.
- Define necessary technical terms briefly.
- Avoid repeating information the human already knows.

### Explicit invocation

When the skill content is followed by `User: <request>`, treat `<request>` as the task to perform.

Examples:

- `explain what you meant by "immutable package storage"`
- `rewrite this in simpler language: ...`
- `summarize the work completed`

Answer the request directly. Do not explain how the skill works unless asked.

When explaining a term or phrase:

1. Give a plain-language definition.
2. Explain what it means in the current context.
3. Include a short concrete example when useful.
