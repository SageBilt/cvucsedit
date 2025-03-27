"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LanguageClientWrapper = void 0;
const vscode_1 = require("vscode");
const node_1 = require("vscode-languageclient/node");
class LanguageClientWrapper {
    ScriptProvider;
    client;
    languageId;
    constructor(config, context, ScriptProvider, dynamicData) {
        this.ScriptProvider = ScriptProvider;
        this.languageId = config.languageId;
        // Server module path
        const serverModule = context.asAbsolutePath(config.serverModulePath);
        // Server options
        const serverOptions = {
            run: { module: serverModule, transport: node_1.TransportKind.ipc, args: [this.languageId] },
            debug: { module: serverModule, transport: node_1.TransportKind.ipc, args: [this.languageId] },
        };
        // Client options
        const clientOptions = {
            documentSelector: [{ scheme: 'file', language: this.languageId },
                { scheme: 'cvucs', language: this.languageId }], //{ scheme: 'cvucs', language: 'ucsm' }
            synchronize: {
                fileEvents: vscode_1.workspace.createFileSystemWatcher(`**/*${config.fileExtension}`)
            },
            outputChannel: vscode_1.window.createOutputChannel(`${this.languageId} Language Server`),
            initializationOptions: dynamicData, // Pass dynamic data here
        };
        // Create and start the client
        this.client = new node_1.LanguageClient(`${this.languageId}LanguageServer`, `${this.languageId} Language Server`, serverOptions, clientOptions);
        context.subscriptions.push(vscode_1.workspace.onDidChangeTextDocument((event) => {
            if (this.isRelevantDocument(event.document)) {
                this.updateReferences(event.document);
            }
        }));
    }
    async start(context) {
        try {
            this.client.start().then(() => {
                console.log('Test Language Server started');
            });
            context.subscriptions.push(this.client);
            this.sendDynamicData();
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
    isRelevantDocument(document) {
        // Check if the changed document matches this language server's scope
        return document.languageId === 'javascript'; //&& document.uri.scheme === 'cvucs';
    }
    updateReferences(document) {
        this.ScriptProvider.updateClassRefsForDoc(document);
        this.sendDynamicData();
    }
    sendDynamicData() {
        const dynamicData = this.ScriptProvider.UCSJSLibRefParser.docReferences;
        // Send notification once the client is ready
        this.client.start().then(() => {
            this.client.sendNotification('updateJSLibraryReferences', dynamicData); //updateJSLibraryClassRef
            console.log(`updated JS Library References for ${this.languageId} on server`); //${JSON.stringify(dynamicData)
        }).catch((err) => {
            console.error(`Failed to send notification to ${this.languageId} server:`, err);
        });
    }
}
exports.LanguageClientWrapper = LanguageClientWrapper;
//# sourceMappingURL=client.js.map