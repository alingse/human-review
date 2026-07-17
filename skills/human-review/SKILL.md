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
2. Run `hrevu` as a long-running process and share its local URL with the user.
3. Wait for the user to click **Complete Review**. Do not terminate the process or apply feedback before completion.
4. Parse every submitted comment using its file, line, optional column, text, and displayed source context.

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
- Do not claim the review is complete until the `hrevu` process exits and all actionable comments are addressed.
