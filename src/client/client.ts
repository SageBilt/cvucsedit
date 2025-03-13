import * as path from 'path';
import { workspace, ExtensionContext } from 'vscode';
import { LanguageClient, LanguageClientOptions, ServerOptions, TransportKind } from 'vscode-languageclient/node';

interface LanguageClientConfig {
  languageId: string;
  serverModulePath: string;
  fileExtension: string;
}

export class LanguageClientWrapper {
  private client: LanguageClient;
  private languageId: string;

  constructor(config: LanguageClientConfig, context: ExtensionContext) {
    this.languageId = config.languageId;
    const serverModule = context.asAbsolutePath(config.serverModulePath);
    console.log(`Resolved server module path: ${serverModule}`);
    const serverOptions: ServerOptions = {
      run: { module: serverModule, transport: TransportKind.ipc },
      debug: { module: serverModule, transport: TransportKind.ipc }
    };
    const clientOptions: LanguageClientOptions = {
      documentSelector: [{ scheme: 'file', language: this.languageId }],
      synchronize: {
        fileEvents: workspace.createFileSystemWatcher(`**/${config.fileExtension}`)
      }
    };
    this.client = new LanguageClient(
      `${this.languageId}LanguageServer`,
      `${this.languageId} Language Server`,
      serverOptions,
      clientOptions
    );
    this.startClient(context);
  }

  private async startClient(context: ExtensionContext) {
    try {
      console.log(`Starting ${this.languageId} client...`);
      await this.client.start();
      console.log(`${this.languageId} client started successfully`);
      context.subscriptions.push(this.client);
    } catch (error) {
      console.error(`Failed to start ${this.languageId} client:`, error);
      throw error; // Re-throw for debugging
    }
  }

  public stop(): Thenable<void> | undefined {
    if (!this.client) {
      return undefined;
    }
    return this.client.stop();
  }
}