const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');

function setup() {
    const event = () => ({ listeners: [], addListener(handler) { this.listeners.push(handler); }, emit(...args) { this.listeners.forEach(handler => handler(...args)); } });
    const sockets = [], timers = [], intervals = [], updates = [];
    const tabs = new Map([[0, { id: 0, url: 'https://example.com/', active: true }]]);
    class Socket {
        static OPEN = 1;
        static CONNECTING = 0;
        constructor(url) { this.url = url; this.readyState = 0; this.sent = []; sockets.push(this); }
        send(data) { this.sent.push(JSON.parse(data)); }
        open() { this.readyState = 1; this.onopen(); }
        close() { this.readyState = 3; this.onclose?.(); }
        message(data) { this.onmessage({ data: typeof data === 'string' ? data : JSON.stringify(data) }); }
    }
    const chrome = {
        runtime: { getManifest: () => JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'))), getURL: value => 'chrome-extension://test' + value },
        tabs: { query: (_, callback) => callback([...tabs.values()]), get: (id, callback) => callback(tabs.get(id)), update: (id, changes, callback) => { updates.push({ id, ...changes }); callback(); }, onUpdated: event(), onActivated: event(), onRemoved: event() },
        webNavigation: { onBeforeNavigate: event(), onCommitted: event(), onHistoryStateUpdated: event(), onReferenceFragmentUpdated: event() },
        alarms: { create: () => {}, onAlarm: event() }
    };
    const context = vm.createContext({ chrome, navigator: { userAgent: 'Chrome/130.0', platform: 'MacIntel' }, URL, console, WebSocket: Socket,
        setTimeout: (callback, delay) => { const timer = { callback, delay }; timers.push(timer); return timer; }, clearTimeout: timer => { if (timer) timer.canceled = true; },
        setInterval: (callback, delay) => { const timer = { callback, delay }; intervals.push(timer); return timer; }, clearInterval: timer => { if (timer) timer.canceled = true; }
    });
    context.importScripts = (...files) => files.forEach(file => vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context, { filename: file }));
    context.importScripts('worker.js');
    const socket = sockets[0];
    return { chrome, socket, sockets, tabs, updates, timers, intervals };
}

test('MV3 worker boots without window and retains Chrome localhost protocol', () => {
    const { socket, intervals } = setup();
    assert.equal(socket.url, 'ws://localhost:8918/Chrome');
    socket.open();
    assert.equal(socket.sent[0].msg, 'ping');
    assert.equal(intervals[0].delay, 20000);
    intervals[0].callback();
    assert.equal(socket.sent.length, 2);
});

test('focus checks existing tabs and valid blocks redirect even tab zero', () => {
    const { socket, updates } = setup();
    socket.open(); socket.message({ msg: 'focus' });
    assert.equal(socket.sent.at(-1).url, 'https://example.com/');
    socket.message({ msg: 'block', tabId: 0, url: 'https://example.com/', redirectURL: 'http://localhost:8919/block/?url=https%3A%2F%2Fexample.com%2F' });
    assert.equal(updates.length, 1);
    assert.match(updates[0].url, /^chrome-extension:\/\/test\/block.html\?/);
});

test('malformed messages, nonlocal redirects and inactive blocks are ignored', () => {
    const { socket, updates } = setup();
    socket.open(); socket.message('bad JSON'); socket.message('null'); socket.message({ msg: 'constructor' });
    socket.message({ msg: 'focus' });
    socket.message({ msg: 'block', tabId: 0, url: 'https://example.com/', redirectURL: 'https://evil.test/block/' });
    socket.message({ msg: 'unfocus' });
    socket.message({ msg: 'block', tabId: 0, url: 'https://example.com/', redirectURL: 'http://localhost:8919/block/' });
    assert.equal(updates.length, 0);
});

test('SPA navigation is checked and stale responses cannot replace newer navigation', () => {
    const { chrome, socket, tabs, updates } = setup();
    socket.open(); socket.message({ msg: 'focus' });
    tabs.get(0).url = 'https://example.com/new';
    chrome.webNavigation.onHistoryStateUpdated.emit({ tabId: 0, frameId: 0, url: tabs.get(0).url });
    assert.equal(socket.sent.at(-1).url, tabs.get(0).url);
    socket.message({ msg: 'block', tabId: 0, url: 'https://example.com/', redirectURL: 'http://localhost:8919/block/' });
    assert.equal(updates.length, 0);
    tabs.get(0).pendingUrl = 'https://other.test/';
    socket.message({ msg: 'block', tabId: 0, url: 'https://example.com/new', redirectURL: 'http://localhost:8919/block/' });
    assert.equal(updates.length, 0);
});

test('disconnect rotates ports and alarm reconnect does not duplicate sockets', () => {
    const { chrome, socket, sockets, timers, intervals } = setup();
    socket.open(); socket.close();
    assert.equal(intervals[0].canceled, true);
    timers.find(timer => timer.delay === 1000).callback();
    assert.equal(sockets[1].url, 'ws://localhost:8917/Chrome');
    chrome.alarms.onAlarm.emit({ name: 'focus-reconnect' });
    assert.equal(sockets.length, 2);
});

// Captured from the installed Focus app during a live one-minute session.
test('native Focus file block response redirects to the extension block page', () => {
    const { socket, tabs, updates } = setup();
    tabs.get(0).url = 'https://x.com/example/status/123';
    socket.open(); socket.message({ msg: 'focus' });
    socket.message({ msg: 'block', tabId: 0, url: tabs.get(0).url,
        redirectURL: 'file:///Applications/Focus.app/Contents/Resources/block.html?url=https%3A%2F%2Fx.com%2Fexample%2Fstatus%2F123&quote=Test&author=Author' });
    assert.equal(updates.length, 1);
    const result = new URL(updates[0].url);
    assert.equal(result.protocol, 'chrome-extension:');
    assert.equal(result.searchParams.get('url'), tabs.get(0).url);
    socket.message({ msg: 'block', tabId: 0, url: tabs.get(0).url,
        redirectURL: 'file:///tmp/other.html?url=test' });
    assert.equal(updates.length, 1);
});
