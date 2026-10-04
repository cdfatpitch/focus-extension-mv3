const blockURL = vendor.runtime.getURL("/block.html");
const conn = new FocusConnection();
const latestURLs = new Map();

function processTab(tabId, url) {
    if (!Number.isInteger(tabId) || typeof url !== "string") return;
    latestURLs.set(tabId, url);
    if (!/^https?:\/\//i.test(url)) return;
    conn.check(tabId, url);
}

function processOpenTabs() {
    vendor.tabs.query({}, (tabs) => {
        if (vendor.runtime.lastError) return;
        for (const tab of tabs) processTab(tab.id, tab.pendingUrl || tab.url);
    });
}

function handleNavigation(details) {
    if (details.frameId === 0) processTab(details.tabId, details.url);
}

vendor.webNavigation.onBeforeNavigate.addListener(handleNavigation);
vendor.webNavigation.onCommitted.addListener(handleNavigation);
vendor.webNavigation.onHistoryStateUpdated.addListener(handleNavigation);
vendor.webNavigation.onReferenceFragmentUpdated.addListener(handleNavigation);
vendor.tabs.onUpdated.addListener((tabId, change) => {
    if (change.url) processTab(tabId, change.url);
});
vendor.tabs.onActivated.addListener(({ tabId }) => {
    vendor.tabs.get(tabId, (tab) => {
        if (!vendor.runtime.lastError && tab) processTab(tab.id, tab.pendingUrl || tab.url);
    });
});
vendor.tabs.onRemoved.addListener((tabId) => latestURLs.delete(tabId));

conn.block = (data) => {
    if (!Number.isInteger(data.tabId) || typeof data.url !== "string" || typeof data.redirectURL !== "string") return;
    if (latestURLs.get(data.tabId) !== data.url) return;
    let redirectURL;
    try {
        const source = new URL(data.redirectURL);
        const appBlockPage = source.protocol === "file:" && source.hostname === "" &&
            source.pathname === "/Applications/Focus.app/Contents/Resources/block.html";
        if (!appBlockPage && !config.block_urls.some((allowed) => {
            const candidate = new URL(allowed);
            return source.origin === candidate.origin && source.pathname === candidate.pathname;
        })) return;
        const target = new URL(blockURL);
        target.search = source.search;
        redirectURL = target.href;
    } catch (_) { return; }
    vendor.tabs.get(data.tabId, (tab) => {
        if (vendor.runtime.lastError || !tab || !conn.isFocusing) return;
        if (latestURLs.get(data.tabId) !== data.url || (tab.pendingUrl || tab.url) !== data.url) return;
        vendor.tabs.update(data.tabId, { url: redirectURL }, () => { void vendor.runtime.lastError; });
    });
};

conn.onfocus = processOpenTabs;
vendor.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === "focus-reconnect") conn.connect();
});
vendor.alarms.create("focus-reconnect", { periodInMinutes: 1 });
conn.connect();
