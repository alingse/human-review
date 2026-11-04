---
name: human-review
description: >-
  Launch a browser-based human review for current changes, files, commits, or plans; collect precise line-and-column comments; wait for the user to finish; then use actionable comments and their source context as the basis for scoped edits. Use when the user asks to review, inspect, or comment on work in a web UI, or wants submitted review feedback applied.
---

# Human Review

Use `hrevu` to collect human feedback before changing the reviewed work.

## Prerequisite

Install the CLI if `hrevu` is unavailable:

```bash
cargo install human-review
```

## Run the review

1. Resolve the target:
   - Explicit file or plan → `hrevu <path>`
   - Explicit commit → `hrevu <commit>`
   - No target and git changes exist → `hrevu diff`
2. Run `hrevu` as a long-running process and share its local URL with the user. Record the **Review ID** and **Saved** path printed at startup in your task context.
3. Read live or completed feedback with `hrevu show <review-id> --json`. Every accepted comment mutation is already saved on disk; stdout and the running web server are not the only copies.
4. Wait until the saved record has `status: "completed"` before applying feedback. The web server stays available after completion, so process exit is not the completion signal. If the user asks for intermediate comments, read and report them without declaring the review complete.
5. Parse every submitted comment using its file, side, line/column or `anchor` (source range, quote and relative point), and the saved `files` snapshot. Compare that snapshot with the current code before editing.

## Recover, resume, and export

- If the process output or Review ID is missing, use `hrevu history --json`. Match the target, `cwd`, creation time and status; ask which review only if multiple records remain plausible.
- Use `hrevu show <review-id> --json` or read the saved JSON path even after the original process has exited. Do not restart a new review to retrieve existing feedback.
- A recovered legacy record may have `snapshot_note` and no `files`. Use its preserved quotes and disclose the missing snapshot; do not present the current file as the reviewed version.
- Use `hrevu resume <review-id>` to continue an unfinished review with its saved comments and content. Completed records are read-only.
- Use `hrevu history` to reopen the history web page. Its export buttons download text or complete JSON, including file snapshots.
- Use `hrevu export <review-id> --format text --output review.txt` (or `--format json`) for forwarding feedback.
- Default storage is `~/.local/share/hrevu/reviews/` on macOS/Linux. `HREVU_DATA_DIR` overrides the base directory; XDG and Windows local app data are also supported.
- For automation that requires process exit, start the review with `--exit-on-complete`; the same record remains readable afterward.
- If saving fails, the request fails and the UI keeps the unsent text. Do not present that comment as saved.

## Apply submitted feedback

Treat completed review comments as the source of truth for the next scoped pass:

- Implement explicit change requests at the commented location while preserving nearby intent and formatting.
- Validate bug reports and questions against the referenced code before changing it; explain the answer when no code change is needed.
- Preserve the stored line and column when editing an existing comment.
- Acknowledge praise such as `LGTM` without modifying code.
- Skip greetings and feedback with no actionable request.
- Ask one concise clarification only when different interpretations would materially change the result.
- Treat direct user messages sent while the review is open as additional review feedback.

After applying feedback, run checks proportional to the modified code and report how each actionable comment was handled.

## Guardrails

- Keep changes within the reviewed target unless the feedback requires a directly related dependency.
- Never invent a requested change from vague or purely positive comments.
- Do not claim the feedback collection is complete until the saved review has `status: "completed"`. Report implementation completion separately, after actionable comments are addressed.
