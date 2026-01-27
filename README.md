# /human-review for AI

[中文文档](README.zh-CN.md) | English

A CLI tool for manual code review with a web-based interface. Designed for AI coding workflows (Claude, Gemini, etc.), providing a browser-based review experience without cramped terminal input boxes.

## Quick Start

```bash
# Install CLI tool
cargo install human-review

# Install Claude Code skill
npx skills add alingse/human-review
```

## Usage

Use `/human-review` in your AI coding assistant:

```
/human-review diff              # Review current changes
/human-review README.md         # Review a specific file
/human-review abc1234           # Review a commit
/human-review last commit       # Review the last commit
/human-review current plan      # Review a plan document
```

Or use natural language - your AI will understand:
- `/human-review "Review the changes I just made"`
- `/human-review "Check the authentication module"`
- `/human-review "I want to review the last 3 commits"`

## Features

- **Browser-based review** - Full-featured web interface with dark theme
- **Line-level commenting** - Add precise feedback on specific lines
- **Multiple input modes** - Review commits, diffs, or any file
- **AI workflow integration** - Clean terminal output for AI to process
- **Bilingual** - Auto-detects Chinese/English based on browser locale

## License

MIT
