"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LanguageClientWrapper = void 0;
const vscode_1 = require("vscode");
const node_1 = require("vscode-languageclient/node");
class LanguageClientWrapper {
    client;
    languageId;
    constructor(config, context, dynamicData) {
        this.languageId = config.languageId;
        // Server module path
        const serverModule = context.asAbsolutePath(config.serverModulePath);
        // Server options
        const serverOptions = {
            run: { module: serverModule, transport: node_1.TransportKind.ipc, args: [this.languageId] },
            debug: { module: serverModule, transport: node_1.TransportKind.ipc, args: [this.languageId] },
        };
        // Scoped to the mirror. This matters most for UCS:JS: it registers against languageId
        // 'javascript', so without the path restriction this server would serve every JavaScript
        // document in the window.
        const pattern = config.mirrorRoot
            ? `${config.mirrorRoot}/**/*${config.fileExtension}`
            : `**/*${config.fileExtension}`;
        const clientOptions = {
            documentSelector: [{ scheme: 'file', language: this.languageId, pattern }],
            synchronize: {
                fileEvents: vscode_1.workspace.createFileSystemWatcher(pattern)
            },
            outputChannel: vscode_1.window.createOutputChannel(`${this.languageId} Language Server`),
            initializationOptions: dynamicData, // Pass dynamic data here
        };
        // Create and start the client
        this.client = new node_1.LanguageClient(`${this.languageId}LanguageServer`, `${this.languageId} Language Server`, serverOptions, clientOptions);
    }
    async start(context) {
        try {
            this.client.start().then(() => {
                console.log('Test Language Server started');
            });
            context.subscriptions.push(this.client);
        }
        catch (error) {
            console.error(`Failed to start ${this.languageId} client:`, error);
            throw error; // Let caller handle it
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