// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as path from 'path';
import * as vscode from 'vscode';
import sql from 'mssql';
import * as DFSProvider from './DatabaseFileSystemProvider';
import * as CLT from './CustomLookupTree';
import { SQLConnection } from './SQLConnection';
import { SQLScriptProvider } from './SQLScriptProvider';
import { LanguageClient, LanguageClientOptions, ServerOptions, TransportKind } from 'vscode-languageclient/node';
import { LanguageClientWrapper } from './client/client';

let clients: LanguageClientWrapper[] = [];

export async function activate(context: vscode.ExtensionContext) {
    // Instantiate a client for languages
    const UCSMClient = new LanguageClientWrapper(
        {
        languageId: 'ucsm',
        serverModulePath: path.join('out','server', 'server.js'),
        fileExtension: '.ucsm'
        },
        context
    );
    clients.push(UCSMClient);


    //UCS Text editors
    const SQLConn = new SQLConnection();
    const provider = new SQLScriptProvider(SQLConn,context);
    const textProvider = new DFSProvider.DatabaseFileSystemProvider();
    await provider.loadSideBarMenus();

    vscode.workspace.registerFileSystemProvider('cvucs', textProvider, { isCaseSensitive: true });

    context.subscriptions.push(
        vscode.commands.registerCommand('cvucsedit.showUCSList',provider.loadSideBarMenus.bind(provider))
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('cvucsedit.onUCSItemClick', async (item: CLT.CustomTreeItem) => {
          // Action when an item is clicked

          if (item.FileType.FileTypeName == "Divider") {
            vscode.window.showWarningMessage('This is a divider. There is no code associate with this!')
          } else {
          const uri = vscode.Uri.parse(`cvucs:/${item.label}.${item.FileType.Extension}`);
                textProvider.writeFile(uri, Buffer.from(item.Code, 'utf8'), { create: true, overwrite: true });

                const document = await vscode.workspace.openTextDocument(uri);
                const editor = await vscode.window.showTextDocument(document, {
                    preview: false // Ensures it stays open as a full editor
                  });
   
                // context.workspaceState.update(`treeItem:${document.uri.toString()}`,{
                //     ID: item.UCSID,
                //   }) ; 

                provider.UCSListlookupProvider.storeTreeItem(document.uri.toString(), item);  

                //   editor.edit(editBuilder => {editBuilder.insert(new vscode.Position(0, 0),item.Code)});
            }
        })
    ); 
    

    vscode.workspace.onDidSaveTextDocument(async (document) => {
        if (document.uri.scheme === 'cvucs') {
            const key = `treeItem:${document.uri.toString()}`;
            let treeItem = provider.UCSListlookupProvider.getTreeItemByDocumentUri(document.uri.toString());
            if (!treeItem)
                treeItem = provider.UCSLibListlookupProvider.getTreeItemByDocumentUri(document.uri.toString());

            if (treeItem) {
                const scriptId = treeItem.UCSID;
                const content = document.getText();

                SQLConn.ExecuteStatment(`Update UCS Set Code = @Code Where ID = @ID`,[{"Name":"ID","Value": scriptId},{"Name":"Code","Value": content}]);
                treeItem.Code = content;
                vscode.window.showInformationMessage(`Updated UCS ${treeItem.label} in Cabinet Vision SQL Server Database.`);
            }
        }
    });

    //Clean up document on close
    context.subscriptions.push(
        vscode.workspace.onDidCloseTextDocument((document) => {
          const key = `treeItem:${document.uri.toString()}`;
          context.workspaceState.update(key, undefined); // Clear the entry
        })
      );

}

export function deactivate() {
    if (!clients.length) {
        return undefined;
      }
      // Stop all clients in parallel
      return Promise.all(clients.map(client => client.stop())).then(() => undefined);
}
