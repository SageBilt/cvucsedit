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
const MirrorFileStore_1 = require("./MirrorFileStore");
const client_1 = require("./client/client");
const ucsmFoldingProvider_1 = require("./ucsmFoldingProvider");
const debugFolder_1 = require("./debugFolder");
/**
 * Whether this workspace has ever said yes to Cabinet Vision UCS.
 *
 * Until 2.1 there was no such question: the extension activated on `onStartupFinished` in every
 * window, connected to SQL, mirrored a `cvucs/` folder into whatever project happened to be open and
 * wrote a pointer block into that project's `AGENTS.md`. Opting in per workspace is what stops all
 * three from happening somewhere the user was not doing Cabinet Vision work.
 *
 * Three values, and the difference matters: `true` connect, `false` the user disconnected here and
 * meant it, `undefined` never asked - in which case `isEnabledWorkspace` looks for evidence that
 * this window *is* a UCS window before deciding.
 */
const ENABLED_KEY = 'cvucsedit.enabledInWorkspace';
/**
 * The language server child process, as `esbuild.js` bundles it - one file in `dist/`, not the
 * `out/server/server.js` tree `tsc` produces. `tsc` still writes `out/` for the type check and the
 * tests; nothing loads it at runtime.
 */
const SERVER_MODULE = path.join('dist', 'server.js');
/**
 * The settings `package.json` declares as `restrictedConfigurations`, minus the section prefix.
 *
 * VS Code ignores a workspace level value for each of these while the workspace is untrusted and
 * falls back to the user level one, so granting trust can change where we mirror or which database
 * we are pointed at, under a connection that has already resolved both. `onTrustGranted` uses the
 * list to tell the workspace where that can happen from the overwhelming majority where it cannot.
 */
const RESTRICTED_SETTINGS = ['Server', 'Database', 'MirrorPath', 'MirrorFolder', 'DebugFolderSuffix'];
let clients = [];
let provider;
let statusItem;
let running = false;
/** Session only: the trust notice is worth showing once per window, not once per connect. */
let warnedAboutTrust = false;
async function activate(context) {
    //initializeSystemJson();
    // Cheap: registers the tree views and the output channel, opens no connection and touches no
    // file. Everything with a side effect happens in `start`.
    provider = new SQLScriptProvider_1.SQLScriptProvider(context);
    statusItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    context.subscriptions.push(statusItem);
    context.subscriptions.push({ dispose: () => void stopClients() });
    registerCommands(context);
    context.subscriptions.push(vscode.languages.registerFoldingRangeProvider('ucsm', // Replace with your language ID
    new ucsmFoldingProvider_1.CustomLanguageFoldingProvider()));
    context.subscriptions.push(vscode.workspace.onDidGrantWorkspaceTrust(() => void onTrustGranted(context)));
    await setRunning(context, false);
    if (await shouldAutoStart(context)) {
        await start(context);
    }
    // Saving is not hooked here: MirrorFileStore's file watcher is the single write path to the
    // database, so an editor save and a write by an AI agent or external tool behave identically.
}
function registerCommands(context) {
    const register = (name, handler) => context.subscriptions.push(vscode.commands.registerCommand(name, handler));
    register('cvucsedit.start', () => start(context, true));
    register('cvucsedit.stop', () => stop(context));
    register('cvucsedit.openMirrorWorkspace', () => openMirrorWorkspace());
    register('cvucsedit.removeFromWorkspace', () => removeFromWorkspace(context));
    register('cvucsedit.forgetWorkspace', () => forgetWorkspace(context));
    // The list commands double as a way in: pressing refresh in a workspace that has not connected
    // yet plainly means "connect", and failing silently there would be baffling.
    register('cvucsedit.loadUCSLists', async () => {
        if (await ensureRunning(context)) {
            await provider.loadSideBarMenus();
        }
    });
    register('cvucsedit.refreshUCSList', async () => {
        if (await ensureRunning(context)) {
            await provider.loadUCSListSideBarMenu();
            await provider.writeProjectFiles();
        }
    });
    register('cvucsedit.refreshUCSLibList', async () => {
        if (await ensureRunning(context)) {
            await provider.loadUCSLibraryListSideBarMenu();
            await provider.writeProjectFiles();
        }
    });
    register('cvucsedit.onUCSItemClick', async (docURI) => provider.openUCS(docURI));
    register('cvucsedit.searchUCSList', async () => provider.filterUCSList(false));
    register('cvucsedit.clearSearchUCSList', async () => provider.clearFilterUCSList(false));
    register('cvucsedit.searchUCSLibList', async () => provider.filterUCSList(true));
    register('cvucsedit.clearSearchUCSLibList', async () => provider.clearFilterUCSList(true));
}
// ---------------------------------------------------------------------------- starting and stopping
/**
 * Auto start only where the extension has been made welcome. `AutoStart` is the second gate rather
 * than the only one: a global "start everywhere" default would put us straight back to connecting in
 * unrelated projects.
 */
