import * as path from 'path';
import { workspace, ExtensionContext, window, TextDocumentChangeEvent, TextDocument } from 'vscode';
import { LanguageClient, LanguageClientOptions, ServerOptions, TransportKind } from 'vscode-languageclient/node';
import { DynamicData, docClassRef } from '.././interfaces';
import { SQLScriptProvider } from '.././SQLScriptProvider';

interface LanguageClientConfig {
  languageId: string;
  serverModulePath: string;
  fileExtension: string;
}

export class LanguageClientWrapper {
    public client: LanguageClient;
    private languageId: string;

    constructor(config: LanguageClientConfig,context: ExtensionContext,private ScriptProvider: SQLScriptProvider,dynamicData:DynamicData) {
      this.languageId = config.languageId;
      // Server module path
      const serverModule = context.asAbsolutePath(config.serverModulePath);

      // Server options
      const serverOptions: ServerOptions = {
        run: { module: serverModule, transport: TransportKind.ipc, args: [this.languageId] },
        debug: { module: serverModule, transport: TransportKind.ipc, args: [this.languageId] },
      };
  
      // Client options
      const clientOptions: LanguageClientOptions = {
          documentSelector: [{ scheme: 'file', language: this.languageId }
                            ,{ scheme: 'cvucs', language: this.languageId }], //{ scheme: 'cvucs', language: 'ucsm' }
          synchronize: {
              fileEvents: workspace.createFileSystemWatcher(`**/*${config.fileExtension}`)
          },
          outputChannel: window.createOutputChannel(`${this.languageId} Language Server`),
          initializationOptions: dynamicData, // Pass dynamic data here
      };
  
      // Create and start the client
      this.client = new LanguageClient(
        `${this.languageId}LanguageServer`,
        `${this.languageId} Language Server`,
          serverOptions,
          clientOptions
      );  

      if (this.languageId == 'javascript') {
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
            this.sendDynamicData();
  
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
      this.sendDynamicData();
    }

    private sendDynamicData(): void {
      const dynamicData: docClassRef[] = this.ScriptProvider.UCSJSLibRefParser.docReferences;
  
      // Send notification once the client is ready
      this.client.start().then(() => {
        this.client.sendNotification('updateJSLibraryReferences', dynamicData); //updateJSLibraryClassRef
        console.log(`updated JS Library References for ${this.languageId} on server`); //${JSON.stringify(dynamicData)
      }).catch((err) => {
        console.error(`Failed to send notification to ${this.languageId} server:`, err);
      });
    }

}