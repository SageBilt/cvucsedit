// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as path from 'path';
import * as vscode from 'vscode';
import { SQLScriptProvider } from './SQLScriptProvider';
import { MirrorFileStore } from './MirrorFileStore';
import { LanguageClientWrapper } from './client/client';
import { CustomLanguageFoldingProvider } from './ucsmFoldingProvider';
import { UCSOpenContex } from './interfaces';
import { debugFolder, debugFolderGlobBase } from './debugFolder';

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

let clients: LanguageClientWrapper[] = [];
let provider: SQLScriptProvider | undefined;
let statusItem: vscode.StatusBarItem;
let running = false;

export async function activate(context: vscode.ExtensionContext) {

    //initializeSystemJson();

    // Cheap: registers the tree views and the output channel, opens no connection and touches no
    // file. Everything with a side effect happens in `start`.
    provider = new SQLScriptProvider(context);

    statusItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    context.subscriptions.push(statusItem);
    context.subscriptions.push({ dispose: () => void stopClients() });

    registerCommands(context);

    context.subscriptions.push(
        vscode.languages.registerFoldingRangeProvider(
            'ucsm', // Replace with your language ID
            new CustomLanguageFoldingProvider()
        )
    );

    await setRunning(context, false);

    if (await shouldAutoStart(context)) {
        await start(context);
    }

    // Saving is not hooked here: MirrorFileStore's file watcher is the single write path to the
    // database, so an editor save and a write by an AI agent or external tool behave identically.
}

function registerCommands(context: vscode.ExtensionContext) {
    const register = (name: string, handler: (...args: any[]) => any) =>
        context.subscriptions.push(vscode.commands.registerCommand(name, handler));

    register('cvucsedit.start', () => start(context, true));
    register('cvucsedit.stop', () => stop(context));
    register('cvucsedit.openMirrorWorkspace', () => openMirrorWorkspace());
    register('cvucsedit.removeFromWorkspace', () => removeFromWorkspace(context));
    register('cvucsedit.forgetWorkspace', () => forgetWorkspace(context));

    // The list commands double as a way in: pressing refresh in a workspace that has not connected
    // yet plainly means "connect", and failing silently there would be baffling.
    register('cvucsedit.loadUCSLists', async () => {
        if (await ensureRunning(context)) {
            await provider!.loadSideBarMenus();
        }
    });

    register('cvucsedit.refreshUCSList', async () => {
        if (await ensureRunning(context)) {
            await provider!.loadUCSListSideBarMenu();
            await provider!.writeProjectFiles();
        }
    });

    register('cvucsedit.refreshUCSLibList', async () => {
        if (await ensureRunning(context)) {
            await provider!.loadUCSLibraryListSideBarMenu();
            await provider!.writeProjectFiles();
        }
    });

    register('cvucsedit.onUCSItemClick', async (docURI: UCSOpenContex) => provider!.openUCS(docURI));
    register('cvucsedit.searchUCSList', async () => provider!.filterUCSList(false));
    register('cvucsedit.clearSearchUCSList', async () => provider!.clearFilterUCSList(false));
    register('cvucsedit.searchUCSLibList', async () => provider!.filterUCSList(true));
    register('cvucsedit.clearSearchUCSLibList', async () => provider!.clearFilterUCSList(true));
}

// ---------------------------------------------------------------------------- starting and stopping

/**
 * Auto start only where the extension has been made welcome. `AutoStart` is the second gate rather
 * than the only one: a global "start everywhere" default would put us straight back to connecting in
 * unrelated projects.
 */
async function shouldAutoStart(context: vscode.ExtensionContext): Promise<boolean> {
    if (!vscode.workspace.getConfiguration('cvucsedit').get('AutoStart', true)) {
        return false;
    }
    return isEnabledWorkspace(context);
}