async function shouldAutoStart(context) {
    if (!vscode.workspace.getConfiguration('cvucsedit').get('AutoStart', true)) {
        return false;
    }
    return isEnabledWorkspace(context);
}
async function isEnabledWorkspace(context) {
    const remembered = context.workspaceState.get(ENABLED_KEY);
    if (remembered !== undefined) {
        return remembered;
    }
    const folder = vscode.workspace.workspaceFolders?.[0]?.uri;
    if (!folder) {
        return false;
    }
    // The dedicated mirror folder, opened as its own window, is a UCS workspace by definition.
    if (contains(MirrorFileStore_1.MirrorFileStore.dedicatedBase(), folder)) {
        return true;
    }
    // So is the folder Cabinet Vision opens to debug a UCS. It launches that window itself, so
    // there is nobody to press connect, and the files in it are UCS:JS whether we start or not.
    if ((0, debugFolder_1.debugFolder)()) {
        return true;
    }
    // A mirror already sitting in this workspace means an earlier version was used here on purpose.
    // Those setups keep working untouched - the point of the change is the workspaces where the
    // extension was never wanted, not the one where it was.
    const config = vscode.workspace.getConfiguration('cvucsedit');
    const database = config.get('Database', 'CVData');
    const names = new Set([config.get('MirrorFolder', 'cvucs'), 'cvucs', '.cvucs']);
    for (const name of names) {
        try {
            await vscode.workspace.fs.stat(vscode.Uri.joinPath(folder, name, database));
            return true;
        }
        catch {
            // Keep looking.
        }
    }
    return false;
}
/** True when `inner` is `outer` or lies beneath it. Case insensitive, because Windows. */
function contains(outer, inner) {
    const normalise = (uri) => {
        const p = path.resolve(uri.fsPath);
        return process.platform === 'win32' ? p.toLowerCase() : p;
    };
    const a = normalise(outer);
    const b = normalise(inner);
    return b === a || b.startsWith(a + path.sep);
}
/** Connect and mirror. `userInitiated` also marks this workspace as one we may start in again. */
async function start(context, userInitiated = false) {
    if (running) {
        return true;
    }
    if (userInitiated) {
        await context.workspaceState.update(ENABLED_KEY, true);
    }
    try {
        await provider.loadSideBarMenus();
        const dynamicData = await provider.loadDBVariables();
        await provider.writeProjectFiles();
        const mirrorRoot = provider.mirror.globBase();
        const scoped = (extension) => mirrorRoot ? [`${mirrorRoot}/**/*${extension}`] : [`**/*${extension}`];
        const UCSMClient = new client_1.LanguageClientWrapper({
            languageId: 'ucsm',
            serverModulePath: SERVER_MODULE,
            patterns: scoped('.ucsm')
        }, context, dynamicData);
        clients.push(UCSMClient);
        await UCSMClient.start();
        // Registered against 'javascript' because mirrored UCS:JS files really are JavaScript. The
        // globs keep this server off every other JavaScript document in the window.
        const jsPatterns = scoped('.ucs.js');
        const debugRoot = (0, debugFolder_1.debugFolderGlobBase)();
        if (debugRoot) {
            // Cabinet Vision's debug copies are plain `.js`, so they are matched by location alone.
            // Flat rather than `**`: CV writes them directly in the folder, and a mirror left there
            // by an earlier version must not be picked up a second time through this pattern.
            jsPatterns.push(`${debugRoot}/*.js`);
        }
        const UCSJSClient = new client_1.LanguageClientWrapper({
            languageId: 'javascript',
            serverModulePath: SERVER_MODULE,
            patterns: jsPatterns
        }, context, dynamicData);
        clients.push(UCSJSClient);
        await UCSJSClient.start();
    }
    catch (error) {
        await stopClients();
        void vscode.window.showErrorMessage(`Cabinet Vision UCS could not start: ${error instanceof Error ? error.message : String(error)}`);
        return false;
    }
    await setRunning(context, true);
    void warnIfMirrorIsOutOfSight();
    void warnIfUntrusted();
    return true;
}
/**
 * The mirror only gets TypeScript IntelliSense when VS Code has a project over it, and it only has
 * one when the mirror is inside an open folder. In the dedicated location that means the UCS folder
 * has to actually be the window - opening a UCS from the tree still works, and so does UCS:M, but
 * UCS:JS completion and rename quietly will not.
 *
 * Not in Cabinet Vision's debug folder, though. That window is open on CV's own working copies and
 * the mirror is deliberately somewhere else, so the offer is beside the point - and accepting it
 * would replace the window CV just launched to debug in.
 */
