import { workspace, ExtensionContext, window } from 'vscode';
import { LanguageClient, LanguageClientOptions, ServerOptions, TransportKind } from 'vscode-languageclient/node';
import { DynamicData } from '.././interfaces';

interface LanguageClientConfig {
  languageId: string;
  serverModulePath: string;
  fileExtension: string;
  /** Absolute, forward slashed path of the mirror root, or undefined if it could not be resolved. */
  mirrorRoot: string | undefined;
}

export class LanguageClientWrapper {
    public client: LanguageClient;
    private languageId: string;

    constructor(config: LanguageClientConfig,context: ExtensionContext,dynamicData:DynamicData) {
      this.languageId = config.languageId;
      // Server module path
      const serverModule = context.asAbsolutePath(config.serverModulePath);

      // Server options
      const serverOptions: ServerOptions = {
        run: { module: serverModule, transport: TransportKind.ipc, args: [this.languageId] },
        debug: { module: serverModule, transport: TransportKind.ipc, args: [this.languageId] },
      };

      // Scoped to the mirror. This matters most for UCS:JS: it registers against languageId
      // 'javascript', so without the path restriction this server would serve every JavaScript
      // document in the window.
      const pattern = config.mirrorRoot
        ? `${config.mirrorRoot}/**/*${config.fileExtension}`
        : `**/*${config.fileExtension}`;

      const clientOptions: LanguageClientOptions = {
          documentSelector: [{ scheme: 'file', language: this.languageId, pattern }],
          synchronize: {
              fileEvents: workspace.createFileSystemWatcher(pattern)
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
