// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as path from 'path';
import * as vscode from 'vscode';
import * as CLT from './CustomLookupTree';
import { SQLScriptProvider } from './SQLScriptProvider';
import { LanguageClientWrapper } from './client/client';
import { CustomLanguageFoldingProvider } from './ucsmFoldingProvider';


let clients: LanguageClientWrapper[] = [];

export async function activate(context: vscode.ExtensionContext) {

    //initializeSystemJson();

        //UCS Text editors
    //const SQLConn = new SQLConnection();
    const SQLProvider = new SQLScriptProvider(context);
    await SQLProvider.loadSideBarMenus();
    const dynamicData = await SQLProvider.loadDBVariables();

    const UCSMClient = new LanguageClientWrapper({
            languageId: 'ucsm',
            serverModulePath: path.join('out','server', 'server.js'),
            fileExtension: '.ucsm'
            },
            context,
            SQLProvider,
            dynamicData
        );
    UCSMClient.start(context); 

    const UCSJSClient = new LanguageClientWrapper({
        languageId: 'javascript',
        serverModulePath: path.join('out','server', 'server.js'),
        fileExtension: '.js'
        },
        context,
        SQLProvider,
        dynamicData
    );

    UCSJSClient.start(context);


    context.subscriptions.push(
        vscode.languages.registerFoldingRangeProvider(
            'ucsm', // Replace with your language ID
            new CustomLanguageFoldingProvider()
        )
    );


    context.subscriptions.push(
        vscode.commands.registerCommand('cvucsedit.loadUCSLists',async () => SQLProvider.loadSideBarMenus())
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('cvucsedit.refreshUCSList',async () => SQLProvider.loadUCSListSideBarMenu())
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('cvucsedit.refreshUCSLibList',async () => SQLProvider.loadUCSLibraryListSideBarMenu())
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('cvucsedit.onUCSItemClick', async (item: CLT.CustomTreeItem) => SQLProvider.openUCS(item))

    );

    context.subscriptions.push(
        vscode.commands.registerCommand('cvucsedit.searchUCSList', async () => SQLProvider.filterUCSList(false))
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('cvucsedit.clearSearchUCSList', async () => SQLProvider.clearFilterUCSList(false))
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('cvucsedit.searchUCSLibList', async () => SQLProvider.filterUCSList(true))
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('cvucsedit.clearSearchUCSLibList', async () => SQLProvider.clearFilterUCSList(true))
    );

    vscode.workspace.onDidSaveTextDocument( async (document) => SQLProvider.saveUCS(document));

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
