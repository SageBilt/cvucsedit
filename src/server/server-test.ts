import { createConnection, TextDocuments, Diagnostic, DiagnosticSeverity, ProposedFeatures, TextDocumentSyncKind } from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';

// Create a connection for the server
const connection = createConnection(ProposedFeatures.all);

// Create a document manager
const documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);

// Handle initialization
connection.onInitialize(() => {
    return {
        capabilities: {
            textDocumentSync: TextDocumentSyncKind.Incremental, // Incremental sync
        }
    };
});

// Validate documents
function validateTextDocument(document: TextDocument): void {
    const diagnostics: Diagnostic[] = [];
    const text = document.getText();
    const lines = text.split('\n');

    // Simple validation: flag any line starting with "error"
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line.startsWith('error')) {
            diagnostics.push({
                severity: DiagnosticSeverity.Error,
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