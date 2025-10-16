"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.LanguageClientWrapper = void 0;
const path = __importStar(require("path"));
const vscode_1 = require("vscode");
const node_1 = require("vscode-languageclient/node");
const ts = __importStar(require("typescript"));
const typeScriptLanguageService_1 = require("./typeScriptLanguageService");
class LanguageClientWrapper {
    ScriptProvider;
    client;
    languageId;
    context;
    tsLanguageService = null;
    constructor(config, context, ScriptProvider, dynamicData) {
        this.ScriptProvider = ScriptProvider;
        this.languageId = config.languageId;
        // Server module path
        this.context = context;
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
            middleware: {
                provideCompletionItem: this.handleCompletions.bind(this),
                provideHover: this.handleHover.bind(this)
            }
            //   middleware: {
            //     // Point to the external function
            //     provideDefinition: this.handleDefinition.bind(this)
            //     //provideReferences: this.handleReferences.bind(this)
            // }
        };
        // Create and start the client
        this.client = new node_1.LanguageClient(`${this.languageId}LanguageServer`, `${this.languageId} Language Server`, serverOptions, clientOptions);
        if (this.languageId == 'javascript') {
            const definitionsPath = context.asAbsolutePath('Languages/ucsjs/uscjs_definitions.d.ts');
            this.tsLanguageService = ts.createLanguageService((0, typeScriptLanguageService_1.createTSLanguageServiceHost)(definitionsPath));
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
        dynamicData.CVShapeManagedRefs = this.ScriptProvider.UCSJSLibRefParser.CVShapeManagedReferences;
        // Send notification once the client is ready
        this.client.start().then(() => {
            this.client.sendNotification('updateJSReferences', dynamicData); //updateJSLibraryClassRef
            //console.log(`updated JS Library References for ${this.languageId} on server`); //${JSON.stringify(dynamicData)
        }).catch((err) => {
            console.error(`Failed to send notification to ${this.languageId} server:`, err);
        });
    }
    recreateTSLanguageService(documentUri, documentContent) {
        const definitionsPath = this.context.asAbsolutePath('Languages/ucsjs/uscjs_definitions.d.ts');
        this.tsLanguageService = ts.createLanguageService((0, typeScriptLanguageService_1.createTSLanguageServiceHost)(definitionsPath, documentUri, documentContent));
    }
    handleCompletions(document, position, context, token, next // ← FLEXIBLE TYPE
    ) {
        // 1. Get YOUR LSP's completions (flexible type)
        const lspResult = next(document, position, context, token);
        // 2. WRAP ARRAY IN CompletionList IF NEEDED (FIXES TYPE ERROR!)
        let lspCompletions = null;
        if (lspResult) {
            if (Array.isArray(lspResult)) {
                // Wrap array in CompletionList
                lspCompletions = { items: lspResult };
            }
            else if ('items' in lspResult) {
                // Already CompletionList
                lspCompletions = lspResult;
            }
        }
        // 3. Get TypeScript completions (NEW)
        if (this.languageId === 'javascript' && this.tsLanguageService) {
            const offset = document.offsetAt(position);
            const documentUri = document.uri.toString();
            const documentContent = document.getText();
            const tempPath = path.join(process.cwd(), 'temp.ujs');
            //const tempFilePath = path.join(process.cwd(), 'temp.js').replace(/\\/g, '/');
            this.recreateTSLanguageService(tempPath, documentContent);
            const tsCompletions = this.tsLanguageService.getCompletionsAtPosition(documentUri, offset, { includeExternalModuleExports: false });
            console.log(`🔍 TS Found: ${tsCompletions?.entries.length || 0} completions`);
            // 4. Send to YOUR LSP server to combine
            this.client.sendNotification('typescriptCompletions', {
                uri: documentUri,
                completions: tsCompletions?.entries || [],
                position: position
            });
        }
        // 5. RETURN WRAPPED RESULT (ALWAYS CompletionList)
        return lspCompletions;
    }
    handleHover(document, position, token, next) {
        // 1. Get YOUR LSP's hover (CORRECT ARGS)
        const lspHover = next(document, position, token);
        // 2. Get TypeScript hover (NEW)  
        if (this.languageId === 'javascript' && this.tsLanguageService) {
            const offset = document.offsetAt(position);
            const documentUri = document.uri.toString();
            const documentContent = document.getText();
            this.recreateTSLanguageService(documentUri, documentContent);
            const tsHover = this.tsLanguageService.getQuickInfoAtPosition(documentUri, offset);
            //   const tsHover = this.tsLanguageService.getTypeDefinitionAtPosition(
            //     documentUri, 
            //     offset
            // );
            // 3. Send to YOUR LSP server to combine  
            this.client.sendNotification('typescriptHover', {
                uri: document.uri.toString(),
                hover: tsHover,
                position: position
            });
        }
        // FIXED: Return properly typed
        return lspHover;
    }
}
exports.LanguageClientWrapper = LanguageClientWrapper;
//# sourceMappingURL=client.js.map