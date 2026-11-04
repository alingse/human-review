// Markdown parsing stays separate from review UI. Token maps are zero-based,
// end-exclusive; data attributes use the same one-based lines as source review.
const markdownParser = window.markdownit({
    html: false,
    linkify: true,
    highlight(source, language) {
        if (window.hljs && hljs.getLanguage(language)) {
            return hljs.highlight(source, { language }).value;
        }
        return '';
    },
});
markdownParser.core.ruler.push('review_locations', state => {
    for (const token of state.tokens) {
        if (token.map && (token.nesting === 1 || token.type === 'fence' || token.type === 'code_block' || token.type === 'hr')) {
            token.attrSet('data-source-start', String(token.map[0] + 1));
            token.attrSet('data-source-end', String(token.map[1]));
        }
    }
});
const defaultFence = markdownParser.renderer.rules.fence;
markdownParser.renderer.rules.fence = (tokens, index, options, env, renderer) => {
    const token = tokens[index];
    const attrs = renderer.renderAttrs(token);
    if (token.info.trim().split(/\s+/)[0] === 'mermaid') {
        return `<div class="markdown-mermaid"${attrs}>
            <div class="mermaid-diagram" role="img" aria-label="Mermaid">${markdownParser.utils.escapeHtml(token.content)}</div>
            <details><summary>Mermaid source</summary><pre><code>${markdownParser.utils.escapeHtml(token.content)}</code></pre></details>
        </div>`;
    }
    return `<div class="markdown-code-block"${attrs}>${defaultFence(tokens, index, options, env, renderer)}</div>`;
};
// Task lists are the only GFM extension not included by markdown-it itself.
markdownParser.core.ruler.after('inline', 'task_lists', state => {
    state.tokens.forEach((token, index) => {
        if (token.type !== 'inline' || state.tokens[index - 2]?.type !== 'list_item_open') return;
        const first = token.children?.[0];
        const match = first?.type === 'text' && first.content.match(/^\[([ xX])\] /);
        if (!match) return;
        first.content = first.content.slice(4);
        const checkbox = new state.Token('html_inline', '', 0);
        checkbox.content = `<input type="checkbox" disabled${match[1] !== ' ' ? ' checked' : ''}> `;
        token.children.unshift(checkbox);
    });
});

let mermaidQueue = Promise.resolve();
let diagramId = 0;
function renderMermaidDiagrams(root, onLayout) {
    // Mermaid configuration is global, so serialize renders including theme changes.
    const theme = document.documentElement.dataset.theme === 'dark' ? 'dark' : 'default';
    root.querySelectorAll('.mermaid-diagram').forEach(element => {
        const source = element.textContent;
        mermaidQueue = mermaidQueue.then(async () => {
            if (!element.isConnected) return;
            let container;
            try {
                mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', suppressErrorRendering: true, theme });
                container = document.createElement('div');
                container.style.cssText = 'position:absolute;left:-100000px;visibility:hidden';
                document.body.append(container);
                const { svg } = await mermaid.render(`review-diagram-${diagramId++}`, source, container);
                if (element.isConnected) element.innerHTML = svg;
            } catch (_) {
                element.textContent = t('diagramFailed');
                element.classList.add('diagram-error');
                element.nextElementSibling.open = true;
            } finally {
                container?.remove();
                if (element.isConnected) onLayout();
            }
        });
    });
}