async function isEnabledWorkspace(context: vscode.ExtensionContext): Promise<boolean> {
    const remembered = context.workspaceState.get<boolean>(ENABLED_KEY);
    if (remembered !== undefined) {
        return remembered;
    }

    const folder = vscode.workspace.workspaceFolders?.[0]?.uri;
    if (!folder) {
        return false;
    }

    // The dedicated mirror folder, opened as its own window, is a UCS workspace by definition.
    if (contains(MirrorFileStore.dedicatedBase(), folder)) {
        return true;
    }

    // So is the folder Cabinet Vision opens to debug a UCS. It launches that window itself, so
    // there is nobody to press connect, and the files in it are UCS:JS whether we start or not.
    if (debugFolder()) {
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
        } catch {
            // Keep looking.
        }
    }

    return false;
}

/** True when `inner` is `outer` or lies beneath it. Case insensitive, because Windows. */
function contains(outer: vscode.Uri, inner: vscode.Uri): boolean {
    const normalise = (uri: vscode.Uri) => {
        const p = path.resolve(uri.fsPath);
        return process.platform === 'win32' ? p.toLowerCase() : p;
    };
    const a = normalise(outer);
    const b = normalise(inner);
    return b === a || b.startsWith(a + path.sep);
}

/** Connect and mirror. `userInitiated` also marks this workspace as one we may start in again. */
async function start(context: vscode.ExtensionContext, userInitiated = false): Promise<boolean> {
    if (running) {
        return true;
    }
    if (userInitiated) {
        await context.workspaceState.update(ENABLED_KEY, true);
    }

    try {
        await provider!.loadSideBarMenus();
        const dynamicData = await provider!.loadDBVariables();
        await provider!.writeProjectFiles();

        const mirrorRoot = provider!.mirror.globBase();
        const scoped = (extension: string) =>
            mirrorRoot ? [`${mirrorRoot}/**/*${extension}`] : [`**/*${extension}`];

        const UCSMClient = new LanguageClientWrapper({
                languageId: 'ucsm',
                serverModulePath: path.join('out','server', 'server.js'),
                patterns: scoped('.ucsm')
                },
                context,
                dynamicData
            );
        clients.push(UCSMClient);
        await UCSMClient.start();

        // Registered against 'javascript' because mirrored UCS:JS files really are JavaScript. The
        // globs keep this server off every other JavaScript document in the window.
        const jsPatterns = scoped('.ucs.js');
        const debugRoot = debugFolderGlobBase();
        if (debugRoot) {
            // Cabinet Vision's debug copies are plain `.js`, so they are matched by location alone.
            // Flat rather than `**`: CV writes them directly in the folder, and a mirror left there
            // by an earlier version must not be picked up a second time through this pattern.
            jsPatterns.push(`${debugRoot}/*.js`);
        }

        const UCSJSClient = new LanguageClientWrapper({
            languageId: 'javascript',
            serverModulePath: path.join('out','server', 'server.js'),
            patterns: jsPatterns
            },
            context,
            dynamicData
        );
        clients.push(UCSJSClient);
        await UCSJSClient.start();
    } catch (error) {
        await stopClients();
        void vscode.window.showErrorMessage(
            `Cabinet Vision UCS could not start: ${error instanceof Error ? error.message : String(error)}`
        );
        return false;
    }

    await setRunning(context, true);
    void warnIfMirrorIsOutOfSight();
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
    if (provider!.mirror.visibleToWorkspace || debugFolder()) {
        return;
    }
    const choice = await vscode.window.showInformationMessage(
        'Cabinet Vision UCS files are mirrored outside this window, so UCS:JS completion, rename and ' +
        'find references are unavailable and AI agents will not see them. Open the UCS workspace to ' +
        'get them back.',
        'Open UCS Workspace'
    );
    if (choice) {
        await openMirrorWorkspace();
    }
}

/** Connect on demand, for commands that only make sense once we are running. */
async function ensureRunning(context: vscode.ExtensionContext): Promise<boolean> {
    return running ? true : start(context, true);
}