async function warnIfMirrorIsOutOfSight() {
    if (provider.mirror.visibleToWorkspace || (0, debugFolder_1.debugFolder)()) {
        return;
    }
    const choice = await vscode.window.showInformationMessage('Cabinet Vision UCS files are mirrored outside this window, so UCS:JS completion, rename and ' +
        'find references are unavailable and AI agents will not see them. Open the UCS workspace to ' +
        'get them back.', 'Open UCS Workspace');
    if (choice) {
        await openMirrorWorkspace();
    }
}
// ---------------------------------------------------------------------------- workspace trust
/**
 * Until 2.3 the extension declared no `untrustedWorkspaces` capability, which VS Code reads as
 * `supported: false`: in a restricted workspace it was not activated at all and *every* contribution
 * went with it, the activity bar container included. The reported symptom was the sidebar icon simply
 * vanishing until the folder was trusted, with nothing on screen to say why.
 *
 * `package.json` now declares `limited`, so we load and connect untrusted, with the connection and
 * mirror location settings ignored when they come from the workspace (`RESTRICTED_SETTINGS`) - a
 * `.vscode/settings.json` in a folder someone was handed must not aim `cvucsedit.Server` at an SQL
 * instance of its choosing, since the Cabinet Vision credentials are hard coded and would go with it.
 *
 * One thing that declaration cannot buy back: VS Code's own TypeScript support is trust gated too, so
 * it runs syntax only until the folder is trusted and the whole UCS:JS semantic layer - completion off
 * `cv-api.d.ts`, hover, rename, find references - stays dark. That is the same loss
 * `warnIfMirrorIsOutOfSight` describes, reached by a different route, which is why this stays quiet
 * when the mirror is out of sight anyway: two notifications about one missing feature is noise, and
 * the offer that actually fixes it there is *Open UCS Workspace*.
 */
