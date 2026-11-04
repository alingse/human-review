// i18n Translations
const i18n = {
    zh: {
        files: '文件',
        history: '审查历史',
        exportText: '导出文字',
        saved: '已自动保存',
        archived: '历史记录 · 只读',
        inProgress: '审查中',
        completed: '已完成',
        noHistory: '暂无审查记录',
        historyFailed: '无法读取历史记录，请用 hrevu history 重新打开。',
        comments: '评论',
        selectFile: '选择文件',
        globalComment: '全局评论',
        addGlobalComment: '+ 全局评论',
        addComment: '添加评论',
        updateComment: '更新评论',
        closeComment: '关闭评论输入器',
        submitHint: 'Enter 发送 · Shift Enter 换行',
        you: '你',
        edit: '编辑',
        delete: '删除',
        completeReview: '完成审查',
        complete: '完成',
        cancel: '取消',
        noCommentsYet: '暂无评论',
        loading: '加载中...',
        failedToLoad: '加载失败',
        commentAdded: '评论已添加',
        commentUpdated: '评论已更新',
        commentDeleted: '评论已删除',
        failedToSave: '保存失败',
        failedToDelete: '删除失败',
        failedToComplete: '完成审查失败',
        reviewComplete: (count) => `审查完成！共 ${count} 条评论`,
        globalCommentLabel: '全局评论',
        line: '行',
        renderedView: '渲染',
        sourceView: '源码',
        previewHint: '点击正文添加评论，输入后展开；拖动可自由选中文字',
        expandComment: '展开评论输入框',
        previousVersion: '修改前的内容',
        removedContent: '已删除内容',
        diagramFailed: '图表渲染失败，请查看下方源码。',
        prefix: {
            commit: '提交',
            file: '文件',
        },
        typeLabel: {
            working_tree_diff: '当前更改',
        },
    },
    en: {
        files: 'Files',
        history: 'Review history',
        exportText: 'Export text',
        saved: 'Saved automatically',
        archived: 'Saved review · Read only',
        inProgress: 'In progress',
        completed: 'Completed',
        noHistory: 'No saved reviews yet',
        historyFailed: 'Cannot load history. Reopen it with hrevu history.',
        comments: 'Comments',
        selectFile: 'Select a file',
        globalComment: 'Global Comment',
        addGlobalComment: '+ Global Comment',
        addComment: 'Add Comment',
        updateComment: 'Update Comment',
        closeComment: 'Close comment composer',
        submitHint: 'Enter send · Shift Enter new line',
        you: 'You',
        edit: 'Edit',
        delete: 'Delete',
        completeReview: 'Complete Review',
        complete: 'Complete',
        cancel: 'Cancel',
        noCommentsYet: 'No comments yet',
        loading: 'Loading...',
        failedToLoad: 'Failed to load data',
        commentAdded: 'Comment added',
        commentUpdated: 'Comment updated',
        commentDeleted: 'Comment deleted',
        failedToSave: 'Failed to save comment',
        failedToDelete: 'Failed to delete comment',
        failedToComplete: 'Failed to complete review',
        reviewComplete: (count) => `Review complete! ${count} comment${count !== 1 ? 's' : ''}`,
        globalCommentLabel: 'Global comment',
        line: 'Line',
        renderedView: 'Rendered',
        sourceView: 'Source',
        previewHint: 'Click content to comment; start typing to expand. Drag to select text.',
        expandComment: 'Expand comment composer',
        previousVersion: 'Previous version',
        removedContent: 'Removed content',
        diagramFailed: 'Could not render diagram. Check the source below.',
        prefix: {
            commit: 'Commit',
            file: 'File',
        },
        typeLabel: {
            working_tree_diff: 'Current Changes',
        },
    }
};

// Detect and cache user language
const CURRENT_LANG = (function() {
    const lang = navigator.language || navigator.userLanguage;
    return lang.startsWith('zh') ? 'zh' : 'en';
})();

// Get translation
function t(key, ...args) {
    const dict = i18n[CURRENT_LANG] || i18n.en;
    const value = dict[key];
    if (typeof value === 'function') {
        return value(...args);
    }
    return value || key;
}

// Generate review title from input type
function generateTitle(inputType) {
    const dict = i18n[CURRENT_LANG] || i18n.en;
    const type_ = inputType.type;

    // For working_tree_diff, return label directly
    if (type_ === 'working_tree_diff') {
        return dict.typeLabel.working_tree_diff;
    }

    // For commit_diff and file_content, use prefix + value
    let prefix, value;
    if (type_ === 'commit_diff') {
        prefix = dict.prefix.commit;
        value = inputType.commit;
    } else if (type_ === 'file_content') {
        prefix = dict.prefix.file;
        value = inputType.path;
    } else {
        return 'Unknown';
    }

    return `${prefix}: ${value}`;
}

// hrevu Review Application
class ReviewApp {
    constructor() {
        this.data = null;
        this.files = [];
        this.comments = [];
        this.currentFile = null;
        this.pendingComment = null;
        this.editingComment = null;
        this.commentAnchor = null;
        this.composerPositionFrame = null;
        this.measureCanvas = null;
        this.viewMode = 'rendered';
        this.readOnly = false;

        this.init();
    }

    async init() {
        this.initTheme();
        this.bindEvents();
        await this.loadData();
    }

    initTheme() {
        const saved = localStorage.getItem('hrevu-theme') || 'light';
        this.setTheme(saved);

        document.getElementById('theme-toggle').addEventListener('click', () => {
            const current = document.documentElement.getAttribute('data-theme') || 'dark';
            this.setTheme(current === 'dark' ? 'light' : 'dark');
        });
    }

    setTheme(theme) {
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem('hrevu-theme', theme);

        // Update icon
        const icon = document.getElementById('theme-icon');
        icon.textContent = theme === 'dark' ? '🌙' : '☀️';

        // Update highlight.js theme
        const hlTheme = document.getElementById('highlight-theme');
        // Map theme to correct highlight.js CSS file name
        // Note: light theme uses 'github', not 'github-light'
        const hlThemeName = theme === 'light' ? 'github' : `github-${theme}`;
        hlTheme.href = `https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/${hlThemeName}.min.css`;

        // Re-render current file with new theme
        if (this.currentFile) {
            this.renderDiff(this.currentFile);
        }
    }

