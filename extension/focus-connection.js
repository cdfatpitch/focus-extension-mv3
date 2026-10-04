function FocusConnection() {
    this.isFocusing = false;
    this.version = config.version;
    this.platform = config.browser;
    let port = config.max_port;
    let socket;
    let retryTimer;
    let pingTimer;
    let connectTimer;

    const send = (message) => {
        if (!socket || socket.readyState !== WebSocket.OPEN) return false;
        try {
            socket.send(JSON.stringify(message));
            return true;
        } catch (_) {
            socket.close();
            return false;
        }
    };
    this.check = (tabId, url) => this.isFocusing && send({ msg: "check", tabId, url });
    const ping = () => send({ msg: "ping", platform: this.platform, version: this.version });

    this.connect = () => {
        if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) return;
        clearTimeout(retryTimer);
        const current = new WebSocket(`ws://${config.host_local}:${port}/${config.browser}`);
        socket = current;
        connectTimer = setTimeout(() => current.close(), 5000);
        current.onopen = () => {
            clearTimeout(connectTimer);
            ping();
            clearInterval(pingTimer);
            pingTimer = setInterval(ping, 20000);
        };
        current.onerror = () => current.close();
        current.onclose = () => {
            if (socket !== current) return;
            clearTimeout(connectTimer);
            clearInterval(pingTimer);
            socket = undefined;
            this.isFocusing = false;
            port = port > config.min_port ? port - 1 : config.max_port;
            retryTimer = setTimeout(this.connect, 1000);
        };
        current.onmessage = (event) => {
            let data;
            try { data = JSON.parse(event.data); } catch (_) { return; }
            if (!data || typeof data !== "object") return;
            if (data.msg === "focus") {
                this.isFocusing = true;
                this.onfocus?.();
            } else if (data.msg === "unfocus") {
                this.isFocusing = false;
            } else if (data.msg === "block" && this.isFocusing) {
                this.block?.(data);
            }
        };
    };
}
