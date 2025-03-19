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
const node_1 = require("vscode-languageserver/node");
const vscode_languageserver_textdocument_1 = require("vscode-languageserver-textdocument");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
class LanguageServer {
    connection;
    documents;
    languageId;
    keywords;
    variables;
    methods;
    valueTypes;
    dimTypes;
    forEachTypes;
    constructor(config) {
        this.connection = (0, node_1.createConnection)(node_1.ProposedFeatures.all);
        this.connection.console.log("Starting language server...");
        this.documents = new node_1.TextDocuments(vscode_languageserver_textdocument_1.TextDocument);
        this.languageId = config.languageId;
        // Load system data from system.json
        const systemData = JSON.parse(fs.readFileSync(config.systemJsonPath, 'utf8'));
        this.keywords = systemData.keywords || [];
        this.variables = systemData.variables || [];
        this.methods = systemData.methods || [];
        // Load syntax data from ucsm_syntax.json
        const syntaxData = JSON.parse(fs.readFileSync(config.syntaxJsonPath, 'utf8'));
        this.valueTypes = syntaxData.valueTypes || [];
        this.dimTypes = syntaxData.dimTypes || [];
        this.forEachTypes = syntaxData.forEachTypes || [];
        // Set up event handlers
        this.initialize();
        this.setupCompletion();
        this.setupDocumentValidation();
        // Start listening
        this.documents.listen(this.connection);
        this.connection.listen();
    }
    initialize() {
        this.connection.onInitialize((params) => {
            return {
                capabilities: {
                    textDocumentSync: node_1.TextDocumentSyncKind.Incremental,
                    completionProvider: {
                        resolveProvider: true
                    }
                }
            };
        });
    }
    setupCompletion() {
        this.connection.onCompletion(() => {
            const items = [];
            this.keywords.forEach(kw => {
                items.push({
                    label: kw,
                    kind: node_1.CompletionItemKind.Keyword,
                    detail: `${kw} (${this.languageId} keyword)`
                });
            });
            this.variables.forEach(variable => {
                items.push({
                    label: variable,
                    kind: node_1.CompletionItemKind.Variable,
                    detail: `${variable} (System variable)`
                });
            });
            this.methods.forEach(method => {
                items.push({
                    label: method,
                    kind: node_1.CompletionItemKind.Method,
                    detail: `${method} (System method)`
                });
            });
            return items;
        });
        // Handle completion item resolve requests
        this.connection.onCompletionResolve((item) => {
            // Optionally add more details (documentation, additional info, etc.)
            if (item.kind === node_1.CompletionItemKind.Method) {
                item.documentation = `Method: ${item.label}. More details can be added here.`;
            }
            else if (item.kind === node_1.CompletionItemKind.Variable) {
                item.documentation = `Variable: ${item.label}. System variable details here.`;
            }
            else if (item.kind === node_1.CompletionItemKind.Keyword) {
                item.documentation = `Keyword: ${item.label}.`;
            }
            return item;
        });
    }
    setupDocumentValidation() {
        this.documents.onDidChangeContent((change) => {
            this.validateTextDocument(change.document);
            console.log("Opened document:", change.document.uri);
        });
        this.documents.onDidOpen((event) => {
            this.validateTextDocument(event.document);
        });
        this.connection.onDidOpenTextDocument((params) => {
            console.log("Opened document:", params.textDocument.uri);
        });
        this.connection.onDidChangeTextDocument((params) => {
            console.log("Changed document:", params.textDocument.uri);
        });
    }
    validateTextDocument(document) {
        this.connection.console.log("Validating URI: " + document.uri);
        const diagnostics = [];
        diagnostics.push({
            severity: node_1.DiagnosticSeverity.Error,
            range: { start: { line: 0, character: 0 }, end: { line: 0, character: 5 } },
            message: "Simple test error",
            source: "ucsm"
        });
        const targetUri = document.uri.startsWith('file://')
            ? `cvucs:/${path.basename(decodeURIComponent(document.uri.replace('file:///', '')))}`
            : document.uri;
        this.connection.console.log("Sending diagnostics for: " + targetUri);
        this.connection.sendDiagnostics({ uri: targetUri, diagnostics });
    }
}
// Instantiate the server for 'ucsm'
console.log("🌍 Language server is starting...");
const ucsmLangServer = new LanguageServer({
    languageId: 'ucsm',
    systemJsonPath: path.join(__dirname, '../../Languages/ucsm/data/system.json'),
    syntaxJsonPath: path.join(__dirname, '../../Languages/ucsm/data/ucsm_syntax.json')
});
//# sourceMappingURL=server-old.js.map