async function stop(context: vscode.ExtensionContext) {
    await context.workspaceState.update(ENABLED_KEY, false);
    await disconnect(context);
}

/** Tear the connection down without recording anything about whether we may start here again. */
async function disconnect(context: vscode.ExtensionContext) {
    await stopClients();
    // The watcher is the write path to the database, so it has to go too: a disconnected window that
    // still pushed saves to production would be the worst of both.
    provider!.mirror.shutdown();
    provider!.clearLists();
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
async function forgetWorkspace(context: vscode.ExtensionContext) {
    await context.workspaceState.update(ENABLED_KEY, undefined);
    await provider!.forgetWorkspaceState();
    await disconnect(context);

    const choice = await vscode.window.showInformationMessage(
        'Cabinet Vision UCS has forgotten this workspace: whether to connect here, where to mirror, ' +
        'and whether AGENTS.md may be written at the root. Reload the window to see what a first ' +
        'visit does.',
        'Reload Window'
    );
    if (choice) {
        await vscode.commands.executeCommand('workbench.action.reloadWindow');
    }
}

async function stopClients() {
    const stopping = clients.map(client => {
        try {
            return client.stop() ?? Promise.resolve();
        } catch {
            return Promise.resolve(); // never started
        }
    });
    clients = [];
    await Promise.all(stopping);
}

async function setRunning(context: vscode.ExtensionContext, value: boolean) {
    running = value;
    // Drives the welcome view in both tree views.
    await vscode.commands.executeCommand('setContext', 'cvucsedit.running', value);

    const config = vscode.workspace.getConfiguration('cvucsedit');
    if (value) {
        statusItem.text = '$(database) CV UCS';
        statusItem.tooltip = `Cabinet Vision UCS: connected to ${
            config.get('Database', 'CVData')} on ${config.get('Server', '')}. Click to disconnect.`;
        statusItem.command = 'cvucsedit.stop';
        statusItem.show();
    } else if (await isEnabledWorkspace(context)) {
        // Enabled here but not connected, i.e. AutoStart is off. Give it a one click way back.
        statusItem.text = '$(debug-disconnect) CV UCS';
        statusItem.tooltip = 'Cabinet Vision UCS: not connected. Click to connect.';
        statusItem.command = 'cvucsedit.start';
        statusItem.show();
    } else {
        statusItem.hide();
    }
}

// ---------------------------------------------------------------------------- workspace commands

/** Create the dedicated mirror folder if needed and open it as the window. */
async function openMirrorWorkspace() {
    const base = MirrorFileStore.dedicatedBase();
    try {
        await vscode.workspace.fs.createDirectory(base);
    } catch (error) {
        void vscode.window.showErrorMessage(
            `Could not create the UCS workspace folder at ${base.fsPath}: ${
                error instanceof Error ? error.message : String(error)}`
        );
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
async function removeFromWorkspace(context: vscode.ExtensionContext) {
    if (!vscode.workspace.workspaceFolders?.length) {
        void vscode.window.showInformationMessage('No folder is open, so there is nothing to remove.');
        return;
    }

    await stop(context);
    await provider!.removeRootPointer();

    const choice = await vscode.window.showWarningMessage(
        'Removed the Cabinet Vision UCS pointer block from AGENTS.md and CLAUDE.md. ' +
        'Also delete the mirrored UCS folder from this workspace?',
        { modal: true, detail: 'Any change made in the mirror but not yet saved to the database will be lost. The database itself is not touched.' },
        'Delete Mirror Folder'
    );

    if (choice !== 'Delete Mirror Folder') {
        return;
    }

    const removed = await provider!.removeMirrorFromWorkspace();
    void vscode.window.showInformationMessage(
        removed.length
            ? `Removed ${removed.join(', ')} from this workspace.`
            : 'No mirrored UCS folder was found in this workspace.'
    );
}

export function deactivate() {
    if (!clients.length) {
        return undefined;
      }
      // Stop all clients in parallel
      return stopClients();
}
