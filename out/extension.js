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
const SQLScriptProvider_1 = require("./SQLScriptProvider");
const client_1 = require("./client/client");
const ucsmFoldingProvider_1 = require("./ucsmFoldingProvider");
let clients = [];
async function activate(context) {
    //initializeSystemJson();
    //UCS Text editors
    //const SQLConn = new SQLConnection();
    const SQLProvider = new SQLScriptProvider_1.SQLScriptProvider(context);
    await SQLProvider.loadSideBarMenus();
    const dynamicData = await SQLProvider.loadDBVariables();
    const UCSMClient = new client_1.LanguageClientWrapper({
        languageId: 'ucsm',
        serverModulePath: path.join('out', 'server', 'server.js'),
        fileExtension: '.ucsm'
    }, context, SQLProvider, dynamicData);
    UCSMClient.start(context);
    const UCSJSClient = new client_1.LanguageClientWrapper({
        languageId: 'javascript',
        serverModulePath: path.join('out', 'server', 'server.js'),
        fileExtension: '.js'
    }, context, SQLProvider, dynamicData);
    UCSJSClient.start(context);
    context.subscriptions.push(vscode.languages.registerFoldingRangeProvider('ucsm', // Replace with your language ID
    new ucsmFoldingProvider_1.CustomLanguageFoldingProvider()));
    context.subscriptions.push(vscode.commands.registerCommand('cvucsedit.loadUCSLists', async () => SQLProvider.loadSideBarMenus()));
    context.subscriptions.push(vscode.commands.registerCommand('cvucsedit.refreshUCSList', async () => SQLProvider.loadUCSListSideBarMenu()));
    context.subscriptions.push(vscode.commands.registerCommand('cvucsedit.refreshUCSLibList', async () => SQLProvider.loadUCSLibraryListSideBarMenu()));
    context.subscriptions.push(vscode.commands.registerCommand('cvucsedit.onUCSItemClick', async (item) => SQLProvider.openUCS(item)));
    context.subscriptions.push(vscode.commands.registerCommand('cvucsedit.searchUCSList', async () => SQLProvider.filterUCSList(false)));
    context.subscriptions.push(vscode.commands.registerCommand('cvucsedit.clearSearchUCSList', async () => SQLProvider.clearFilterUCSList(false)));
    context.subscriptions.push(vscode.commands.registerCommand('cvucsedit.searchUCSLibList', async () => SQLProvider.filterUCSList(true)));
    context.subscriptions.push(vscode.commands.registerCommand('cvucsedit.clearSearchUCSLibList', async () => SQLProvider.clearFilterUCSList(true)));
    vscode.workspace.onDidSaveTextDocument(async (document) => SQLProvider.saveUCS(document));
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