async function warnIfUntrusted() {
    if (vscode.workspace.isTrusted || warnedAboutTrust) {
        return;
    }
    if (!provider.mirror.visibleToWorkspace && !(0, debugFolder_1.debugFolder)()) {
        return;
    }
    warnedAboutTrust = true;
    const choice = await vscode.window.showWarningMessage('This folder is not trusted, so VS Code limits its TypeScript support and UCS:JS completion, ' +
        'hover, rename and find references are unavailable. The standards list, UCS:M and saving back ' +
        'to the database all work as usual. Trusting the folder restores the rest.', 'Manage Trust');
    if (choice) {
        await manageTrust();
    }
}
/**
 * There is no API to grant trust - `workspace.requestWorkspaceTrust` never left proposed - so the
 * furthest we can go is opening the editor that asks. The command id is VS Code's own and is not part
 * of the extension API, hence the fallback naming the palette entry rather than an error.
 */
async function manageTrust() {
    try {
        await vscode.commands.executeCommand('workbench.trust.manage');
    }
    catch {
        void vscode.window.showInformationMessage('Run "Workspaces: Manage Workspace Trust" from the command palette to trust this folder.');
    }
}
/**
 * Trust arriving mid session. If we never started, this may be the first moment we can - and if we
 * did, the settings VS Code was ignoring have just come into force, so anything resolved from one of
 * them is potentially stale.
 *
 * Only *potentially*: the restricted settings are nearly always user level, in which case trust
 * changes nothing we read and a reload prompt would be a pointless interruption. So the offer is made
 * only where a workspace level value actually exists to take over.
 */
async function onTrustGranted(context) {
    if (!running) {
        if (await shouldAutoStart(context)) {
            await start(context);
        }
        return;
    }
    // Drops the "limited" styling the status bar item is wearing.
    await setRunning(context, true);
    if (!workspaceOverridesRestrictedSettings()) {
        return;
    }
    const choice = await vscode.window.showInformationMessage('This workspace sets its own Cabinet Vision database or mirror location, which VS Code ignored ' +
        'while the folder was untrusted. Reload the window to connect with those settings.', 'Reload Window');
    if (choice) {
        await vscode.commands.executeCommand('workbench.action.reloadWindow');
    }
}
function workspaceOverridesRestrictedSettings() {
    const config = vscode.workspace.getConfiguration('cvucsedit');
    return RESTRICTED_SETTINGS.some(key => {
        const info = config.inspect(key);
        return info?.workspaceValue !== undefined || info?.workspaceFolderValue !== undefined;
    });
}
/** Connect on demand, for commands that only make sense once we are running. */
async function ensureRunning(context) {
    return running ? true : start(context, true);
}
async function stop(context) {
    await context.workspaceState.update(ENABLED_KEY, false);
    await disconnect(context);
}
/** Tear the connection down without recording anything about whether we may start here again. */
async function disconnect(context) {
    await stopClients();
    // The watcher is the write path to the database, so it has to go too: a disconnected window that
    // still pushed saves to production would be the worst of both.
    provider.mirror.shutdown();
    provider.clearLists();
    await setRunning(context, false);
}
/**
 * Put this workspace back to never having been asked.
 *
 * Every answer the extension remembers is `workspaceState`, and nothing in VS Code clears one short
 * of deleting the window's entire storage folder - which throws away every other extension's state
 * as well, and needs the window closed to do it. So the first run, the path that most wants testing,
 * was the one path that could not be tested twice.
 *
 * Deliberately not the same as disconnecting: `stop` records a decision - `false`, the user meant it
 * - while this erases the question, which is the difference between `false` and `undefined` that
 * `isEnabledWorkspace` turns on. Clearing before disconnecting rather than after so that the status
 * bar item `setRunning` puts back is the one a never-asked workspace would get.
 *
 * The reload offer is not a nicety. `shouldAutoStart` only runs in `activate`, so none of this is
 * visible until the window comes back.
 */
