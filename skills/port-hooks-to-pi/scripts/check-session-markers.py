#!/usr/bin/env python3
"""Check real example-layout hooks with controlled tools, never project suites."""

import argparse
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile


# Runs one copied hook with JSON stdin; returns parsed feedback and checks exit 0.
def run_hook(script, payload, project, env):
    result = subprocess.run(
        ["bash", str(script)], input=json.dumps(payload), text=True,
        capture_output=True, cwd=project / "src", env=env, timeout=15,
    )  # Fifteen seconds bounds a stalled hook; controlled commands finish immediately.
    assert result.returncode == 0, f"{script.name}: exit {result.returncode}: {result.stderr}"
    assert not result.stderr.strip(), f"{script.name}: unexpected stderr: {result.stderr}"
    return json.loads(result.stdout) if result.stdout.strip() else {}


# Copies the supplied producer/consumer unchanged; checks marker state for both agents.
def check(source):
    hooks = source / ".claude/hooks"
    names = ("lint-edited-file.sh", "verify-on-stop.sh")
    for name in names:
        if not (hooks / name).is_file():
            raise SystemExit(f"Missing {hooks / name}; adapt this check to the target hook layout.")
    for tool in ("bash", "git", "jq"):
        if not shutil.which(tool):
            raise SystemExit(f"Missing prerequisite: {tool}. Install it before running this check.")

    with tempfile.TemporaryDirectory(prefix="hook-marker-check-") as temporary:
        root = Path(temporary)
        project = root / "project with spaces"
        copied = project / ".claude/hooks"
        copied.mkdir(parents=True)
        (project / "src").mkdir()
        for name in names:
            shutil.copy2(hooks / name, copied / name)
        edited = project / "src/example.ts"
        edited.write_text("export const value = 1;\n")
        for args in (
            ["init", "--quiet"], ["add", "."],
            ["-c", "user.name=Hook Check", "-c", "user.email=hooks@example.invalid",
             "-c", "commit.gpgsign=false", "-c", "core.hooksPath=/dev/null",
             "commit", "--quiet", "-m", "baseline"],
            ["update-ref", "refs/remotes/origin/master", "HEAD"],
        ):
            subprocess.run(["git", *args], cwd=project, check=True, capture_output=True)
        edited.write_text("export const value = 2;\n")

        # Only verification boundaries are faked; payload parsing and marker logic stay real.
        tools = root / "bin"
        tools.mkdir()
        (tools / "npx").write_text("#!/bin/bash\nexit 0\n")
        (tools / "npm").write_text('''#!/bin/bash
case "$*" in
  "run -s verify")
    echo verify >> "$CHECK_STATE/verified"
    if [ -f "$CHECK_STATE/fail" ]; then
      printf '%s\\n' 'controlled verification failure: "quoted"' >&2
      exit 1
    fi ;;
  "run -s fallow:audit:ci") printf '{}\\n' ;;
  *) printf 'Unexpected npm command: %s\\n' "$*" >&2; exit 1 ;;
esac
''')
        for tool in tools.iterdir():
            tool.chmod(0o755)
        env = {**os.environ, "PATH": f"{tools}:{os.environ['PATH']}", "CHECK_STATE": str(root)}
        env.pop("CLAUDE_PROJECT_DIR", None)
        verified = root / "verified"
        failure = root / "fail"

        for session, tool, field in (
            ("claude-session", "Edit", "file_path"),
            ("/sessions/project/pi-session.jsonl", "edit", "path"),
        ):
            agent_env = dict(env)
            if tool == "Edit":
                agent_env["CLAUDE_PROJECT_DIR"] = str(project)
            common = {"session_id": session, "cwd": str(project / "src"),
                      "transcript_path": "/sessions/transcript.jsonl"}
            post = {**common, "hook_event_name": "PostToolUse", "tool_name": tool,
                    "tool_input": {field: "example.ts", "old_string": "1", "new_string": "2"},
                    "tool_use_id": "tool-check", "tool_response": {"output": "edited"}}
            stop = {**common, "hook_event_name": "Stop", "stop_hook_active": False,
                    "last_assistant_message": "Edit complete."}
            marker = project / ".claude" / f".edited-{session.split('/')[-1]}"
            verified.write_text("")
            failure.touch()
            assert run_hook(copied / names[0], post, project, agent_env) == {}
            assert marker.is_file(), f"Producer did not create {marker}"
            feedback = run_hook(copied / names[1], stop, project, agent_env)
            assert feedback.get("decision") == "block", feedback
            assert 'controlled verification failure: "quoted"' in feedback.get("reason", ""), feedback
            assert marker.is_file(), "First failure removed marker before retry"
            feedback = run_hook(copied / names[1], {**stop, "stop_hook_active": True}, project, agent_env)
            assert "decision" not in feedback, feedback
            assert "retry limit" in feedback.get("systemMessage", "").lower(), feedback
            assert "controlled verification failure" in feedback["systemMessage"], feedback
            assert not marker.exists(), "Bounded retry left marker behind"
            failure.unlink()
            run_hook(copied / names[0], post, project, agent_env)
            assert marker.is_file()
            assert run_hook(copied / names[1], stop, project, agent_env) == {}
            assert not marker.exists(), "Successful verification left marker behind"
            assert verified.read_text().splitlines() == ["verify"] * 3, "Verification silently skipped"
            failure.touch()
            run_hook(copied / names[0], post, project, agent_env)
            assert run_hook(copied / names[1], stop, project, agent_env).get("decision") == "block"
            assert marker.is_file()
            failure.unlink()
            assert run_hook(copied / names[1], {**stop, "stop_hook_active": True}, project, agent_env) == {}
            assert not marker.exists(), "Successful retry left marker behind"
            assert verified.read_text().splitlines() == ["verify"] * 5
            assert run_hook(copied / names[1], stop, project, agent_env) == {}
            assert len(verified.read_text().splitlines()) == 5, "No-marker Stop reran verification"
            print(f"PASS: {tool} payload, {session}: failure retention, bounded retry, success cleanup")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("project", type=Path, help="Reviewed project containing the two real hook scripts")
    arguments = parser.parse_args()
    check(arguments.project.expanduser().resolve())
