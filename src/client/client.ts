import { workspace, ExtensionContext, window, OutputChannel } from 'vscode';
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
    /** Held so a disconnect/reconnect cycle does not leave a dead output channel behind each time. */
    private output: OutputChannel;
    private watcher: ReturnType<typeof workspace.createFileSystemWatcher>;

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

      this.output = window.createOutputChannel(`${this.languageId} Language Server`);
      this.watcher = workspace.createFileSystemWatcher(pattern);

      const clientOptions: LanguageClientOptions = {
          documentSelector: [{ scheme: 'file', language: this.languageId, pattern }],
          synchronize: {
              fileEvents: this.watcher
          },
          outputChannel: this.output,
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



    /**
     * Not registered in `context.subscriptions`: the client is now started and stopped as the user
     * connects and disconnects, so its lifetime is shorter than the extension's and the caller owns
     * it. Disposing it on deactivation is handled there.
     */
    public async start(): Promise<void> {
      try {
        await this.client.start();
      } catch (error) {
        console.error(`Failed to start ${this.languageId} client:`, error);
        throw error; // Let caller handle it
      }
    }

    public stop(): Thenable<void> | undefined {
      this.watcher.dispose();
      this.output.dispose();
      if (!this.client) {
        return undefined;
      }
      return this.client.stop();
    }

}
