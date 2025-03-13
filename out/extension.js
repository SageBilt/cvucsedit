"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
const path = __importStar(require("path"));
const vscode = __importStar(require("vscode"));
const DFSProvider = __importStar(require("./DatabaseFileSystemProvider"));
const SQLConnection_1 = require("./SQLConnection");
const SQLScriptProvider_1 = require("./SQLScriptProvider");
const client_1 = require("./client/client");
let clients = [];
async function activate(context) {
    // Instantiate a client for languages
    const UCSMClient = new client_1.LanguageClientWrapper({
        languageId: 'ucsm',
        serverModulePath: path.join('out', 'server', 'server.js'),
        fileExtension: '.ucsm'
    }, context);
    clients.push(UCSMClient);
    //UCS Text editors
    const SQLConn = new SQLConnection_1.SQLConnection();
    const provider = new SQLScriptProvider_1.SQLScriptProvider(SQLConn, context);
    const textProvider = new DFSProvider.DatabaseFileSystemProvider();
    await provider.loadSideBarMenus();
    vscode.workspace.registerFileSystemProvider('cvucs', textProvider, { isCaseSensitive: true });
    context.subscriptions.push(vscode.commands.registerCommand('cvucsedit.showUCSList', provider.loadSideBarMenus.bind(provider)));
    context.subscriptions.push(vscode.commands.registerCommand('cvucsedit.onUCSItemClick', async (item) => {
        // Action when an item is clicked
        if (item.FileType.FileTypeName == "Divider") {
            vscode.window.showWarningMessage('This is a divider. There is no code associate with this!');
        }
        else {
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
    }));
    vscode.workspace.onDidSaveTextDocument(async (document) => {
        if (document.uri.scheme === 'cvucs') {
            const key = `treeItem:${document.uri.toString()}`;
            let treeItem = provider.UCSListlookupProvider.getTreeItemByDocumentUri(document.uri.toString());
            if (!treeItem)
                treeItem = provider.UCSLibListlookupProvider.getTreeItemByDocumentUri(document.uri.toString());
            if (treeItem) {
                const scriptId = treeItem.UCSID;
                const content = document.getText();
                SQLConn.ExecuteStatment(`Update UCS Set Code = @Code Where ID = @ID`, [{ "Name": "ID", "Value": scriptId }, { "Name": "Code", "Value": content }]);
                treeItem.Code = content;
                vscode.window.showInformationMessage(`Updated UCS ${treeItem.label} in Cabinet Vision SQL Server Database.`);
            }
        }
    });
    //Clean up document on close
    context.subscriptions.push(vscode.workspace.onDidCloseTextDocument((document) => {
        const key = `treeItem:${document.uri.toString()}`;
        context.workspaceState.update(key, undefined); // Clear the entry
    }));
}
function deactivate() {
    if (!clients.length) {
        return undefined;
    }
    // Stop all clients in parallel
    return Promise.all(clients.map(client => client.stop())).then(() => undefined);
}
//# sourceMappingURL=extension.js.map