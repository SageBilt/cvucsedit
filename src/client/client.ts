import * as path from 'path';
import { workspace, ExtensionContext, window } from 'vscode';
import { LanguageClient, LanguageClientOptions, ServerOptions, TransportKind } from 'vscode-languageclient/node';

interface LanguageClientConfig {
  languageId: string;
  serverModulePath: string;
  fileExtension: string;
}

export class LanguageClientWrapper {
    public client: LanguageClient;
    private languageId: string;

    constructor(config: LanguageClientConfig,context: ExtensionContext) {
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
          outputChannel: window.createOutputChannel(`${this.languageId} Language Server`)
      };
  
      // Create and start the client
      this.client = new LanguageClient(
        `${this.languageId}LanguageServer`,
        `${this.languageId} Language Server`,
          serverOptions,
          clientOptions
      );      
  
    }

    public async start(context: ExtensionContext): Promise<void> {
      try {
        this.client.start().then(() => {
          console.log('Test Language Server started');
        });
    
        context.subscriptions.push(this.client);
  
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
}