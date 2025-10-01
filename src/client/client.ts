import * as path from 'path';
import { workspace, ExtensionContext, window, TextDocumentChangeEvent, TextDocument, CancellationToken , Position, Definition, LocationLink, Location} from 'vscode';
import { LanguageClient, LanguageClientOptions, ServerOptions, TransportKind, ProvideDefinitionSignature, ProvideReferencesSignature } from 'vscode-languageclient/node';
import {TextDocument as LSPTextDocument} from 'vscode-languageserver-textdocument';
import { DynamicData, docClassRef, docReferences } from '.././interfaces';
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
          documentSelector: [{ scheme: 'file', language: this.languageId, pattern: `**/*${config.fileExtension}`}
                            ,{ scheme: 'cvucs', language: this.languageId }], //{ scheme: 'cvucs', language: 'ucsm' }
          synchronize: {
              fileEvents: workspace.createFileSystemWatcher(`**/*${config.fileExtension}`)
          },
          outputChannel: window.createOutputChannel(`${this.languageId} Language Server`),
          initializationOptions: dynamicData, // Pass dynamic data here
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

}