    detectLanguage(filePath) {
        const ext = filePath.split('.').pop().toLowerCase();
        const langMap = {
            'js': 'javascript', 'ts': 'typescript', 'jsx': 'javascript', 'tsx': 'typescript',
            'py': 'python', 'rs': 'rust', 'go': 'go', 'java': 'java', 'c': 'c',
            'cpp': 'cpp', 'cc': 'cpp', 'cxx': 'cpp', 'h': 'c', 'hpp': 'cpp', 'hxx': 'cpp',
            'cs': 'csharp', 'php': 'php', 'rb': 'ruby', 'kt': 'kotlin', 'swift': 'swift',
            'sh': 'bash', 'bash': 'bash', 'zsh': 'bash', 'fish': 'bash',
            'yaml': 'yaml', 'yml': 'yaml', 'json': 'json', 'toml': 'toml',
            'md': 'markdown', 'markdown': 'markdown', 'mdown': 'markdown', 'mkd': 'markdown', 'html': 'html', 'htm': 'html', 'xml': 'xml',
            'css': 'css', 'scss': 'scss', 'less': 'less',
            'sql': 'sql', 'dockerfile': 'dockerfile', 'Dokerfile': 'dockerfile'
        };
        return langMap[ext] || 'plaintext';
    }

    highlightCode(code, filePath) {
        try {
            const lang = this.detectLanguage(filePath);
            return hljs.highlight(code, { language: lang }).value;
        } catch (e) {
            return this.escapeHtml(code);
        }
    }

