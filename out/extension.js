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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
const vscode = __importStar(require("vscode"));
const mssql_1 = __importDefault(require("mssql"));
const DFSProvider = __importStar(require("./DatabaseFileSystemProvider"));
const CLT = __importStar(require("./CustomLookupTree"));
const SQLConnection_1 = require("./SQLConnection");
class SQLScriptProvider {
    SQLConn;
    context;
    UCS = new Map();
    lookupProvider;
    constructor(SQLConn, context) {
        this.SQLConn = SQLConn;
        this.context = context;
        this.lookupProvider = new CLT.LookupTreeDataProvider(this.context);
        vscode.window.registerTreeDataProvider('CVUCSList', this.lookupProvider);
    }
    // async loadScripts() {
    //     await sql.connect(config);
    //     const result = await sql.query('SELECT Name, Code, MacroType FROM UCS');
    //     result.recordset.forEach((ucsrecord: { Name: any; Code: string; MacroType: number; }) => {
    //         const FileExt = ucsrecord.MacroType == 1 ? 'js' : 'ucsm';
    //         const uri = vscode.Uri.parse(`cvucs:${ucsrecord.Name}.${FileExt}`);
    //         this.UCS.set(uri.toString(), ucsrecord.Code);
    //     });
    // }
    async loadSideBarMenu() {
        //await sql.connect(config);
        const result = await this.SQLConn.ExecuteStatment('SELECT ID,Name, Code, MacroType, UCSLibrary, UCSTypeID FROM UCS Order By Ordinal', []);
        if (result.recordset) {
            //const result = await sql.query('SELECT ID,Name, Code, MacroType, UCSLibrary, UCSTypeID FROM UCS Order By Ordinal'); 
            const List = result.recordset.map((ucsrecord) => new CLT.CustomTreeItem(ucsrecord.ID, ucsrecord.Name, CLT.GetFileType(ucsrecord.UCSTypeID, ucsrecord.MacroType), ucsrecord.Code, vscode.TreeItemCollapsibleState.Expanded, this.context));
            this.lookupProvider.updateResults(List);
        }
    }
    provideTextDocumentContent(uri) {
        return this.UCS.get(uri.toString()) || '-- Script not found';
    }
}
async function activate(context) {
    const SQLConn = new SQLConnection_1.SQLConnection();
    const provider = new SQLScriptProvider(SQLConn, context);
    const textProvider = new DFSProvider.DatabaseFileSystemProvider();
    //await provider.loadScripts();
    await provider.loadSideBarMenu();
    //vscode.workspace.registerTextDocumentContentProvider('cvucs', provider);
    vscode.workspace.registerFileSystemProvider('cvucs', textProvider, { isCaseSensitive: true });
    context.subscriptions.push(vscode.commands.registerCommand('cvucsedit.loaducs', async () => {
        const result = await mssql_1.default.query('SELECT Name, Code, MacroType FROM UCS');
        const scriptPick = await vscode.window.showQuickPick(result.recordset.map((ucsrecord) => ({ label: ucsrecord.Name.toString(), description: ucsrecord.Code.substring(0, 50), FileExt: ucsrecord.MacroType })));
        if (scriptPick) {
            const FileExt = scriptPick.FileExt == 1 ? 'js' : 'ucsm';
            const uri = vscode.Uri.parse(`cvucs:${scriptPick.label}.${FileExt}`);
            const document = await vscode.workspace.openTextDocument(uri);
            await vscode.window.showTextDocument(document);
        }
    }));
    context.subscriptions.push(vscode.commands.registerCommand('cvucsedit.showUCSList', provider.loadSideBarMenu));
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
            provider.lookupProvider.storeTreeItem(document.uri.toString(), item);
            //   editor.edit(editBuilder => {editBuilder.insert(new vscode.Position(0, 0),item.Code)});
        }
    }));
    vscode.workspace.onDidSaveTextDocument(async (document) => {
        if (document.uri.scheme === 'cvucs') {
            const key = `treeItem:${document.uri.toString()}`;
            //const treeItemData = context.workspaceState.get<{ID: number}>(key);
            const treeItem = provider.lookupProvider.getTreeItemByDocumentUri(document.uri.toString());
            if (treeItem) {
                //const scriptId = treeItemData?.ID;// document.uri.path.replace('.sql', '');
                const scriptId = treeItem.UCSID;
                const content = document.getText();
                SQLConn.ExecuteStatment(`Update UCS Set Code = @Code Where ID = @ID`, [{ "Name": "ID", "Value": scriptId }, { "Name": "Code", "Value": content }]);
                treeItem.Code = content;
                //await sql.connect(config);
                //await sql.query`UPDATE Scripts SET script_content = ${content} WHERE id = ${scriptId}`;
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
}
//# sourceMappingURL=extension.js.map