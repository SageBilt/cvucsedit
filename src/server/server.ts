import { createConnection, TextDocuments, ProposedFeatures, InitializeParams, CompletionItem, CompletionItemKind, TextDocumentSyncKind, Connection } from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import * as fs from 'fs';
import * as path from 'path';

// Define an interface for the language configuration
interface LanguageConfig {
  languageId: string;
  jsonPath: string; // Path to the JSON file for this language
}

// Define the shape of the JSON data
interface LanguageData {
  keywords: string[];
  variables: string[];
  methods: string[];
}

class LanguageServer {
  private connection: Connection;
  private documents: TextDocuments<TextDocument>;
  private languageId: string;
  private keywords: string[];
  private variables: string[];
  private methods: string[];

  constructor(config: LanguageConfig) {
    this.connection = createConnection(ProposedFeatures.all);
    this.documents = new TextDocuments(TextDocument);
    this.languageId = config.languageId;

    // Load language data from JSON
    const data: LanguageData = JSON.parse(fs.readFileSync(config.jsonPath, 'utf8'));
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

  private initialize() {
    this.connection.onInitialize((params: InitializeParams) => {
      return {
        capabilities: {
          textDocumentSync: TextDocumentSyncKind.Incremental,
          completionProvider: {
            resolveProvider: true
          }
        }
      };
    });
  }

  private setupCompletion() {
    this.connection.onCompletion(() => {
      const items: CompletionItem[] = [];

      // Add keywords
      this.keywords.forEach(kw => {
        items.push({
          label: kw,
          kind: CompletionItemKind.Keyword,
          detail: `${kw} (${this.languageId} keyword)`
        });
      });

      // Add variables
      this.variables.forEach(variable => {
        items.push({
          label: variable,
          kind: CompletionItemKind.Variable,
          detail: `${variable} (System variable)`
        });
      });

      // Add methods
      this.methods.forEach(method => {
        items.push({
          label: method,
          kind: CompletionItemKind.Method,
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