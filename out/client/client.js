"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LanguageClientWrapper = void 0;
const vscode_1 = require("vscode");
const node_1 = require("vscode-languageclient/node");
class LanguageClientWrapper {
    client;
    languageId;
    constructor(config, context) {
        this.languageId = config.languageId;
        const serverModule = context.asAbsolutePath(config.serverModulePath);
        console.log(`Resolved server module path: ${serverModule}`);
        const serverOptions = {
            run: { module: serverModule, transport: node_1.TransportKind.ipc },
            debug: { module: serverModule, transport: node_1.TransportKind.ipc }
        };
        const clientOptions = {
            documentSelector: [{ scheme: 'file', language: this.languageId }],
            synchronize: {
                fileEvents: vscode_1.workspace.createFileSystemWatcher(`**/${config.fileExtension}`)
            }
        };
        this.client = new node_1.LanguageClient(`${this.languageId}LanguageServer`, `${this.languageId} Language Server`, serverOptions, clientOptions);
        this.startClient(context);
    }
    async startClient(context) {
        try {
            console.log(`Starting ${this.languageId} client...`);
            await this.client.start();
            console.log(`${this.languageId} client started successfully`);
            context.subscriptions.push(this.client);
        }
        catch (error) {
            console.error(`Failed to start ${this.languageId} client:`, error);
            throw error; // Re-throw for debugging
        }
    }
    stop() {
        if (!this.client) {
            return undefined;
        }
        return this.client.stop();
    }
}
exports.LanguageClientWrapper = LanguageClientWrapper;
//# sourceMappingURL=client.js.map