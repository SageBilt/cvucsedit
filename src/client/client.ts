import { workspace, ExtensionContext, window, OutputChannel } from 'vscode';
import { LanguageClient, LanguageClientOptions, ServerOptions, TransportKind } from 'vscode-languageclient/node';
import { DynamicData } from '.././interfaces';

interface LanguageClientConfig {
  languageId: string;
  serverModulePath: string;
  /**
   * Absolute, forward slashed globs this server is scoped to. More than one because UCS:JS lives in
   * two places: the mirror, and Cabinet Vision's debug folder when a window is open on it.
   */
  patterns: string[];
}

export class LanguageClientWrapper {
    public client: LanguageClient;
    private languageId: string;
    /** Held so a disconnect/reconnect cycle does not leave a dead output channel behind each time. */
    private output: OutputChannel;
    private watchers: ReturnType<typeof workspace.createFileSystemWatcher>[];

    constructor(config: LanguageClientConfig,context: ExtensionContext,dynamicData:DynamicData) {
      this.languageId = config.languageId;
      // Server module path
      const serverModule = context.asAbsolutePath(config.serverModulePath);

      // Server options
      const serverOptions: ServerOptions = {
        run: { module: serverModule, transport: TransportKind.ipc, args: [this.languageId] },
        debug: { module: serverModule, transport: TransportKind.ipc, args: [this.languageId] },
      };

      // Scoped by path. This matters most for UCS:JS: it registers against languageId 'javascript',
      // so without the restriction this server would serve every JavaScript document in the window.
      this.output = window.createOutputChannel(`${this.languageId} Language Server`);
      this.watchers = config.patterns.map(pattern => workspace.createFileSystemWatcher(pattern));

      const clientOptions: LanguageClientOptions = {
          documentSelector: config.patterns.map(pattern =>
            ({ scheme: 'file', language: this.languageId, pattern })),
          synchronize: {
              fileEvents: this.watchers
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
      this.watchers.forEach(watcher => watcher.dispose());
      this.output.dispose();
      if (!this.client) {
        return undefined;
      }
      return this.client.stop();
    }

}
