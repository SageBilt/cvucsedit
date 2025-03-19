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
    constructor(config) {
        this.connection = (0, node_1.createConnection)(node_1.ProposedFeatures.all);
        this.documents = new node_1.TextDocuments(vscode_languageserver_textdocument_1.TextDocument);
        this.languageId = config.languageId;
        // Load language data from JSON
        const data = JSON.parse(fs.readFileSync(config.jsonPath, 'utf8'));
        this.keywords = data.keywords || [];
        this.variables = data.variables || [];
        this.methods = data.methods || [];
        // Set up event handlers
        this.initialize();
        this.setupCompletion();
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
            // Add keywords
            this.keywords.forEach(kw => {
                items.push({
                    label: kw,
                    kind: node_1.CompletionItemKind.Keyword,
                    detail: `${kw} (${this.languageId} keyword)`
                });
            });
            // Add variables
            this.variables.forEach(variable => {
                items.push({
                    label: variable,
                    kind: node_1.CompletionItemKind.Variable,
                    detail: `${variable} (System variable)`
                });
            });
            // Add methods
            this.methods.forEach(method => {
                items.push({
                    label: method,
                    kind: node_1.CompletionItemKind.Method,
                    detail: `${method} (System method)`
                });
            });
            return items;
        });
    }
}
// Example: Instantiate the server for CustomVB
const ucsmLangServer = new LanguageServer({
    languageId: 'ucsm',
    jsonPath: path.join(__dirname, '../../Languages/ucsm/data/system.json')
});
//# sourceMappingURL=server%20copy.js.map