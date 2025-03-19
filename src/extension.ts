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
import { initializeSystemJson } from './jsonDocCreator';


let clients: LanguageClientWrapper[] = [];

export async function activate(context: vscode.ExtensionContext) {

    //initializeSystemJson();


    const UCSMClient = new LanguageClientWrapper({
            languageId: 'ucsm',
            serverModulePath: path.join('out','server', 'server.js'),
            fileExtension: '.ucsm'
            },
            context
        );
    UCSMClient.start(context); 

    const UCSJSClient = new LanguageClientWrapper({
        languageId: 'javascript',
        serverModulePath: path.join('out','server', 'server.js'),
        fileExtension: '.js'
        },
        context
    );

    UCSJSClient.start(context);


    //UCS Text editors
    const SQLConn = new SQLConnection();
    const provider = new SQLScriptProvider(SQLConn,context);
    const textProvider = new DFSProvider.DatabaseFileSystemProvider();
    await provider.loadSideBarMenus();

    // const DocFilter: vscode.DocumentFilter;
    // DocFilter.scheme = 'cvucs';

    context.subscriptions.push(
        vscode.languages.registerCompletionItemProvider(
            'javascript',
          {
            provideCompletionItems(document: vscode.TextDocument, position: vscode.Position) {

            const item1 = new vscode.CompletionItem('cab', vscode.CompletionItemKind.Constant);
            item1.detail = 'Inserts a cabinet';
            item1.insertText = '_cab';

            // const item2 = new vscode.CompletionItem('myVar', vscode.CompletionItemKind.Method);
            // item2.insertText = 'myVar';

            // Return the list of suggestions
            return [item1];
            }
          },
          '.' // Trigger on dot
        )
    );


    context.subscriptions.push(
        vscode.languages.registerCompletionItemProvider(
            'javascript',
          {
            provideCompletionItems(document: vscode.TextDocument, position: vscode.Position) {
              const linePrefix = document.lineAt(position).text.substr(0, position.character);
              if (!linePrefix.endsWith('_cab.')) return undefined;
    
              const completion = new vscode.CompletionItem('SetParameter', vscode.CompletionItemKind.Method);
              completion.insertText = new vscode.SnippetString('SetParameter("${1:arg}",${2:arg});');
              completion.documentation = new vscode.MarkdownString('Set a parameter with a value');
              return [completion];
            }
          },
          '.' // Trigger on dot
        )
    );   
      //{ scheme: "file", language: "javascript" }

    //   context.subscriptions.push(
    //     vscode.languages.registerInlineCompletionItemProvider(
    //        'javascript' ,
    //       {
    //         provideInlineCompletionItems(document: vscode.TextDocument, position: vscode.Position, context: vscode.InlineCompletionContext, token: vscode.CancellationToken) {
    //             const linePrefix = document.lineAt(position).text.substr(0, position.character);
    //             if (!linePrefix.endsWith('cab')) return undefined;

    //             const suggestion = new vscode.InlineCompletionItem('_cab.');
    //             suggestion.insertText = '_cab.Method';
    //             return [suggestion];

    //         }
    //       }
    //     )
    //   );     



    vscode.workspace.registerFileSystemProvider('cvucs', textProvider, { isCaseSensitive: false });

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

                //await vscode.workspace.fs.writeFile(uri, Buffer.from(item.Code, 'utf8'));
                const document = await vscode.workspace.openTextDocument(uri);

                const LangId = ["UCSJS","UCSJS-Disabled"].includes(item.FileType.FileTypeName) ? 'javascript' : 'ucsm';
                await vscode.languages.setTextDocumentLanguage(document, LangId);
                console.log('Opened document URI:', document.uri.toString());
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
