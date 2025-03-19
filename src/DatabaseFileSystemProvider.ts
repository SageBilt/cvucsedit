import * as vscode from 'vscode';

export class DatabaseFileSystemProvider implements vscode.FileSystemProvider {
    private files = new Map<string, Uint8Array>();

    private _onDidChangeFile = new vscode.EventEmitter<vscode.FileChangeEvent[]>();
    readonly onDidChangeFile: vscode.Event<vscode.FileChangeEvent[]> = this._onDidChangeFile.event;

    stat(uri: vscode.Uri): vscode.FileStat {
        const content = this.files.get(uri.toString());
        if (!content) {
            throw vscode.FileSystemError.FileNotFound();
        }
        return {
            type: vscode.FileType.File,
            ctime: 0,
            mtime: Date.now(),
            size: content.length,
        };
    }

    readFile(uri: vscode.Uri): Uint8Array {
        return this.files.get(uri.toString()) || new Uint8Array();
    }

    writeFile(uri: vscode.Uri, content: Uint8Array, options: { create: boolean; overwrite: boolean }): void {
        console.log('Writing to URI:', uri.toString());
        this.files.set(uri.toString(), content);
        this._onDidChangeFile.fire([{ type: vscode.FileChangeType.Changed, uri }]);
    }

    watch(uri: vscode.Uri): vscode.Disposable { return new vscode.Disposable(() => {}); }
    readDirectory(uri: vscode.Uri): [string, vscode.FileType][] { return []; }
    createDirectory(uri: vscode.Uri): void {}
    delete(uri: vscode.Uri): void { this.files.delete(uri.toString()); }
    rename(oldUri: vscode.Uri, newUri: vscode.Uri, options: { overwrite: boolean }): void {
        this.files.set(newUri.toString(), this.readFile(oldUri));
        this.files.delete(oldUri.toString());
    }
}