    bindEvents() {
        document.getElementById('history-btn').addEventListener('click', () => this.showHistory());
        document.getElementById('history-close').addEventListener('click', () => {
            document.getElementById('history-panel').hidden = true;
        });
        document.getElementById('rendered-view-btn').addEventListener('click', () => this.setViewMode('rendered'));
        document.getElementById('source-view-btn').addEventListener('click', () => this.setViewMode('source'));
        document.getElementById('show-comments-btn').addEventListener('click', () => {
            document.getElementById('comments-sidebar').classList.toggle('active');
        });
        // Complete button
        document.getElementById('complete-btn').addEventListener('click', () => this.completeReview());

        // Comment modal
        document.getElementById('modal-close').addEventListener('click', () => this.closeModal());
        document.getElementById('modal-cancel').addEventListener('click', () => this.closeModal());
        document.getElementById('modal-submit').addEventListener('click', () => this.submitComment());
        document.getElementById('comment-expand').addEventListener('click', () => {
            this.expandCommentComposer();
            document.getElementById('comment-text').focus();
        });
        document.getElementById('comment-compact-close').addEventListener('click', () => this.closeModal());
        document.getElementById('comment-text').addEventListener('input', () => {
            if (document.getElementById('comment-text').value.length) this.expandCommentComposer();
            else this.resizeCommentTextarea();
        });
        document.getElementById('comment-text').addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
                e.preventDefault();
                this.submitComment();
            }
        });

        document.addEventListener('pointerdown', (e) => {
            const modal = document.getElementById('comment-modal');
            const content = document.getElementById('comment-modal-content');
            if (modal.classList.contains('active') && !content.contains(e.target) && !e.target.closest('#view-toggle')) {
                this.closeModal();
            }
        }, true);
        window.addEventListener('resize', () => {
            this.scheduleCommentComposerPosition();
            this.positionReviewComments();
        });
        const reviewView = document.getElementById('diff-view');
        reviewView.addEventListener('pointerdown', (event) => {
            this.reviewGesture = { x: event.clientX, y: event.clientY, moved: false, scrollTop: reviewView.scrollTop, scrollLeft: reviewView.scrollLeft };
        });
        reviewView.addEventListener('pointermove', (event) => {
            if (this.reviewGesture && Math.hypot(event.clientX - this.reviewGesture.x, event.clientY - this.reviewGesture.y) > 6) {
                this.reviewGesture.moved = true;
            }
        });
        reviewView.addEventListener('pointercancel', () => {
            if (this.reviewGesture) this.reviewGesture.moved = true;
        });
        reviewView.addEventListener('scroll', () => {
            if (this.reviewGesture) this.reviewGesture.moved = true;
            this.scheduleCommentComposerPosition();
        }, { passive: true });

        // Global comment
        document.getElementById('add-global-comment-btn').addEventListener('click', (e) => {
            this.openCommentModal(null, null, this.createElementAnchor(e.currentTarget));
        });

        // Comments sidebar
        document.getElementById('comments-close').addEventListener('click', () => {
            document.getElementById('comments-sidebar').classList.remove('active');
        });

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.closeModal();
            }
        });

        // Event delegation for edit/delete buttons in diff view
        document.getElementById('diff-view').addEventListener('click', (e) => {
            if (e.target.matches('.btn-edit')) {
                this.editComment(e.target.dataset.id, e.target);
            } else if (e.target.matches('.btn-delete')) {
                this.deleteComment(e.target.dataset.id);
            }
        });

        // Event delegation for edit/delete buttons in comments sidebar
        document.getElementById('comments-list').addEventListener('click', (e) => {
            if (e.target.matches('.btn-edit')) {
                this.editComment(e.target.dataset.id, e.target);
            } else if (e.target.matches('.btn-delete')) {
                this.deleteComment(e.target.dataset.id);
            }
        });
    }

    async loadData() {
        try {
            const query = new URLSearchParams(window.location.search);
            if (query.has('history')) {
                document.getElementById('complete-btn').hidden = true;
                document.getElementById('add-global-comment-btn').hidden = true;
                document.getElementById('review-title').textContent = t('history');
                await this.showHistory();
                return;
            }
            const review = query.get('review');
            const response = await fetch(`/api/data${review ? `?review=${encodeURIComponent(review)}` : ''}`);
            if (!response.ok) throw new Error(await response.text());
            this.data = await response.json();

            document.getElementById('review-title').textContent = generateTitle(this.data.input_type);
            this.files = this.data.files;
            this.comments = this.data.comments;
            this.readOnly = this.data.read_only;
            this.updateReviewControls();
            if (this.data.snapshot_note) {
                document.getElementById('diff-view').innerHTML = `<p class="recovery-note">${this.escapeHtml(this.data.snapshot_note)}</p>`;
                document.getElementById('comments-sidebar').classList.add('active');
            }

            this.renderFileList();
            this.renderComments();

            // Auto-select first file if available
            if (this.files.length > 0) {
                this.selectFile(this.files[0].path);
            }
        } catch (error) {
            console.error('Failed to load data:', error);
            this.showError(t('failedToLoad'));
        }
    }

    updateReviewControls() {
        document.getElementById('save-status').textContent = this.readOnly ? t('archived') : t('saved');
        document.getElementById('complete-btn').hidden = this.readOnly;
        document.getElementById('add-global-comment-btn').hidden = this.readOnly;
        for (const [id, format] of [['export-text-btn', 'text'], ['export-json-btn', 'json']]) {
            const link = document.getElementById(id);
            link.hidden = false;
            link.href = `/api/reviews/${encodeURIComponent(this.data.review_id)}/export?format=${format}`;
            link.setAttribute('download', '');
        }
    }

    async showHistory() {
        const panel = document.getElementById('history-panel');
        const list = document.getElementById('history-list');
        panel.hidden = false;
        list.textContent = t('loading');
        try {
            const response = await fetch('/api/reviews');
            if (!response.ok) throw new Error(await response.text());
            const reviews = await response.json();
            list.innerHTML = reviews.length ? reviews.map(review => `
                <a class="history-item" href="/?review=${encodeURIComponent(review.id)}">
                    <strong>${this.escapeHtml(review.input)}</strong>
                    <span>${review.status === 'completed' ? t('completed') : t('inProgress')} · ${review.comment_count} ${t('comments')} · ${new Date(review.updated_at).toLocaleString()}</span>
                </a>`).join('') : `<p>${t('noHistory')}</p>`;
        } catch (_) { list.textContent = t('historyFailed'); }
    }

    showError(message) {
        const toast = document.createElement('div');
        toast.className = 'toast toast-error';
        toast.textContent = message;
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 3000);
    }

    showSuccess(message, autoClose = false) {
        const toast = document.createElement('div');
        toast.className = 'toast toast-success';
        toast.textContent = message;
        document.body.appendChild(toast);

        setTimeout(() => {
            toast.remove();
            if (autoClose) {
                window.close();
            }
        }, 2000);
    }

    renderFileList() {
        const fileList = document.getElementById('file-list');
        document.getElementById('file-count').textContent = this.files.length;

        // Group comments by file
        const commentsByFile = {};
        for (const comment of this.comments) {
            if (comment.file) {
                commentsByFile[comment.file] = (commentsByFile[comment.file] || 0) + 1;
            }
        }

        fileList.innerHTML = this.files.map(file => {
            const commentCount = commentsByFile[file.path] || 0;
            return `
                <div class="file-item" data-path="${this.escapeHtml(file.path)}">
                    <span class="file-status ${file.status}"></span>
                    <span class="file-path">${this.escapeHtml(file.path)}</span>
                    ${commentCount > 0 ? `<span class="file-comment-count">${commentCount}</span>` : ''}
                </div>
            `;
        }).join('');

        // Add click handlers
        fileList.querySelectorAll('.file-item').forEach(item => {
            item.addEventListener('click', () => {
                this.selectFile(item.dataset.path);
            });
        });
    }

    selectFile(filePath) {
        this.currentFile = filePath;

        // Update active state
        document.querySelectorAll('.file-item').forEach(item => {
            item.classList.toggle('active', item.dataset.path === filePath);
        });

        // Update header
        document.getElementById('current-file-name').textContent = filePath;

        // Render diff
        this.renderDiff(filePath);
    }

    isMarkdown(file) {
        return /\.(md|markdown|mdown|mkd)$/i.test(file.path) &&
            (file.markdown != null || file.original_markdown != null);
    }

    commentSide(comment, file) {
        return comment.side || (file?.status === 'deleted' ? 'old' : 'new');
    }

    // Include all Markdown lines so comments outside a diff hunk remain visible
    // in source mode. Insert removed rows at their original place in the patch.
    sourceLines(file) {
        if (!this.isMarkdown(file)) return file.lines;
        const source = file.markdown ?? file.original_markdown;
        const lines = source.replace(/\r\n?/g, '\n').split('\n');
        if (lines.length > 1 && lines.at(-1) === '') lines.pop();
        if (file.status === 'deleted') return lines.map((content, index) => ({ number: index + 1, content, type: 'removed' }));
        const changed = new Map(file.lines.filter(line => line.type !== 'removed').map(line => [line.number, line.type]));
        const removed = new Map();
        let pending = [];
        for (const line of file.lines) {
            if (line.type === 'removed') pending.push(line);
            else if (pending.length) {
                removed.set(line.number, pending);
                pending = [];
            }
        }
        const result = lines.flatMap((content, index) => [
            ...(removed.get(index + 1) || []),
            { number: index + 1, content, type: changed.get(index + 1) },
        ]);
        result.push(...pending);
        // A comment can also target unchanged text in the previous snapshot.
        // Keep a reference row if that old line is absent from the actual patch.
        const original = file.original_markdown?.replace(/\r\n?/g, '\n').split('\n') || [];
        for (const comment of [...(this.comments || []), this.pendingComment].filter(Boolean)) {
            if (comment.file !== file.path || !comment.line || this.commentSide(comment, file) !== 'old') continue;
            if (result.some(line => line.number === comment.line && (line.type === 'removed' || line.side === 'old'))) continue;
            const index = result.findIndex(line => line.number >= comment.line);
            result.splice(index < 0 ? result.length : index, 0, {
                number: comment.line, content: original[comment.line - 1] || '', type: 'previous', side: 'old',
            });
        }
        return result;
    }

    setViewMode(mode) {
        if (this.viewMode === mode) return;
        const view = document.getElementById('diff-view');
        const top = [...view.querySelectorAll('[data-source-start], .diff-line')]
            .find(el => el.getBoundingClientRect().bottom >= view.getBoundingClientRect().top);
        const line = Number(top?.dataset.sourceStart || top?.dataset.line || 1);
        this.viewMode = mode;
        this.renderDiff(this.currentFile);
        const target = mode === 'source'
            ? view.querySelector(`.diff-line[data-line="${line}"]`)
            : this.findMarkdownBlock(view.querySelector('.markdown-body'), { line });
        target?.scrollIntoView({ block: 'start' });
    }

    renderDiff(filePath) {
        const file = this.files.find(file => file.path === filePath);
        const markdown = file && this.isMarkdown(file);
        document.getElementById('view-toggle').hidden = !markdown;
        document.getElementById('rendered-view-btn').setAttribute('aria-pressed', String(this.viewMode === 'rendered'));
        document.getElementById('source-view-btn').setAttribute('aria-pressed', String(this.viewMode === 'source'));
        if (markdown && this.viewMode === 'rendered') this.renderMarkdown(file);
        else this.renderSource(filePath);
        // A draft is the same comment even when its DOM anchor is replaced.
        if (this.pendingComment) {
            this.commentAnchor = this.createStoredCommentAnchor(this.editingComment || this.pendingComment) || this.commentAnchor;
            this.scheduleCommentComposerPosition();
        }
    }

    renderMarkdown(file) {
        const view = document.getElementById('diff-view');
        const side = file.markdown == null ? 'old' : 'new';
        const article = (source, side) => `<article class="markdown-body" data-side="${side}" data-lines="${source.split('\n').length}">${markdownParser.render(source)}</article>`;
        const oldComments = [...this.comments, this.pendingComment].filter(Boolean).some(comment => comment.file === file.path && this.commentSide(comment, file) === 'old');
        view.innerHTML = `<p class="preview-hint">${t('previewHint')}</p>${article(file.markdown ?? file.original_markdown, side)}
            ${side === 'new' && oldComments && file.original_markdown != null ? `<details class="previous-version" open><summary>${t('previousVersion')}</summary>${article(file.original_markdown, 'old')}</details>` : ''}`;
        view.onclick = event => {
            if (this.readOnly || this.viewMode !== 'rendered' || !this.isCommentClick(event)) return;
            const body = event.target.closest('.markdown-body');
            if (!body) return;
            const bodyRect = body.getBoundingClientRect();
            const style = getComputedStyle(body);
            if (event.clientX < bodyRect.left + parseFloat(style.paddingLeft) ||
                event.clientX > bodyRect.right - parseFloat(style.paddingRight)) return;
            if (event.target.closest('.inline-comments, .review-pin, summary, a, button')) return;
            const block = this.blockAtPoint(body, event.clientX, event.clientY);
            const rect = block.getBoundingClientRect();
            const x = (event.clientX - rect.left) / Math.max(1, rect.width);
            const y = (event.clientY - rect.top) / Math.max(1, rect.height);
            const start = Number(block.dataset.sourceStart || 1);
            const end = Number(block.dataset.sourceEnd || body.dataset.lines);
            const selection = window.getSelection();
            const quote = selection && body.contains(selection.anchorNode) && body.contains(selection.focusNode) ? selection.toString() : '';
            const anchor = { start_line: start, end_line: end, x, y, quote: (quote || block.textContent).trim().slice(0, 240) };
            const line = this.clamp(start + Math.floor(y * (end - start + 1)), start, end);
            this.openCommentModal(file.path, line, this.createPointAnchor(block, x, y));
            this.pendingComment.side = body.dataset.side;
            this.pendingComment.anchor = anchor;
            this.updateCommentComposerInfo(file.path, line, null, anchor);
        };
        view.querySelectorAll('.markdown-body').forEach(body => {
            // Keyboard users can add a comment at the start of a rendered block.
            body.tabIndex = 0;
            body.addEventListener('keydown', event => {
                if (event.key !== 'Enter' || event.target !== body) return;
                event.preventDefault();
                const block = body.querySelector('[data-source-start]') || body;
                const rect = block.getBoundingClientRect();
                block.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: rect.left, clientY: rect.top }));
            });
        });
        for (const comment of this.comments.filter(comment => comment.file === file.path && comment.line)) {
            const body = this.markdownArticle(comment);
            if (!body) continue;
            const block = this.findMarkdownBlock(body, comment);
            let after = block;
            while (after.parentElement !== body && after !== body) after = after.parentElement;
            let group = after === body ? body.querySelector(':scope > .inline-comments') : after.nextElementSibling;
            if (!group?.classList.contains('inline-comments')) {
                group = document.createElement('div');
                group.className = 'inline-comments rendered-comments';
                if (after === body) body.append(group);
                else after.after(group);
            }
            group.insertAdjacentHTML('beforeend', this.renderInlineComment(comment));
            const pin = document.createElement('button');
            pin.className = 'review-pin';
            pin.dataset.id = comment.id;
            pin.textContent = String(this.comments.indexOf(comment) + 1);
            pin.title = comment.text;
            pin.setAttribute('aria-label', this.readOnly ? comment.text : `${t('edit')}: ${comment.text}`);
            pin.addEventListener('click', () => {
                if (this.readOnly) body.querySelector(`.inline-comment[data-id="${comment.id}"]`)?.scrollIntoView({ block: 'nearest' });
                else this.editComment(comment.id, pin);
            });
            body.append(pin);
        }
        view.querySelectorAll('img').forEach(img => img.addEventListener('load', () => this.positionReviewComments()));
        view.querySelectorAll('details').forEach(details => details.addEventListener('toggle', () => this.positionReviewComments()));
        this.positionReviewComments();
        renderMermaidDiagrams(view, () => this.positionReviewComments());
    }

    markdownArticle(comment) {
        const file = this.files.find(file => file.path === comment.file);
        return document.querySelector(`.markdown-body[data-side="${this.commentSide(comment, file)}"]`);
    }

    isCommentClick(event) {
        if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return false;
        // Keyboard activation has no pointer gesture. A drag stays a drag even
        // when it ends back at its starting point or scrolls the document.
        if (event.detail === 0) return true;
        const gesture = this.reviewGesture;
        const view = document.getElementById('diff-view');
        return !gesture || (!gesture.moved && gesture.scrollTop === view.scrollTop && gesture.scrollLeft === view.scrollLeft &&
            Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y) <= 6);
    }

    findMarkdownBlock(body, comment) {
        if (!body) return null;
        const start = comment.anchor?.start_line || comment.line || 1;
        const end = comment.anchor?.end_line || start;
        const blocks = [...body.querySelectorAll('[data-source-start]')];
        // Prefer the smallest containing block (table row, list item, paragraph).
        const containing = blocks.filter(el => Number(el.dataset.sourceStart) <= start && Number(el.dataset.sourceEnd) >= end);
        containing.sort((a, b) => (a.dataset.sourceEnd - a.dataset.sourceStart) - (b.dataset.sourceEnd - b.dataset.sourceStart));
        return containing[0] || blocks.sort((a, b) => Math.abs(a.dataset.sourceStart - start) - Math.abs(b.dataset.sourceStart - start))[0] || body;
    }

    blockAtPoint(body, x, y) {
        const blocks = [...body.querySelectorAll('[data-source-start]')].filter(el => el.getBoundingClientRect().height > 0);
        let nearest = body;
        let distance = Infinity;
        for (const block of blocks) {
            const rect = block.getBoundingClientRect();
            const d = Math.max(rect.top - y, 0, y - rect.bottom) + Math.max(rect.left - x, 0, x - rect.right);
            if (d <= distance) { nearest = block; distance = d; }
        }
        // Equal source ranges can belong to nested elements. Capture points
        // against the same canonical element used when restoring comments.
        return this.findMarkdownBlock(body, { anchor: {
            start_line: Number(nearest.dataset.sourceStart || 1),
            end_line: Number(nearest.dataset.sourceEnd || body.dataset.lines),
        } });
    }

    renderedPoint(comment, body) {
        const block = this.findMarkdownBlock(body, comment);
        const start = Number(block.dataset.sourceStart || 1);
        const end = Number(block.dataset.sourceEnd || body.dataset.lines);
        return {
            block,
            x: comment.anchor?.x ?? Math.min(0.95, ((comment.column || 1) - 1) / 100),
            y: comment.anchor?.y ?? this.clamp(((comment.line || start) - start + 0.5) / (end - start + 1), 0, 1),
        };
    }

    createPointAnchor(block, x, y) {
        const rect = block.getBoundingClientRect();
        return { sourceElement: block, xElement: block, xOffset: rect.width * x, yOffset: rect.height * y,
            point: true, staticX: rect.left + rect.width * x, staticDecisionY: rect.top + rect.height * y,
            staticAboveY: rect.top + rect.height * y, staticBelowY: rect.top + rect.height * y };
    }

    positionReviewComments() {
        const view = document.getElementById('diff-view');
        this.positionInlineComments(view);
        view.querySelectorAll('.review-pin').forEach(pin => {
            const comment = this.comments.find(comment => comment.id === pin.dataset.id);
            const body = pin.parentElement;
            const point = this.renderedPoint(comment, body);
            const rect = point.block.getBoundingClientRect();
            const bodyRect = body.getBoundingClientRect();
            pin.style.left = `${rect.left - bodyRect.left + point.x * rect.width}px`;
            pin.style.top = `${rect.top - bodyRect.top + point.y * rect.height}px`;
        });
        if (this.pendingComment) {
            this.commentAnchor = this.createStoredCommentAnchor(this.editingComment || this.pendingComment) || this.commentAnchor;
            this.scheduleCommentComposerPosition();
        }
    }

    renderSource(filePath) {
        const diffView = document.getElementById('diff-view');
        diffView.onclick = null;
        const file = this.files.find(f => f.path === filePath);

        if (!file) {
            diffView.innerHTML = '<div class="empty-state">File not found</div>';
            return;
        }

        // Get comments for this file grouped by line
        const commentsByLine = {};
        for (const comment of this.comments) {
            if (comment.file === filePath && comment.line) {
                const key = `${comment.line}:${this.commentSide(comment, file)}`;
                (commentsByLine[key] ||= []).push(comment);
            }
        }

        let html = `<div class="file-diff">
            <div class="file-diff-header">
                <span class="file-status ${file.status}"></span>
                <h3>${this.escapeHtml(filePath)}</h3>
            </div>`;

        for (const line of this.sourceLines(file)) {
            const side = line.side || (line.type === 'removed' ? 'old' : 'new');
            const lineComments = commentsByLine[`${line.number}:${side}`] || [];
            const lineClass = line.type ? line.type : 'context';
            const hasComments = lineComments.length > 0;

            html += `
                <div class="diff-line ${lineClass}"
                     data-file="${this.escapeHtml(filePath)}"
                     data-line="${line.number}" data-side="${side}"${line.type === 'previous' ? ` title="${t('previousVersion')}"` : ''}>
                    <span class="diff-line-number">${line.number > 0 ? line.number : ''}</span>
                    <span class="diff-line-content"><code>${this.highlightCode(line.content, filePath)}</code></span>
                    ${hasComments ? `<span class="comment-marker">${lineComments.length}</span>` : ''}
                </div>
            `;

            // Render inline comments
            if (hasComments) {
                html += `<div class="inline-comments" data-line="${line.number}" data-side="${side}">`;
                for (const comment of lineComments) {
                    html += this.renderInlineComment(comment);
                }
                html += '</div>';
            }
        }

        html += '</div>';
        diffView.innerHTML = html;

        // Add click handlers to lines
        diffView.querySelectorAll('.diff-line').forEach(lineEl => {
            lineEl.addEventListener('click', (event) => {
                if (this.readOnly || !this.isCommentClick(event)) return;
                const file = lineEl.dataset.file;
                const lineNum = parseInt(lineEl.dataset.line);
                if (lineNum > 0) {
                    const anchor = this.createLineAnchor(event, lineEl);
                    this.openCommentModal(file, lineNum, anchor);
                    this.pendingComment.side = lineEl.dataset.side;
                }
            });
        });

        this.positionInlineComments(diffView);
    }

    renderInlineComment(comment) {
        const time = new Date(comment.created_at).toLocaleTimeString();
        return `
            <div class="inline-comment" data-id="${comment.id}"${comment.column ? ` data-column="${comment.column}"` : ''}>
                <div class="inline-comment-header">
                    <div class="inline-comment-meta">
                        <span class="inline-comment-avatar" aria-hidden="true">🤔</span>
                        <span class="inline-comment-author">${t('you')}</span>
                        <span class="inline-comment-time">${time}</span>
                    </div>
                    <div class="inline-comment-actions"${this.readOnly ? ' hidden' : ''}>
                        <button type="button" class="inline-comment-action btn-edit" data-id="${comment.id}">${t('edit')}</button>
                        <button type="button" class="inline-comment-action inline-comment-action-danger btn-delete" data-id="${comment.id}">${t('delete')}</button>
                    </div>
                </div>
                ${comment.anchor?.quote ? `<div class="comment-quote">${this.escapeHtml(comment.anchor.quote)}</div>` : ''}
                <div class="inline-comment-text">${this.escapeHtml(comment.text)}</div>
            </div>
        `;
    }

    positionInlineComments(diffView) {
        diffView.querySelectorAll('.inline-comments').forEach(group => {
            const line = diffView.querySelector(`.diff-line[data-line="${group.dataset.line}"][data-side="${group.dataset.side}"]`);
            const content = line && line.querySelector('.diff-line-content');
            if (!content) return;

            const groupRect = group.getBoundingClientRect();
            const contentRect = content.getBoundingClientRect();
            const contentStart = Math.max(0, contentRect.left - groupRect.left);
            const availableWidth = group.clientWidth;
            const cardWidth = Math.max(0, Math.min(460, availableWidth - contentStart));
            const maxLeft = Math.max(contentStart, availableWidth - cardWidth);

            group.querySelectorAll('.inline-comment').forEach(card => {
                const column = Number.parseInt(card.dataset.column, 10);
                const anchorViewportX = Number.isFinite(column)
                    ? this.getColumnX(content, column)
                    : contentRect.left;
                const anchorX = this.clamp(
                    anchorViewportX - groupRect.left,
                    contentStart,
                    availableWidth
                );
                const left = this.clamp(anchorX - 14, contentStart, maxLeft);
                const cardAnchorX = this.clamp(anchorX - left, 12, Math.max(12, cardWidth - 12));

                card.style.setProperty('--comment-card-left', `${Math.round(left)}px`);
                card.style.setProperty('--comment-card-width', `${Math.round(cardWidth)}px`);
                card.style.setProperty('--comment-card-anchor-x', `${Math.round(cardAnchorX)}px`);
            });
        });
    }

    renderComments() {
        const commentsList = document.getElementById('comments-list');

        if (this.comments.length === 0) {
            commentsList.innerHTML = `<div class="empty-state">${t('noCommentsYet')}</div>`;
            return;
        }

        commentsList.innerHTML = this.comments.map(comment => {
            const time = new Date(comment.created_at).toLocaleString();
            const location = comment.file
                ? `${comment.file}${comment.anchor ? `:≈L${comment.anchor.start_line}–${comment.anchor.end_line}` : comment.line ? `:L${comment.line}` : ''}${comment.column ? `:C${comment.column}` : ''}${comment.side === 'old' ? ` (${t('removedContent')})` : ''}`
                : t('globalCommentLabel');

            return `
                <div class="comment-card" data-id="${comment.id}">
                    <div class="comment-card-header">
                        <span class="comment-card-location">${this.escapeHtml(location)}</span>
                        <span class="comment-card-time">${time}</span>
                    </div>
                    ${comment.anchor?.quote ? `<div class="comment-quote">${this.escapeHtml(comment.anchor.quote)}</div>` : ''}
                    <div class="comment-card-text">${this.escapeHtml(comment.text)}</div>
                    <div class="comment-card-actions"${this.readOnly ? ' hidden' : ''}>
                        <button class="btn-edit" data-id="${comment.id}">${t('edit')}</button>
                        <button class="btn-delete" data-id="${comment.id}">${t('delete')}</button>
                    </div>
                </div>
            `;
        }).join('');
    }

    openCommentModal(file, line, anchor = null) {
        if (this.readOnly) return;
        this.commentAnchor = anchor || this.createViewportAnchor();
        this.pendingComment = { file, line, column: this.commentAnchor.column || null, side: null, anchor: null };
        this.editingComment = null;

        this.updateCommentComposerInfo(file, line, this.commentAnchor.column);
        document.getElementById('comment-modal-title').textContent = t('addComment');
        document.getElementById('modal-submit').textContent = t('addComment');
        this.showCommentComposer('');
    }

    openEditModal(comment, anchor = null) {
        if (this.readOnly) return;
        this.editingComment = comment;
        this.pendingComment = { file: comment.file, line: comment.line, column: comment.column || null };
        this.commentAnchor = this.createStoredCommentAnchor(comment) || anchor || this.createViewportAnchor();

        this.updateCommentComposerInfo(comment.file, comment.line, comment.column, comment.anchor);
        document.getElementById('comment-modal-title').textContent = t('updateComment');
        document.getElementById('modal-submit').textContent = t('updateComment');
        this.showCommentComposer(comment.text);
    }

    closeModal() {
        const modal = document.getElementById('comment-modal');
        modal.classList.remove('active');
        modal.setAttribute('aria-hidden', 'true');
        document.getElementById('comment-modal-content').removeAttribute('data-placement');
        if (this.composerPositionFrame !== null) {
            cancelAnimationFrame(this.composerPositionFrame);
            this.composerPositionFrame = null;
        }
        this.pendingComment = null;
        this.editingComment = null;
        this.commentAnchor = null;
    }

    showCommentComposer(text) {
        const modal = document.getElementById('comment-modal');
        const textarea = document.getElementById('comment-text');
        textarea.value = text;
        textarea.style.height = '';
        modal.classList.toggle('compact', !text && !this.editingComment);
        document.getElementById('comment-expand').setAttribute('aria-label', t('expandComment'));
        document.getElementById('comment-compact-close').setAttribute('aria-label', t('closeComment'));
        document.getElementById('comment-submit-hint').textContent = t('submitHint');
        modal.classList.add('active');
        modal.setAttribute('aria-hidden', 'false');
        this.resizeCommentTextarea();
        this.scheduleCommentComposerPosition();
        textarea.focus();
    }

    expandCommentComposer() {
        document.getElementById('comment-modal').classList.remove('compact');
        this.resizeCommentTextarea();
    }

    updateCommentComposerInfo(file, line, column, anchor = null) {
        const info = document.getElementById('comment-info');
        if (anchor) {
            info.textContent = `${file} · ≈ L${anchor.start_line}–${anchor.end_line} · ${anchor.quote}`;
        } else if (file && line) {
            info.textContent = `${file} · L${line}${column ? `:C${column}` : ''}`;
        } else if (file) {
            info.textContent = file;
        } else {
            info.textContent = t('globalCommentLabel');
        }
        info.title = info.textContent;
    }

    resizeCommentTextarea() {
        const textarea = document.getElementById('comment-text');
        const compact = document.getElementById('comment-modal').classList.contains('compact');
        textarea.style.height = 'auto';
        textarea.style.height = compact ? '32px' : `${Math.min(Math.max(textarea.scrollHeight, 82), 220)}px`;
        this.scheduleCommentComposerPosition();
    }

    scheduleCommentComposerPosition() {
        if (!document.getElementById('comment-modal').classList.contains('active')) {
            return;
        }
        if (this.composerPositionFrame !== null) {
            cancelAnimationFrame(this.composerPositionFrame);
        }
        this.composerPositionFrame = requestAnimationFrame(() => {
            this.composerPositionFrame = null;
            this.positionCommentComposer();
        });
    }

    positionCommentComposer() {
        if (!this.commentAnchor) return;

        const modal = document.getElementById('comment-modal');
        const content = document.getElementById('comment-modal-content');
        const coords = this.resolveCommentAnchor(this.commentAnchor);
        const margin = 8;
        const gap = 9;
        const width = content.offsetWidth;
        const height = content.offsetHeight;
        const spaceBelow = window.innerHeight - coords.belowY - gap - margin;
        const spaceAbove = coords.aboveY - gap - margin;

        let placement = (coords.decisionY <= window.innerHeight / 2 || spaceBelow >= height)
            ? 'below'
            : 'above';

        // When neither side can fully fit, use the side with more usable space.
        if (placement === 'below' && spaceBelow < height && spaceAbove > spaceBelow) {
            placement = 'above';
        } else if (placement === 'above' && spaceAbove < height && spaceBelow > spaceAbove) {
            placement = 'below';
        }

        const anchorY = placement === 'below' ? coords.belowY : coords.aboveY;
        const preferredTop = placement === 'below'
            ? anchorY + gap
            : anchorY - gap - height;
        const maxLeft = Math.max(margin, window.innerWidth - margin - width);
        const maxTop = Math.max(margin, window.innerHeight - margin - height);
        const left = this.clamp(coords.x - 28, margin, maxLeft);
        const top = this.clamp(preferredTop, margin, maxTop);
        const arrowX = this.clamp(coords.x - left, 18, width - 18);

        content.dataset.placement = placement;
        content.style.left = `${Math.round(left)}px`;
        content.style.top = `${Math.round(top)}px`;
        content.style.setProperty('--comment-arrow-x', `${Math.round(arrowX)}px`);
        modal.style.setProperty('--comment-anchor-x', `${Math.round(coords.x)}px`);
        modal.style.setProperty('--comment-anchor-y', `${Math.round(anchorY)}px`);
    }

    createLineAnchor(event, lineElement) {
        const contentElement = lineElement.querySelector('.diff-line-content');
        const lineRect = lineElement.getBoundingClientRect();
        const contentRect = contentElement.getBoundingClientRect();
        const pointX = this.clamp(event.clientX, contentRect.left, window.innerWidth - 8);

        return {
            sourceElement: lineElement,
            xElement: contentElement,
            xOffset: pointX - contentRect.left,
            yOffset: this.clamp(event.clientY - lineRect.top, 0, lineRect.height),
            staticX: pointX,
            staticDecisionY: event.clientY,
            staticAboveY: lineRect.top,
            staticBelowY: lineRect.bottom,
            column: this.getColumnAtPoint(contentElement, pointX, event.clientY),
        };
    }

    createElementAnchor(element) {
        const rect = element.getBoundingClientRect();
        const xOffset = rect.width / 2;
        return {
            sourceElement: element,
            xElement: element,
            xOffset,
            yOffset: rect.height / 2,
            staticX: rect.left + xOffset,
            staticDecisionY: rect.top + rect.height / 2,
            staticAboveY: rect.top,
            staticBelowY: rect.bottom,
            column: null,
        };
    }

    createViewportAnchor() {
        const x = window.innerWidth / 2;
        const y = window.innerHeight / 2;
        return {
            sourceElement: null,
            xElement: null,
            xOffset: 0,
            yOffset: 0,
            staticX: x,
            staticDecisionY: y,
            staticAboveY: y,
            staticBelowY: y,
            column: null,
        };
    }

    resolveCommentAnchor(anchor) {
        if (anchor.sourceElement && anchor.sourceElement.isConnected) {
            const sourceRect = anchor.sourceElement.getBoundingClientRect();
            const xRect = anchor.xElement.getBoundingClientRect();
            return {
                x: this.clamp(xRect.left + anchor.xOffset, 8, window.innerWidth - 8),
                decisionY: sourceRect.top + anchor.yOffset,
                aboveY: anchor.point ? sourceRect.top + anchor.yOffset : sourceRect.top,
                belowY: anchor.point ? sourceRect.top + anchor.yOffset : sourceRect.bottom,
            };
        }

        return {
            x: anchor.staticX,
            decisionY: anchor.staticDecisionY,
            aboveY: anchor.staticAboveY,
            belowY: anchor.staticBelowY,
        };
    }

    getColumnAtPoint(contentElement, x, y) {
        const text = contentElement.textContent || '';
        let caretNode = null;
        let caretOffset = 0;

        if (document.caretPositionFromPoint) {
            const caret = document.caretPositionFromPoint(x, y);
            caretNode = caret && caret.offsetNode;
            caretOffset = caret ? caret.offset : 0;
        } else if (document.caretRangeFromPoint) {
            const range = document.caretRangeFromPoint(x, y);
            caretNode = range && range.startContainer;
            caretOffset = range ? range.startOffset : 0;
        }

        if (caretNode && contentElement.contains(caretNode)) {
            try {
                const range = document.createRange();
                range.setStart(contentElement, 0);
                range.setEnd(caretNode, caretOffset);
                return Math.min(Array.from(range.toString()).length + 1, Array.from(text).length + 1);
            } catch (_) {
                // Fall through to monospace measurement for unusual DOM caret results.
            }
        }

        const codeElement = contentElement.querySelector('code') || contentElement;
        const style = getComputedStyle(codeElement);
        this.measureCanvas = this.measureCanvas || document.createElement('canvas');
        const context = this.measureCanvas.getContext('2d');
        context.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
        const characterWidth = context.measureText('0').width || 7;
        const contentLeft = contentElement.getBoundingClientRect().left;
        const measuredColumn = Math.round(Math.max(0, x - contentLeft) / characterWidth) + 1;
        return Math.min(measuredColumn, Array.from(text).length + 1);
    }

    getColumnX(contentElement, column) {
        let remaining = Math.max(0, column - 1);
        const walker = document.createTreeWalker(contentElement, NodeFilter.SHOW_TEXT);
        let node = walker.nextNode();

        while (node) {
            const characters = Array.from(node.textContent || '');
            if (remaining <= characters.length) {
                const utf16Offset = characters.slice(0, remaining).join('').length;
                try {
                    const range = document.createRange();
                    range.setStart(node, utf16Offset);
                    range.collapse(true);
                    const rect = range.getBoundingClientRect();
                    if (rect.left) return rect.left;
                } catch (_) {
                    // Fall through to canvas measurement.
                }
                break;
            }
            remaining -= characters.length;
            node = walker.nextNode();
        }

        const text = Array.from(contentElement.textContent || '');
        const prefix = text.slice(0, Math.max(0, column - 1)).join('');
        const codeElement = contentElement.querySelector('code') || contentElement;
        const style = getComputedStyle(codeElement);
        this.measureCanvas = this.measureCanvas || document.createElement('canvas');
        const context = this.measureCanvas.getContext('2d');
        context.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
        return contentElement.getBoundingClientRect().left + context.measureText(prefix).width;
    }

    createStoredCommentAnchor(comment) {
        if (!comment.line || comment.file !== this.currentFile) return null;
        const article = this.markdownArticle(comment);
        if (article) {
            const point = this.renderedPoint(comment, article);
            return this.createPointAnchor(point.block, point.x, point.y);
        }

        const file = this.files.find(file => file.path === comment.file);
        const line = document.querySelector(`.diff-line[data-line="${comment.line}"][data-side="${this.commentSide(comment, file)}"]`);
        const content = line && line.querySelector('.diff-line-content');
        if (!line || !content) return null;

        const lineRect = line.getBoundingClientRect();
        const contentRect = content.getBoundingClientRect();
        const x = comment.column ? this.getColumnX(content, comment.column) : contentRect.left;
        return {
            sourceElement: line,
            xElement: content,
            xOffset: x - contentRect.left,
            yOffset: lineRect.height / 2,
            staticX: x,
            staticDecisionY: lineRect.top + lineRect.height / 2,
            staticAboveY: lineRect.top,
            staticBelowY: lineRect.bottom,
            column: comment.column || null,
        };
    }

    clamp(value, min, max) {
        return Math.min(max, Math.max(min, value));
    }

    async submitComment() {
        if (this.readOnly) return;
        const text = document.getElementById('comment-text').value.trim();
        if (!text) return;

        try {
            let response;
            if (this.editingComment) {
                // Update existing comment
                response = await fetch(`/api/comments/${this.editingComment.id}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ text })
                });

                if (response.ok) {
                    const updated = await response.json();
                    const idx = this.comments.findIndex(c => c.id === this.editingComment.id);
                    if (idx !== -1) {
                        this.comments[idx] = updated;
                    }
                    this.showSuccess(t('commentUpdated'));
                }
            } else {
                // Add new comment
                response = await fetch('/api/comments', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        file: this.pendingComment.file,
                        line: this.pendingComment.line,
                        column: this.pendingComment.column,
                        side: this.pendingComment.side,
                        anchor: this.pendingComment.anchor,
                        text: text
                    })
                });

                if (response.ok) {
                    const comment = await response.json();
                    this.comments.push(comment);
                    this.showSuccess(t('commentAdded'));
                }
            }

            if (!response.ok) throw new Error(await response.text());
            this.closeModal();
            this.renderFileList();
            this.renderComments();
            if (this.currentFile) {
                this.renderDiff(this.currentFile);
            }
        } catch (error) {
            console.error('Failed to save comment:', error);
            this.showError(t('failedToSave'));
        }
    }

    editComment(id, sourceElement = null) {
        const comment = this.comments.find(c => c.id === id);
        if (comment) {
            const anchor = sourceElement ? this.createElementAnchor(sourceElement) : null;
            this.openEditModal(comment, anchor);
        }
    }

    async deleteComment(id) {
        if (this.readOnly) return;
        try {
            const response = await fetch(`/api/comments/${id}`, {
                method: 'DELETE'
            });

            if (!response.ok) throw new Error(await response.text());
            if (response.ok) {
                this.comments = this.comments.filter(c => c.id !== id);
                this.renderFileList();
                this.renderComments();
                if (this.currentFile) {
                    this.renderDiff(this.currentFile);
                }
                this.showSuccess(t('commentDeleted'));
            }
        } catch (error) {
            console.error('Failed to delete comment:', error);
            this.showError(t('failedToDelete'));
        }
    }

    async completeReview() {
        if (this.readOnly) return;
        try {
            const response = await fetch('/api/complete', {
                method: 'POST'
            });
            if (!response.ok) throw new Error(await response.text());

            if (response.ok) {
                const result = await response.json();
                this.showSuccess(t('reviewComplete', result.comment_count));
                this.readOnly = true;
                this.closeModal();
                this.updateReviewControls();
                this.renderComments();
                if (this.currentFile) this.renderDiff(this.currentFile);

                // Update button state
                const btn = document.getElementById('complete-btn');
                btn.textContent = `✓ ${t('complete')}`;
                btn.disabled = true;
            }
        } catch (error) {
            console.error('Failed to complete review:', error);
            this.showError(t('failedToComplete'));
        }
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }
}

// Initialize the app
const app = new ReviewApp();
