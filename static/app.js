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

        this.init();
    }

    async init() {
        this.initTheme();
        this.bindEvents();
        await this.loadData();
    }

    initTheme() {
        const saved = localStorage.getItem('hrevu-theme') || 'dark';
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

        // Global comment
        document.getElementById('add-global-comment-btn').addEventListener('click', () => {
            this.openCommentModal(null, null);
        });

        // Comments sidebar
        document.getElementById('comments-close').addEventListener('click', () => {
            document.getElementById('comments-sidebar').classList.remove('active');
        });

        // Close modal on backdrop click
        document.getElementById('comment-modal').addEventListener('click', (e) => {
            if (e.target.id === 'comment-modal') {
                this.closeModal();
            }
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
                this.editComment(e.target.dataset.id);
            } else if (e.target.matches('.btn-delete')) {
                this.deleteComment(e.target.dataset.id);
            }
        });

        // Event delegation for edit/delete buttons in comments sidebar
        document.getElementById('comments-list').addEventListener('click', (e) => {
            if (e.target.matches('.btn-edit')) {
                this.editComment(e.target.dataset.id);
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
                html += '<div class="inline-comments">';
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
            lineEl.addEventListener('click', () => {
                const file = lineEl.dataset.file;
                const lineNum = parseInt(lineEl.dataset.line);
                if (lineNum > 0) {
                    this.openCommentModal(file, lineNum);
                }
            });
        });
    }

    renderInlineComment(comment) {
        const time = new Date(comment.created_at).toLocaleTimeString();
        return `
            <div class="inline-comment" data-id="${comment.id}">
                <div class="inline-comment-header">
                    <span class="inline-comment-author">You</span>
                    <span class="inline-comment-time">${time}</span>
                </div>
                <div class="inline-comment-text">${this.escapeHtml(comment.text)}</div>
                <div class="inline-comment-actions">
                    <button class="btn-edit" data-id="${comment.id}">${t('edit')}</button>
                    <button class="btn-delete" data-id="${comment.id}">${t('delete')}</button>
                </div>
            </div>
        `;
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
                ? `${comment.file}${comment.line ? ':' + comment.line : ''}`
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

    openCommentModal(file, line) {
        this.pendingComment = { file, line };
        this.editingComment = null;

        const info = document.getElementById('comment-info');
        if (file && line) {
            info.textContent = `${file}:${line}`;
        } else if (file) {
            info.textContent = file;
        } else {
            info.textContent = t('globalCommentLabel');
        }

        document.getElementById('comment-text').value = '';
        document.getElementById('modal-submit').textContent = t('addComment');
        document.getElementById('comment-modal').classList.add('active');
        document.getElementById('comment-text').focus();
    }

    openEditModal(comment) {
        this.editingComment = comment;
        this.pendingComment = { file: comment.file, line: comment.line };

        const info = document.getElementById('comment-info');
        if (comment.file && comment.line) {
            info.textContent = `${comment.file}:${comment.line}`;
        } else if (comment.file) {
            info.textContent = comment.file;
        } else {
            info.textContent = t('globalCommentLabel');
        }

        document.getElementById('comment-text').value = comment.text;
        document.getElementById('modal-submit').textContent = t('updateComment');
        document.getElementById('comment-modal').classList.add('active');
        document.getElementById('comment-text').focus();
    }

    closeModal() {
        document.getElementById('comment-modal').classList.remove('active');
        this.pendingComment = null;
        this.editingComment = null;
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

    editComment(id) {
        const comment = this.comments.find(c => c.id === id);
        if (comment) {
            this.openEditModal(comment);
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
