// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as path from 'path';
import * as vscode from 'vscode';
import { SQLScriptProvider } from './SQLScriptProvider';
import { LanguageClientWrapper } from './client/client';
import { CustomLanguageFoldingProvider } from './ucsmFoldingProvider';
import { UCSOpenContex } from './interfaces';

const clients: LanguageClientWrapper[] = [];

export async function activate(context: vscode.ExtensionContext) {

    //initializeSystemJson();

        //UCS Text editors
    //const SQLConn = new SQLConnection();
    const SQLProvider = new SQLScriptProvider(context);
    await SQLProvider.loadSideBarMenus();
    const dynamicData = await SQLProvider.loadDBVariables();
    await SQLProvider.writeProjectFiles();

    const mirrorRoot = SQLProvider.mirror.globBase();

    const UCSMClient = new LanguageClientWrapper({
            languageId: 'ucsm',
            serverModulePath: path.join('out','server', 'server.js'),
            fileExtension: '.ucsm',
            mirrorRoot
            },
            context,
            dynamicData
        );
    clients.push(UCSMClient);
    UCSMClient.start(context);

    // Registered against 'javascript' because mirrored UCS:JS files really are JavaScript. The glob
    // keeps this server off every other JavaScript document in the window.
    const UCSJSClient = new LanguageClientWrapper({
        languageId: 'javascript',
        serverModulePath: path.join('out','server', 'server.js'),
        fileExtension: '.ucs.js',
        mirrorRoot
        },
        context,
        dynamicData
    );
    clients.push(UCSJSClient);
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
        vscode.commands.registerCommand('cvucsedit.refreshUCSList',async () => {
            await SQLProvider.loadUCSListSideBarMenu();
            await SQLProvider.writeProjectFiles();
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('cvucsedit.refreshUCSLibList',async () => {
            await SQLProvider.loadUCSLibraryListSideBarMenu();
            await SQLProvider.writeProjectFiles();
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('cvucsedit.onUCSItemClick', async (docURI: UCSOpenContex) => SQLProvider.openUCS(docURI))

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

    // Saving is not hooked here: MirrorFileStore's file watcher is the single write path to the
    // database, so an editor save and a write by an AI agent or external tool behave identically.
}

export function deactivate() {
    if (!clients.length) {
        return undefined;
      }
      // Stop all clients in parallel
      return Promise.all(clients.map(client => client.stop())).then(() => undefined);
}
