// Run with node --test tests/markdown.test.cjs (no npm install or browser needed).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const context = vm.createContext({ navigator: { language: 'zh' }, window: {} });
vm.runInContext(fs.readFileSync('static/vendor/markdown-it.min.js', 'utf8'), context);
context.window.markdownit = context.markdownit;
vm.runInContext(fs.readFileSync('static/markdown.js', 'utf8'), context);
vm.runInContext(fs.readFileSync('static/app.js', 'utf8').replace('const app = new ReviewApp();', 'this.ReviewApp = ReviewApp;'), context);
const app = Object.create(context.ReviewApp.prototype);
const render = source => { context.source = source; return vm.runInContext('markdownParser.render(source)', context); };
const plain = value => JSON.parse(JSON.stringify(value));

test('Markdown renders tables, tasks, fenced code and Mermaid with source ranges', () => {
    const html = render('# 标题\n\n| A | B |\n|---|---|\n| one | two |\n\n- [x] Done\n\n```mermaid\ngraph LR\nA --> B\n```\n\n```js\nconst x = 1;\n```');
    assert.match(html, /<h1 data-source-start="1" data-source-end="1">标题/);
    assert.match(html, /<table data-source-start="3" data-source-end="5">/);
    assert.match(html, /type="checkbox" disabled checked/);
    assert.match(html, /class="markdown-mermaid" data-source-start="9" data-source-end="12"/);
    assert.match(html, /class="markdown-code-block" data-source-start="14" data-source-end="16"/);
});

test('reviewed HTML and dangerous links stay inert', () => {
    const html = render('<script>alert(1)</script>\n\n[x](javascript:alert(1))\n\n```mermaid\n<img onerror="alert(1)">\n```');
    assert.ok(!html.includes('<script>'));
    assert.ok(!html.includes('href="javascript:'));
    assert.ok(!html.includes('<img'));
});

test('source view includes context outside hunks and preserves both diff sides', () => {
    const file = {path:'plan.md', status:'modified', markdown:'# Plan\nnew\ncontext\nlast\n', original_markdown:'# Plan\nold\ncontext\nlast\n', lines:[
        {number:2, content:'old', type:'removed'}, {number:2, content:'new', type:'added'},
        {number:3, content:'context'},
    ]};
    assert.deepEqual(plain(app.sourceLines(file)), [
        {number:1,content:'# Plan'}, {number:2,content:'old',type:'removed'},
        {number:2,content:'new',type:'added'}, {number:3,content:'context'}, {number:4,content:'last'},
    ]);
    assert.equal(app.commentSide({side:'old'}, file), 'old');
    assert.equal(app.commentSide({}, file), 'new');
    assert.deepEqual(plain(app.sourceLines({...file, status:'deleted', markdown:null})), [
        {number:1,content:'# Plan',type:'removed'}, {number:2,content:'old',type:'removed'},
        {number:3,content:'context',type:'removed'}, {number:4,content:'last',type:'removed'},
    ]);
});

test('rendered points survive projection; source comments use the narrowest block', () => {
    const blocks = [
        {dataset:{sourceStart:'1',sourceEnd:'20'}},
        {dataset:{sourceStart:'5',sourceEnd:'8'}},
        {dataset:{sourceStart:'6',sourceEnd:'6'}},
    ];
    const body = {dataset:{lines:'20'},querySelectorAll:()=>blocks};
    const comment = {line:7, anchor:{start_line:5,end_line:8,x:0.87,y:1.1,quote:'table / whitespace'}};
    assert.equal(app.findMarkdownBlock(body, comment), blocks[1]);
    const point = app.renderedPoint(comment, body);
    assert.equal(point.x,0.87);
    assert.equal(point.y,1.1);
    assert.equal(app.findMarkdownBlock(body, {line:6}), blocks[2]);
    assert.equal(app.renderedPoint({line:6,column:12},body).y,0.5);
});

test('switching views retains an open draft and its canonical location', () => {
    const draft = {file:'plan.md',line:7,side:'new',anchor:{start_line:5,end_line:8,x:0.4,y:0.8}};
    const switcher = Object.assign(Object.create(context.ReviewApp.prototype), {
        viewMode:'rendered',currentFile:'plan.md',pendingComment:draft,
        renderDiff(){},findMarkdownBlock(){return null;},
    });
    context.document = {getElementById:()=>({querySelectorAll:()=>[], querySelector:()=>null})};
    switcher.setViewMode('source');
    assert.equal(switcher.pendingComment,draft);
    switcher.setViewMode('rendered');
    assert.equal(switcher.pendingComment,draft);
    assert.equal(draft.anchor.x,0.4);
});

test('nested blocks with equal ranges restore the exact same point reference', () => {
    const outer = {dataset:{sourceStart:'5',sourceEnd:'8'},getBoundingClientRect:()=>({left:0,right:400,top:20,bottom:180,height:160})};
    const inner = {dataset:{sourceStart:'5',sourceEnd:'8'},getBoundingClientRect:()=>({left:20,right:380,top:40,bottom:160,height:120})};
    const body = {dataset:{lines:'8'},querySelectorAll:()=>[outer,inner]};
    const block = app.blockAtPoint(body,200,80);
    const restored = app.findMarkdownBlock(body,{anchor:{start_line:5,end_line:8}});
    assert.equal(block,restored);
});

test('previous-version comments outside a removed hunk remain visible in source', () => {
    app.comments = [{file:'plan.md',line:1,side:'old'}];
    const lines = app.sourceLines({path:'plan.md',status:'modified',markdown:'same\nnew\n',original_markdown:'same\nold\n',lines:[
        {number:2,content:'old',type:'removed'},{number:2,content:'new',type:'added'},
    ]});
    assert.ok(lines.some(line=>line.number === 1 && line.side === 'old' && line.content === 'same'));
    app.comments = [];
});
