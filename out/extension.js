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
const clients = [];
async function activate(context) {
    //initializeSystemJson();
    //UCS Text editors
    //const SQLConn = new SQLConnection();
    const SQLProvider = new SQLScriptProvider_1.SQLScriptProvider(context);
    await SQLProvider.loadSideBarMenus();
    const dynamicData = await SQLProvider.loadDBVariables();
    await SQLProvider.writeProjectFiles();
    const mirrorRoot = SQLProvider.mirror.globBase();
    const UCSMClient = new client_1.LanguageClientWrapper({
        languageId: 'ucsm',
        serverModulePath: path.join('out', 'server', 'server.js'),
        fileExtension: '.ucsm',
        mirrorRoot
    }, context, dynamicData);
    clients.push(UCSMClient);
    UCSMClient.start(context);
    // Registered against 'javascript' because mirrored UCS:JS files really are JavaScript. The glob
    // keeps this server off every other JavaScript document in the window.
    const UCSJSClient = new client_1.LanguageClientWrapper({
        languageId: 'javascript',
        serverModulePath: path.join('out', 'server', 'server.js'),
        fileExtension: '.ucs.js',
        mirrorRoot
    }, context, dynamicData);
    clients.push(UCSJSClient);
    UCSJSClient.start(context);
    context.subscriptions.push(vscode.languages.registerFoldingRangeProvider('ucsm', // Replace with your language ID
    new ucsmFoldingProvider_1.CustomLanguageFoldingProvider()));
    context.subscriptions.push(vscode.commands.registerCommand('cvucsedit.loadUCSLists', async () => SQLProvider.loadSideBarMenus()));
    context.subscriptions.push(vscode.commands.registerCommand('cvucsedit.refreshUCSList', async () => {
        await SQLProvider.loadUCSListSideBarMenu();
        await SQLProvider.writeProjectFiles();
    }));
    context.subscriptions.push(vscode.commands.registerCommand('cvucsedit.refreshUCSLibList', async () => {
        await SQLProvider.loadUCSLibraryListSideBarMenu();
        await SQLProvider.writeProjectFiles();
    }));
    context.subscriptions.push(vscode.commands.registerCommand('cvucsedit.onUCSItemClick', async (docURI) => SQLProvider.openUCS(docURI)));
    context.subscriptions.push(vscode.commands.registerCommand('cvucsedit.searchUCSList', async () => SQLProvider.filterUCSList(false)));
    context.subscriptions.push(vscode.commands.registerCommand('cvucsedit.clearSearchUCSList', async () => SQLProvider.clearFilterUCSList(false)));
    context.subscriptions.push(vscode.commands.registerCommand('cvucsedit.searchUCSLibList', async () => SQLProvider.filterUCSList(true)));
    context.subscriptions.push(vscode.commands.registerCommand('cvucsedit.clearSearchUCSLibList', async () => SQLProvider.clearFilterUCSList(true)));
    // Saving is not hooked here: MirrorFileStore's file watcher is the single write path to the
    // database, so an editor save and a write by an AI agent or external tool behave identically.
}
function deactivate() {
    if (!clients.length) {
        return undefined;
    }
    // Stop all clients in parallel
    return Promise.all(clients.map(client => client.stop())).then(() => undefined);
}
//# sourceMappingURL=extension.js.map