async function forgetWorkspace(context) {
    await context.workspaceState.update(ENABLED_KEY, undefined);
    await provider.forgetWorkspaceState();
    await disconnect(context);
    const choice = await vscode.window.showInformationMessage('Cabinet Vision UCS has forgotten this workspace: whether to connect here, where to mirror, ' +
        'and whether AGENTS.md may be written at the root. Reload the window to see what a first ' +
        'visit does.', 'Reload Window');
    if (choice) {
        await vscode.commands.executeCommand('workbench.action.reloadWindow');
    }
}
async function stopClients() {
    const stopping = clients.map(client => {
        try {
            return client.stop() ?? Promise.resolve();
        }
        catch {
            return Promise.resolve(); // never started
        }
    });
    clients = [];
    await Promise.all(stopping);
}
async function setRunning(context, value) {
    running = value;
    // Drives the welcome view in both tree views.
    await vscode.commands.executeCommand('setContext', 'cvucsedit.running', value);
    const config = vscode.workspace.getConfiguration('cvucsedit');
    statusItem.backgroundColor = undefined;
    if (value) {
        // Connected but untrusted is a real state now rather than an impossible one, and it is worth
        // showing after the notification has been dismissed: it is the only standing explanation for
        // why UCS:JS completion is missing in a window where everything else works.
        const limited = !vscode.workspace.isTrusted;
        statusItem.text = limited ? '$(shield) CV UCS' : '$(database) CV UCS';
        statusItem.tooltip = `Cabinet Vision UCS: connected to ${config.get('Database', 'CVData')} on ${config.get('Server', '')}. Click to disconnect.${limited
            ? '\n\nThis folder is not trusted, so UCS:JS completion, hover and rename are unavailable.'
            : ''}`;
        statusItem.backgroundColor = limited
            ? new vscode.ThemeColor('statusBarItem.warningBackground')
            : undefined;
        statusItem.command = 'cvucsedit.stop';
        statusItem.show();
    }
    else if (await isEnabledWorkspace(context)) {
        // Enabled here but not connected, i.e. AutoStart is off. Give it a one click way back.
        statusItem.text = '$(debug-disconnect) CV UCS';
        statusItem.tooltip = 'Cabinet Vision UCS: not connected. Click to connect.';
        statusItem.command = 'cvucsedit.start';
        statusItem.show();
    }
    else {
        statusItem.hide();
    }
}
// ---------------------------------------------------------------------------- workspace commands
/** Create the dedicated mirror folder if needed and open it as the window. */
async function openMirrorWorkspace() {
    const base = MirrorFileStore_1.MirrorFileStore.dedicatedBase();
    try {
        await vscode.workspace.fs.createDirectory(base);
    }
    catch (error) {
        void vscode.window.showErrorMessage(`Could not create the UCS workspace folder at ${base.fsPath}: ${error instanceof Error ? error.message : String(error)}`);
        return;
    }
    await vscode.commands.executeCommand('vscode.openFolder', base);
}
/**
 * Undo what an earlier version did to a project that was never meant to have it: take the pointer
 * block back out of `AGENTS.md` / `CLAUDE.md` and, on confirmation, delete the mirror folder.
 *
 * Deleting is asked for separately and modally. A mirror can hold an edit that was never pushed to
 * the database, and there is no other copy of it.
 */
async function removeFromWorkspace(context) {
    if (!vscode.workspace.workspaceFolders?.length) {
        void vscode.window.showInformationMessage('No folder is open, so there is nothing to remove.');
        return;
    }
    await stop(context);
    await provider.removeRootPointer();
    const choice = await vscode.window.showWarningMessage('Removed the Cabinet Vision UCS pointer block from AGENTS.md and CLAUDE.md. ' +
        'Also delete the mirrored UCS folder from this workspace?', { modal: true, detail: 'Any change made in the mirror but not yet saved to the database will be lost. The database itself is not touched.' }, 'Delete Mirror Folder');
    if (choice !== 'Delete Mirror Folder') {
        return;
    }
    const removed = await provider.removeMirrorFromWorkspace();
    void vscode.window.showInformationMessage(removed.length
        ? `Removed ${removed.join(', ')} from this workspace.`
        : 'No mirrored UCS folder was found in this workspace.');
}
function deactivate() {
    if (!clients.length) {
        return undefined;
    }
    // Stop all clients in parallel
    return stopClients();
}
//# sourceMappingURL=extension.js.map