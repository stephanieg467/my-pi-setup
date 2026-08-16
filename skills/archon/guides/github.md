# GitHub Webhook Setup Guide

GitHub integration lets Archon respond to issue comments, PR comments, and @mentions via webhooks.

**IMPORTANT — Input safety rule**: Use structured questions only for multiple-choice decisions. Ask for non-sensitive paths, URLs, and usernames in plain text. Never ask the user to paste tokens or secrets into chat; have them enter credentials in a separate terminal or editor.

## 0. Check Existing .env Values

Check only whether the required GitHub-related values are present. Never print or read their values into the agent transcript:

```bash
for key in WEBHOOK_SECRET GITHUB_TOKEN GH_TOKEN GITHUB_ALLOWED_USERS; do
  if grep -Eq "^${key}=.+" <archon-repo>/.env 2>/dev/null; then
    echo "$key=set"
  else
    echo "$key=missing"
  fi
done
```

**If all are already filled in**: Tell the user "GitHub tokens are already configured in `.env`. Skipping to webhook setup." Jump to Step 5 (configure the repo webhook).

**If some are filled in**: Tell the user which values are already set and which are missing. Only collect the missing ones in the steps below.

**If none are filled in**: Proceed with all steps.

## 1. Set Up a Public URL (ngrok)

GitHub webhooks need to reach your local server. Check if ngrok is installed:

```bash
which ngrok
```

**If not installed**, use **AskUserQuestion**:

```
Header: "Install ngrok"
Question: "ngrok is not installed. Want me to install it via Homebrew?"
Options:
  1. "Yes, install it" (Recommended) — runs `brew install ngrok`
  2. "I'll install it myself" — user handles it, wait for confirmation
```

If yes, run:
```bash
brew install ngrok
```

**If ngrok is not authenticated**, check and guide:
```bash
ngrok config check 2>&1
```

If it needs auth, tell the user to sign up at https://ngrok.com and run `ngrok config add-authtoken <token>` in a separate terminal. Wait for confirmation; never request or handle the token in chat.

## 2. Start ngrok

Tell the user to run this in a **separate terminal** (ngrok must stay running):

```
Run this in another terminal:  ngrok http 3090
```

Then ask in **plain text** (NOT AskUserQuestion):

> "Paste the ngrok HTTPS URL here (e.g., `https://abc123.ngrok-free.app`)."

If the user pastes the full ngrok terminal output, parse the URL from the `Forwarding` line (the `https://...` URL before the `->` arrow).

Store the URL as `<ngrok-url>`.

## 3. Generate a Webhook Secret

**Only if `WEBHOOK_SECRET` is missing.** Tell the user to generate and save it from a separate terminal so it never enters the agent transcript:

```bash
secret=$(openssl rand -hex 32)
printf '\nWEBHOOK_SECRET=%s\n' "$secret" >> <archon-repo>/.env
printf '%s\n' "$secret"
```

The user should keep that terminal open long enough to copy the secret into GitHub's webhook form, then clear it.

## 4. Configure GitHub Credentials

For missing credentials, direct the user to create a fine-grained token at https://github.com/settings/tokens with repository access for `<target-repo>` and permissions for Issues (read/write), Pull Requests (read/write), and Contents (read). Have them add these values directly to `<archon-repo>/.env` in a separate terminal or editor:

```env
GITHUB_TOKEN=<token>
GH_TOKEN=<same token>
GITHUB_ALLOWED_USERS=<username>
```

Never ask the user to paste these values into chat and never print the `.env` file. After the user confirms completion, rerun the presence-only check from Step 0.

## 5. Preserve Existing Configuration

Only missing keys should be added. Never overwrite an existing `.env` value automatically.

## 6. Configure the Repository Webhook

Tell the user to go to their **target repo** on GitHub > **Settings** > **Webhooks** > **Add webhook** and configure:

- **Payload URL**: `<ngrok-url>/webhooks/github`
- **Content type**: `application/json`
- **Secret**: `<webhook-secret>` (the value from step 3, or the existing value from `.env`)
- Select events: **Issue comments** + **Pull request review comments** (or "Send me everything")
- Click **Add webhook**

Use **AskUserQuestion** to confirm when done:
```
Header: "Webhook"
Question: "Have you added the webhook to your GitHub repo?"
Options:
  1. "Done" — webhook is configured
  2. "I need help" — walk me through it step by step
```

## 7. Verify the Webhook

Start the server and test the webhook endpoint:

```bash
cd <archon-repo> && bun run dev &
sleep 3
curl -s http://localhost:3090/health
```

If health check returns `{"status":"ok"}`, also verify the ngrok tunnel is forwarding:

```bash
curl -s <ngrok-url>/health
```

Both should return `{"status":"ok"}`. If the ngrok check fails, make sure the ngrok terminal is still running.

Stop the background server when done verifying:
```bash
kill %1 2>/dev/null
```

## Notes

- **Free tier URLs change on restart** — you'll need to update the webhook URL in GitHub each time you restart ngrok.
- **Persistent URLs**: Use a paid ngrok plan, Cloudflare Tunnel, or Archon's upstream [cloud deployment guide](https://github.com/coleam00/Archon/blob/main/docs/cloud-deployment.md).
- Both the **server** (`bun run dev`) and **ngrok** must be running for GitHub webhooks to work.
