import * as path from 'path';
import { workspace, ExtensionContext, window, TextDocumentChangeEvent, TextDocument, CancellationToken , Position, Definition, LocationLink, Location, Hover, CompletionList, ProviderResult, CompletionItem, CompletionContext} from 'vscode';
import { LanguageClient, LanguageClientOptions, ServerOptions, TransportKind, ProvideDefinitionSignature, ProvideReferencesSignature, ProvideCompletionItemsSignature, ProvideHoverSignature } from 'vscode-languageclient/node';
import {TextDocument as LSPTextDocument} from 'vscode-languageserver-textdocument';
import { DynamicData, docClassRef, docReferences } from '.././interfaces';
import { SQLScriptProvider } from '.././SQLScriptProvider';
import * as ts from 'typescript';
import { createTSLanguageServiceHost } from './typeScriptLanguageService';


interface LanguageClientConfig {
  languageId: string;
  serverModulePath: string;
  fileExtension: string;
}

export class LanguageClientWrapper {
    public client: LanguageClient;
    private languageId: string;

    private context : ExtensionContext;

    private tsLanguageService: ts.LanguageService | null = null;

    constructor(config: LanguageClientConfig,context: ExtensionContext,private ScriptProvider: SQLScriptProvider,dynamicData:DynamicData) {
      this.languageId = config.languageId;
      // Server module path
      this.context = context;
      const serverModule = context.asAbsolutePath(config.serverModulePath);

      // Server options
      const serverOptions: ServerOptions = {
        run: { module: serverModule, transport: TransportKind.ipc, args: [this.languageId] },
        debug: { module: serverModule, transport: TransportKind.ipc, args: [this.languageId] },
      };
  
      // Client options
      const clientOptions: LanguageClientOptions = {
          documentSelector: [{ scheme: 'file', language: this.languageId, pattern: `**/*${config.fileExtension}`}
                            ,{ scheme: 'cvucs', language: this.languageId }], //{ scheme: 'cvucs', language: 'ucsm' }
          synchronize: {
              fileEvents: workspace.createFileSystemWatcher(`**/*${config.fileExtension}`)
          },
          outputChannel: window.createOutputChannel(`${this.languageId} Language Server`),
          initializationOptions: dynamicData, // Pass dynamic data here
          middleware: {
              provideCompletionItem : this.handleCompletions.bind(this),
              provideHover: this.handleHover.bind(this)
          }
        //   middleware: {
        //     // Point to the external function
        //     provideDefinition: this.handleDefinition.bind(this)
        //     //provideReferences: this.handleReferences.bind(this)
        // }
      };
  
      // Create and start the client
      this.client = new LanguageClient(
        `${this.languageId}LanguageServer`,
        `${this.languageId} Language Server`,
          serverOptions,
          clientOptions
      );  

      if (this.languageId == 'javascript') {
        const definitionsPath = context.asAbsolutePath('Languages/ucsjs/uscjs_definitions.d.ts');
        this.tsLanguageService = ts.createLanguageService(createTSLanguageServiceHost(definitionsPath));

        context.subscriptions.push(
          workspace.onDidChangeTextDocument((event: TextDocumentChangeEvent) => {
            if (this.isRelevantDocument(event.document)) {
              this.updateReferences(event.document);
            }
          })
        );
      }
    }



    public async start(context: ExtensionContext): Promise<void> {
      try {
        this.client.start().then(() => {
          console.log('Test Language Server started');
        });
    
        context.subscriptions.push(this.client);
        
        if (this.languageId == 'javascript') 
            this.sendUpdatedReferences();
  
      } catch (error) {
        console.error(`Failed to start ${this.languageId} client:`, error);
        throw error; // Let caller handle it
      }
    }

    public stop(): Thenable<void> | undefined {
      if (!this.client) {
        return undefined;
      }
      return this.client.stop();
    }

    private isRelevantDocument(document: TextDocument): boolean {
      // Check if the changed document matches this language server's scope
      return document.languageId === 'javascript'; //&& document.uri.scheme === 'cvucs';
    }

    private updateReferences(document: TextDocument) {
      this.ScriptProvider.updateClassRefsForDoc(document);
      this.sendUpdatedReferences();
    }

    private sendUpdatedReferences(): void {

      const dynamicData: docReferences = {} as docReferences;
      
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


  private recreateTSLanguageService(documentUri: string, documentContent: string) {
      const definitionsPath = this.context.asAbsolutePath('Languages/ucsjs/uscjs_definitions.d.ts');
      this.tsLanguageService = ts.createLanguageService(
          createTSLanguageServiceHost(definitionsPath, documentUri, documentContent)
      );
  }


  private handleCompletions(
    document: TextDocument, 
    position: Position, 
    context: CompletionContext,
    token: CancellationToken, 
    next: (document: TextDocument, position: Position, context: CompletionContext, token: CancellationToken) => ProviderResult<CompletionItem[] | CompletionList<CompletionItem>>  // ← FLEXIBLE TYPE
  ): ProviderResult<CompletionList<CompletionItem>> {
    
    // 1. Get YOUR LSP's completions (flexible type)
    const lspResult = next(document, position, context, token);
    
    // 2. WRAP ARRAY IN CompletionList IF NEEDED (FIXES TYPE ERROR!)
    let lspCompletions: CompletionList<CompletionItem> | null = null;
    if (lspResult) {
        if (Array.isArray(lspResult)) {
            // Wrap array in CompletionList
            lspCompletions = { items: lspResult as CompletionItem[] };
        } else if ('items' in lspResult) {
            // Already CompletionList
            lspCompletions = lspResult as CompletionList<CompletionItem>;
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

        const tsCompletions = this.tsLanguageService.getCompletionsAtPosition(
            documentUri, 
            offset, 
            { includeExternalModuleExports: false }
        );

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
  private handleHover(
    document: TextDocument, 
    position: Position, 
    token: CancellationToken, 
      next: (document: TextDocument, position: Position, token: CancellationToken) => ProviderResult<Hover>): ProviderResult<Hover> {
      
      // 1. Get YOUR LSP's hover (CORRECT ARGS)
      const lspHover = next(document, position, token);
      
      // 2. Get TypeScript hover (NEW)  
      if (this.languageId === 'javascript' && this.tsLanguageService) {
          const offset = document.offsetAt(position);
          const documentUri = document.uri.toString();
          const documentContent = document.getText();
          this.recreateTSLanguageService(documentUri, documentContent);


          const tsHover = this.tsLanguageService.getQuickInfoAtPosition(
              documentUri, 
              offset
          );

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