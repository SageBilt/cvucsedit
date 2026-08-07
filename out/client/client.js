"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LanguageClientWrapper = void 0;
const vscode_1 = require("vscode");
const node_1 = require("vscode-languageclient/node");
class LanguageClientWrapper {
    client;
    languageId;
    /** Held so a disconnect/reconnect cycle does not leave a dead output channel behind each time. */
    output;
    watchers;
    constructor(config, context, dynamicData) {
        this.languageId = config.languageId;
        // Server module path
        const serverModule = context.asAbsolutePath(config.serverModulePath);
        // Server options
        const serverOptions = {
            run: { module: serverModule, transport: node_1.TransportKind.ipc, args: [this.languageId] },
            debug: { module: serverModule, transport: node_1.TransportKind.ipc, args: [this.languageId] },
        };
        // Scoped by path. This matters most for UCS:JS: it registers against languageId 'javascript',
        // so without the restriction this server would serve every JavaScript document in the window.
        this.output = vscode_1.window.createOutputChannel(`${this.languageId} Language Server`);
        this.watchers = config.patterns.map(pattern => vscode_1.workspace.createFileSystemWatcher(pattern));
        const clientOptions = {
            documentSelector: config.patterns.map(pattern => ({ scheme: 'file', language: this.languageId, pattern })),
            synchronize: {
                fileEvents: this.watchers
            },
            outputChannel: this.output,
            initializationOptions: dynamicData, // Pass dynamic data here
        };
        // Create and start the client
        this.client = new node_1.LanguageClient(`${this.languageId}LanguageServer`, `${this.languageId} Language Server`, serverOptions, clientOptions);
    }
    /**
     * Not registered in `context.subscriptions`: the client is now started and stopped as the user
     * connects and disconnects, so its lifetime is shorter than the extension's and the caller owns
     * it. Disposing it on deactivation is handled there.
     */
    async start() {
        try {
            await this.client.start();
        }
        catch (error) {
            console.error(`Failed to start ${this.languageId} client:`, error);
            throw error; // Let caller handle it
        }
    }
    stop() {
        this.watchers.forEach(watcher => watcher.dispose());
        this.output.dispose();
        if (!this.client) {
            return undefined;
        }
        return this.client.stop();
    }
}
exports.LanguageClientWrapper = LanguageClientWrapper;
//# sourceMappingURL=client.js.map