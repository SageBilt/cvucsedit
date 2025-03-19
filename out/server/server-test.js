"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const node_1 = require("vscode-languageserver/node");
const vscode_languageserver_textdocument_1 = require("vscode-languageserver-textdocument");
// Create a connection for the server
const connection = (0, node_1.createConnection)(node_1.ProposedFeatures.all);
// Create a document manager
const documents = new node_1.TextDocuments(vscode_languageserver_textdocument_1.TextDocument);
// Handle initialization
connection.onInitialize(() => {
    return {
        capabilities: {
            textDocumentSync: node_1.TextDocumentSyncKind.Incremental, // Incremental sync
        }
    };
});
// Validate documents
function validateTextDocument(document) {
    const diagnostics = [];
    const text = document.getText();
    const lines = text.split('\n');
    // Simple validation: flag any line starting with "error"
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line.startsWith('error')) {
            diagnostics.push({
                severity: node_1.DiagnosticSeverity.Error,
                range: {
                    start: { line: i, character: 0 },
                    end: { line: i, character: line.length }
                },
                message: 'This line starts with "error" and is invalid!',
                source: 'ucsm'
            });
        }
    }
    // Send diagnostics
    connection.sendDiagnostics({ uri: document.uri, diagnostics });
}
// Listen for document changes and openings
documents.onDidChangeContent((change) => {
    validateTextDocument(change.document);
});
documents.onDidOpen((event) => {
    validateTextDocument(event.document);
});
// Start the server
documents.listen(connection);
connection.listen();
connection.console.log('Test Language Server running...');
//# sourceMappingURL=server-test.js.map