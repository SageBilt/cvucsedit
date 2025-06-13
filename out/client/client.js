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
            documentSelector: [{ scheme: 'file', language: this.languageId, pattern: `**/*${config.fileExtension}` },
                { scheme: 'cvucs', language: this.languageId }], //{ scheme: 'cvucs', language: 'ucsm' }
            synchronize: {
                fileEvents: vscode_1.workspace.createFileSystemWatcher(`**/*${config.fileExtension}`)
            },
            outputChannel: vscode_1.window.createOutputChannel(`${this.languageId} Language Server`),
            initializationOptions: dynamicData, // Pass dynamic data here
            //   middleware: {
            //     // Point to the external function
            //     provideDefinition: this.handleDefinition.bind(this)
            //     //provideReferences: this.handleReferences.bind(this)
            // }
        };
        // Create and start the client
        this.client = new node_1.LanguageClient(`${this.languageId}LanguageServer`, `${this.languageId} Language Server`, serverOptions, clientOptions);
        if (this.languageId == 'javascript') {
            context.subscriptions.push(vscode_1.workspace.onDidChangeTextDocument((event) => {
                if (this.isRelevantDocument(event.document)) {
                    this.updateReferences(event.document);
                }
            }));
        }
    }
    async start(context) {
        try {
            this.client.start().then(() => {
                console.log('Test Language Server started');
            });
            context.subscriptions.push(this.client);
            if (this.languageId == 'javascript')
                this.sendUpdatedReferences();
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
    // private setupGetDefinitionNotification() {
    //   this.client.onNotification('textDocument/definition', (params: Location) => {
    //     console.log(`definition notification ${params.uri} server:`);
    //   })
    // }
    // private async handleReferences(document: TextDocument, position: Position, options: {
    //         includeDeclaration: boolean}, token: CancellationToken, next: ProvideReferencesSignature
    // ) : Promise<Location[] | null | undefined> {
    //   const result = await next(document, position, options, token);
    //   if (result) {
    //     if (this.languageId == 'ucsm')
    //       return result;
    //     else {
    //       return result;
    //       // result.forEach(ref => {
    //       //   console.log('Manually opened document:', ref.uri.toString());
    //       //   this.ScriptProvider.openUCSByURI(ref.uri.toString(),ref.range);
    //       // })
    //     }
    //   }
    //   return undefined;
    // }
    // private async handleDefinition(
    //    document: TextDocument, position: Position, token: CancellationToken, next: ProvideDefinitionSignature
    // ) : Promise<Definition | LocationLink[] | null | undefined> {
    //   const result = await next(document, position, token);
    //   if (this.languageId == 'ucsm')
    //     return result;
    //   else {
    //     if (result) {
    //       console.log('is array:', Array.isArray(result));
    //       if (Array.isArray(result) && result.length > 0 && 'targetUri' in result[0]) {
    //         const firstLink = result[0] as LocationLink;
    //         this.ScriptProvider.openUCSByURI(firstLink.targetUri.toString(),firstLink.targetRange);
    //         console.log('Manually opened document:', firstLink.targetUri.toString());
    //       } else if ('uri' in result) {
    //         const location = result as Location;
    //         this.ScriptProvider.openUCSByURI(location.uri.toString(),location.range);
    //         console.log('Manually opened document:', location.uri.toString());
    //       }
    //     }
    //     return undefined;
    //   }
    // }
    isRelevantDocument(document) {
        // Check if the changed document matches this language server's scope
        return document.languageId === 'javascript'; //&& document.uri.scheme === 'cvucs';
    }
    updateReferences(document) {
        this.ScriptProvider.updateClassRefsForDoc(document);
        this.sendUpdatedReferences();
    }
    sendUpdatedReferences() {
        const dynamicData = {};
        dynamicData.classRefs = this.ScriptProvider.UCSJSLibRefParser.classReferences;
        dynamicData.CVAsmManagedRefs = this.ScriptProvider.UCSJSLibRefParser.CVAsmManagedReferences;
        // Send notification once the client is ready
        this.client.start().then(() => {
            this.client.sendNotification('updateJSReferences', dynamicData); //updateJSLibraryClassRef
            //console.log(`updated JS Library References for ${this.languageId} on server`); //${JSON.stringify(dynamicData)
        }).catch((err) => {
            console.error(`Failed to send notification to ${this.languageId} server:`, err);
        });
    }
}
exports.LanguageClientWrapper = LanguageClientWrapper;
//# sourceMappingURL=client.js.map