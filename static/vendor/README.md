# Browser dependencies

Pinned, unmodified browser distributions embedded in the CLI. No frontend build
step or network connection is required for Markdown and Mermaid rendering.

- markdown-it 14.1.0: https://unpkg.com/markdown-it@14.1.0/dist/markdown-it.min.js (MIT)
- Mermaid 11.17.2: https://unpkg.com/mermaid@11.17.2/dist/mermaid.min.js (MIT)

License files are included beside the bundles. Syntax highlighting continues to
use the existing optional highlight.js CDN; rendering works if it is unavailable.
