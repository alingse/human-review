// i18n Translations
const i18n = {
    zh: {
        files: '文件',
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
            'md': 'markdown', 'html': 'html', 'htm': 'html', 'xml': 'xml',
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
        // Complete button
        document.getElementById('complete-btn').addEventListener('click', () => this.completeReview());

        // Comment modal
        document.getElementById('modal-close').addEventListener('click', () => this.closeModal());
        document.getElementById('modal-cancel').addEventListener('click', () => this.closeModal());
        document.getElementById('modal-submit').addEventListener('click', () => this.submitComment());
        document.getElementById('comment-text').addEventListener('input', () => {
            this.resizeCommentTextarea();
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
            if (modal.classList.contains('active') && !content.contains(e.target)) {
                this.closeModal();
            }
        }, true);
        window.addEventListener('resize', () => {
            this.scheduleCommentComposerPosition();
            this.positionInlineComments(document.getElementById('diff-view'));
        });
        document.getElementById('diff-view').addEventListener('scroll', () => {
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
            const response = await fetch('/api/data');
            this.data = await response.json();

            document.getElementById('review-title').textContent = generateTitle(this.data.input_type);
            this.files = this.data.files;
            this.comments = this.data.comments;

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

    renderDiff(filePath) {
        const diffView = document.getElementById('diff-view');
        const file = this.files.find(f => f.path === filePath);

        if (!file) {
            diffView.innerHTML = '<div class="empty-state">File not found</div>';
            return;
        }

        // Get comments for this file grouped by line
        const commentsByLine = {};
        for (const comment of this.comments) {
            if (comment.file === filePath && comment.line) {
                if (!commentsByLine[comment.line]) {
                    commentsByLine[comment.line] = [];
                }
                commentsByLine[comment.line].push(comment);
            }
        }

        let html = `<div class="file-diff">
            <div class="file-diff-header">
                <span class="file-status ${file.status}"></span>
                <h3>${this.escapeHtml(filePath)}</h3>
            </div>`;

        for (const line of file.lines) {
            const lineClass = line.type ? line.type : 'context';
            const hasComments = commentsByLine[line.number] && commentsByLine[line.number].length > 0;

            html += `
                <div class="diff-line ${lineClass}"
                     data-file="${this.escapeHtml(filePath)}"
                     data-line="${line.number}">
                    <span class="diff-line-number">${line.number > 0 ? line.number : ''}</span>
                    <span class="diff-line-content"><code>${this.highlightCode(line.content, filePath)}</code></span>
                    ${hasComments ? `<span class="comment-marker">${commentsByLine[line.number].length}</span>` : ''}
                </div>
            `;

            // Render inline comments
            if (hasComments) {
                html += `<div class="inline-comments" data-line="${line.number}">`;
                for (const comment of commentsByLine[line.number]) {
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
                const file = lineEl.dataset.file;
                const lineNum = parseInt(lineEl.dataset.line);
                if (lineNum > 0) {
                    const anchor = this.createLineAnchor(event, lineEl);
                    this.openCommentModal(file, lineNum, anchor);
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
                    <div class="inline-comment-actions">
                        <button type="button" class="inline-comment-action btn-edit" data-id="${comment.id}">${t('edit')}</button>
                        <button type="button" class="inline-comment-action inline-comment-action-danger btn-delete" data-id="${comment.id}">${t('delete')}</button>
                    </div>
                </div>
                <div class="inline-comment-text">${this.escapeHtml(comment.text)}</div>
            </div>
        `;
    }

    positionInlineComments(diffView) {
        diffView.querySelectorAll('.inline-comments').forEach(group => {
            const line = diffView.querySelector(`.diff-line[data-line="${group.dataset.line}"]`);
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
                ? `${comment.file}${comment.line ? `:L${comment.line}` : ''}${comment.column ? `:C${comment.column}` : ''}`
                : t('globalCommentLabel');

            return `
                <div class="comment-card" data-id="${comment.id}">
                    <div class="comment-card-header">
                        <span class="comment-card-location">${this.escapeHtml(location)}</span>
                        <span class="comment-card-time">${time}</span>
                    </div>
                    <div class="comment-card-text">${this.escapeHtml(comment.text)}</div>
                    <div class="comment-card-actions">
                        <button class="btn-edit" data-id="${comment.id}">${t('edit')}</button>
                        <button class="btn-delete" data-id="${comment.id}">${t('delete')}</button>
                    </div>
                </div>
            `;
        }).join('');
    }

    openCommentModal(file, line, anchor = null) {
        this.commentAnchor = anchor || this.createViewportAnchor();
        this.pendingComment = { file, line, column: this.commentAnchor.column || null };
        this.editingComment = null;

        this.updateCommentComposerInfo(file, line, this.commentAnchor.column);
        document.getElementById('comment-modal-title').textContent = t('addComment');
        document.getElementById('modal-submit').textContent = t('addComment');
        this.showCommentComposer('');
    }

    openEditModal(comment, anchor = null) {
        this.editingComment = comment;
        this.pendingComment = { file: comment.file, line: comment.line, column: comment.column || null };
        this.commentAnchor = this.createStoredCommentAnchor(comment) || anchor || this.createViewportAnchor();

        this.updateCommentComposerInfo(comment.file, comment.line, comment.column);
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
        document.getElementById('comment-submit-hint').textContent = t('submitHint');
        modal.classList.add('active');
        modal.setAttribute('aria-hidden', 'false');
        this.resizeCommentTextarea();
        this.scheduleCommentComposerPosition();
        textarea.focus();
    }

    updateCommentComposerInfo(file, line, column) {
        const info = document.getElementById('comment-info');
        if (file && line) {
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
        textarea.style.height = 'auto';
        textarea.style.height = `${Math.min(Math.max(textarea.scrollHeight, 82), 220)}px`;
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
                aboveY: sourceRect.top,
                belowY: sourceRect.bottom,
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

        const line = document.querySelector(`.diff-line[data-line="${comment.line}"]`);
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
                        text: text
                    })
                });

                if (response.ok) {
                    const comment = await response.json();
                    this.comments.push(comment);
                    this.showSuccess(t('commentAdded'));
                }
            }

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
        try {
            const response = await fetch(`/api/comments/${id}`, {
                method: 'DELETE'
            });

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
        try {
            const response = await fetch('/api/complete', {
                method: 'POST'
            });

            if (response.ok) {
                const result = await response.json();
                this.showSuccess(t('reviewComplete', result.comment_count), true);

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
        return div.innerHTML;
    }
}

// Initialize the app
const app = new ReviewApp();
