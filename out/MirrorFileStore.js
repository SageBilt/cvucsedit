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
exports.MirrorFileStore = exports.MODULE_MARKER = void 0;
exports.leadingSentinelLines = leadingSentinelLines;
exports.libraryClassName = libraryClassName;
exports.isValidIdentifier = isValidIdentifier;
exports.leadingSentinel = leadingSentinel;
exports.trailingSentinel = trailingSentinel;
exports.applySentinels = applySentinels;
exports.stripSentinels = stripSentinels;
const vscode = __importStar(require("vscode"));
const path = __importStar(require("path"));
const crypto = __importStar(require("crypto"));
exports.MODULE_MARKER = 'export {};';
/** Number of sentinel lines inserted *before* the code, i.e. the line offset for reveal/highlight. */
function leadingSentinelLines(kind) {
    return kind === 'jsLibrary' ? 1 : 0;
}
const MANIFEST_VERSION = 1;
const MANIFEST_NAME = 'manifest.json';
const WRITE_DEBOUNCE_MS = 300;
const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;
/** Canonical form used for every hash and comparison: sentinel free, LF line endings. */
function canonical(code) {
    return code.replace(/\r\n/g, '\n');
}
function hash(code) {
    return crypto.createHash('sha256').update(canonical(code), 'utf8').digest('hex');
}
/** Files are written with CRLF, matching what Cabinet Vision stores. */
function toCrlf(text) {
    return text.replace(/\r\n/g, '\n').replace(/\n/g, '\r\n');
}
/** Make a UCS name safe to use as a Windows filename. Collisions are resolved by the caller. */
function sanitiseFileName(name) {
    let safe = name.replace(/[\\/:*?"<>|\x00-\x1f]/g, '_').replace(/[. ]+$/, '').trim();
    if (WINDOWS_RESERVED.test(safe)) {
        safe = `${safe}_`;
    }
    return safe.length ? safe : 'ucs';
}
/** The identifier a library is bound to. This is the name UCS code calls it by. */
function libraryClassName(ucsName) {
    return `_${ucsName}`;
}
function isValidIdentifier(name) {
    return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name);
}
const IDENTIFIER = '[A-Za-z_$][A-Za-z0-9_$]*';
/** `const _Name = new class {`, or the earlier `class _Name {` still on disk from older mirrors. */
const LIBRARY_OPEN = new RegExp(`^[ \\t]*(?:const[ \\t]+${IDENTIFIER}[ \\t]*=[ \\t]*new[ \\t]+class(?:[ \\t]+${IDENTIFIER})?|class[ \\t]+${IDENTIFIER})[ \\t]*\\{[ \\t]*\\r?\\n?`);
/** The matching `}();`. The `()` is required, so a body whose last line is a brace is left alone. */
const LIBRARY_CLOSE = /(\r?\n)?[ \t]*\}[ \t]*\([ \t]*\)[ \t]*;?[ \t]*(\r?\n)*$/;
/** The legacy bare `}`. Only safe to strip when the leading sentinel was the legacy one too. */
const LIBRARY_CLOSE_LEGACY = /(\r?\n)?[ \t]*\}[ \t]*(\r?\n)*$/;
/**
 * The sentinel line written before the code, if any. Single source of truth for the editor guard.
 *
 * The class expression is named after the UCS wherever that is a legal identifier, purely so hovers
 * and errors read `const _MyLib: MyLib` rather than `(Anonymous class)`. The name is local to the
 * expression, so it adds no global of its own.
 */
function leadingSentinel(kind, ucsName) {
    if (kind !== 'jsLibrary') {
        return undefined;
    }
    const typeName = isValidIdentifier(ucsName) ? ` ${ucsName}` : '';
    return `const ${libraryClassName(ucsName)} = new class${typeName} {`;
}
/** The sentinel line written after the code, if any. */
function trailingSentinel(kind) {
    switch (kind) {
        case 'jsLibrary': return '}();';
        case 'js': return exports.MODULE_MARKER;
        default: return undefined;
    }
}
/** Add the sentinel lines that turn database code into the on disk form. */
function applySentinels(code, kind, ucsName) {
    const leading = leadingSentinel(kind, ucsName);
    const trailing = trailingSentinel(kind);
    return `${leading ? `${leading}\r\n` : ''}${code}${trailing ? `\r\n${trailing}` : ''}`;
}
/**
 * Remove the sentinel lines, recovering the form stored in the database.
 *
 * Deliberately tolerant: a sentinel edited or deleted by something that bypasses the editor guard
 * (an AI agent, an external tool) must not corrupt the round trip, and must not register as a
 * change. Anything that does not look like a sentinel is left alone.
 */
function stripSentinels(text, kind) {
    if (kind === 'ucsm') {
        return text;
    }
    if (kind === 'js') {
        return text.replace(/(\r?\n)?[ \t]*export[ \t]*\{[ \t]*\}[ \t]*;?[ \t]*(\r?\n)*$/, '');
    }
    // jsLibrary: drop the leading wrapper and its matching trailing line. Both the current
    // `const _Name = new class {` / `}();` pair and the earlier `class _Name {` / `}` pair are
    // accepted, so files already mirrored by a previous version round trip without pushing the old
    // wrapper into the database.
    const open = LIBRARY_OPEN.exec(text);
    if (!open) {
        return text; // no recognisable wrapper, leave untouched
    }
    // Only a legacy file may have its trailing brace stripped on sight. In the current form the
    // `()` disambiguates the wrapper from a body whose own last line closes a block.
    const legacy = /^[ \t]*class\b/.test(open[0]);
    return text.slice(open[0].length).replace(legacy ? LIBRARY_CLOSE_LEGACY : LIBRARY_CLOSE, '');
}
/**
 * Materialises UCS rows as real files inside the workspace and keeps them in two way sync with the
 * database. Replaces the former in memory `cvucs:` FileSystemProvider: real `file:` URIs are what
 * let AI agents and the built in TypeScript service see UCS code at all.
 */
class MirrorFileStore {
    SQLConn;
    root;
    manifest = { version: MANIFEST_VERSION, database: '', entries: {} };
    watcher;
    pending = new Map();
    disposables = [];
    output;
    initialised = false;
    warnedAboutStrayFile = false;
    /** Called after an external edit has been pushed to the database, so the tree stays current. */
    onCodePushed;
    constructor(SQLConn) {
        this.SQLConn = SQLConn;
        this.output = vscode.window.createOutputChannel('Cabinet Vision UCS Sync');
        this.disposables.push(this.output);
    }
    dispose() {
        this.pending.forEach(t => clearTimeout(t));
        this.pending.clear();
        this.disposables.forEach(d => d.dispose());
        this.disposables = [];
    }
    /** Resolve the mirror root, load the manifest and start watching. Idempotent. */
    async initialize() {
        if (this.initialised) {
            return;
        }
        const config = vscode.workspace.getConfiguration('cvucsedit');
        const folderName = config.get('MirrorFolder', '.cvucs');
        const database = config.get('Database', 'CVData');
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (workspaceFolder) {
            this.root = vscode.Uri.joinPath(workspaceFolder.uri, folderName, sanitiseFileName(database));
        }
        else {
            this.root = vscode.Uri.joinPath(this.fallbackRoot(), folderName, sanitiseFileName(database));
            vscode.window.showWarningMessage('No folder is open, so Cabinet Vision UCS files are being mirrored outside the workspace. ' +
                'Open a folder for AI agents and search to be able to reach them.');
        }
        await vscode.workspace.fs.createDirectory(this.root);
        await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(this.root, 'ucs'));
        await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(this.root, 'lib'));
        // Self ignoring, so the mirror never appears in the user's repository and we never have to
        // edit their .gitignore.
        await this.writeIfChanged(vscode.Uri.joinPath(this.root, '.gitignore'), '*\r\n');
        await this.loadManifest(database);
        this.startWatching();
        this.initialised = true;
    }
    /**
     * Write the generated TypeScript project files. These are what give mirrored UCS:JS full
     * IntelliSense, rename and find-references from VS Code's own JavaScript service.
     */
    async writeProjectFiles(dts, jsconfig) {
        if (!this.root) {
            return;
        }
        await this.writeIfChanged(vscode.Uri.joinPath(this.root, 'cv-api.d.ts'), dts);
        await this.writeIfChanged(vscode.Uri.joinPath(this.root, 'jsconfig.json'), jsconfig);
    }
    /** Mirror root as a forward slashed absolute path, for building documentSelector globs. */
    globBase() {
        return this.root ? this.root.fsPath.replace(/\\/g, '/') : undefined;
    }
    fallbackRoot() {
        // globalStorageUri is only reachable through the extension context; the caller sets it.
        return this.globalStorage ?? vscode.Uri.file(path.join(process.env.TEMP || process.cwd(), 'cvucsedit'));
    }
    globalStorage;
    async loadManifest(database) {
        const uri = vscode.Uri.joinPath(this.root, MANIFEST_NAME);
        try {
            const raw = Buffer.from(await vscode.workspace.fs.readFile(uri)).toString('utf8');
            const parsed = JSON.parse(raw);
            if (parsed.version === MANIFEST_VERSION && parsed.database === database) {
                this.manifest = parsed;
                return;
            }
        }
        catch {
            // No manifest yet, or it is unreadable: start clean. The database wins on this run.
        }
        this.manifest = { version: MANIFEST_VERSION, database, entries: {} };
    }
    async saveManifest() {
        if (!this.root) {
            return;
        }
        const uri = vscode.Uri.joinPath(this.root, MANIFEST_NAME);
        await this.writeIfChanged(uri, JSON.stringify(this.manifest, null, 2));
    }
    /** Write only when the bytes differ, so we do not churn mtimes or reload open editors. */
    async writeIfChanged(uri, text) {
        const buffer = Buffer.from(text, 'utf8');
        try {
            const existing = Buffer.from(await vscode.workspace.fs.readFile(uri));
            if (existing.equals(buffer)) {
                return false;
            }
        }
        catch {
            // Does not exist yet.
        }
        await vscode.workspace.fs.writeFile(uri, buffer);
        return true;
    }
    // ---------------------------------------------------------------- placement
    /**
     * Decide where each row lives. Names are sanitised for Windows and de-duplicated with a `~<id>`
     * suffix; the manifest, not the path, remains the authority for file -> UCS id.
     */
    planPaths(rows) {
        const taken = new Set();
        return rows.map(row => {
            const folder = row.isLibrary ? 'lib' : 'ucs';
            const ext = row.kind === 'ucsm' ? '.ucsm' : '.ucs.js';
            const base = sanitiseFileName(row.ucsName);
            let relPath = `${folder}/${base}${ext}`;
            if (taken.has(relPath.toLowerCase())) {
                relPath = `${folder}/${base}~${row.ucsId}${ext}`;
            }
            taken.add(relPath.toLowerCase());
            return { ...row, relPath, uri: vscode.Uri.joinPath(this.root, relPath) };
        });
    }
    // ---------------------------------------------------------------- sync
    /**
     * Reconcile one list of rows against disk, using the manifest's `syncedHash` as the three way
     * merge base. Handles both first population and every later refresh.
     */
    async syncFromDb(placed, folder) {
        if (!this.root) {
            return;
        }
        const seen = new Set();
        const conflicts = [];
        for (const row of placed) {
            seen.add(row.relPath);
            const entry = this.manifest.entries[row.relPath];
            const dbCode = canonical(row.code);
            const dbHash = hash(dbCode);
            let diskCode;
            try {
                const raw = Buffer.from(await vscode.workspace.fs.readFile(row.uri)).toString('utf8');
                diskCode = canonical(stripSentinels(raw, row.kind));
            }
            catch {
                diskCode = undefined;
            }
            if (diskCode === undefined) {
                await this.writeRow(row, dbHash);
                continue;
            }
            const diskHash = hash(diskCode);
            if (diskHash === dbHash) {
                // The code agrees, but the *sentinels* may not: a mirror written by an older version
                // of the extension carries the old wrapper, and stripSentinels is tolerant enough
                // that it would otherwise sit there forever. writeIfChanged makes this a no-op in
                // the normal case.
                await this.writeRow(row, dbHash);
                continue;
            }
            const base = entry?.syncedHash;
            if (base === undefined) {
                // Nothing to merge against (first run, or a wiped manifest): the database wins.
                this.log(`${row.relPath}: no sync base, taking the database copy.`);
                await this.writeRow(row, dbHash);
            }
            else if (diskHash !== base && dbHash === base) {
                // Edited on disk while we were not watching - an agent, or an external tool.
                this.log(`${row.relPath}: local edit found, pushing to the database.`);
                await this.pushToDb(row.ucsId, diskCode, row.relPath, row.ucsName);
                this.setEntry(row, diskHash);
            }
            else if (diskHash === base && dbHash !== base) {
                this.log(`${row.relPath}: changed in Cabinet Vision, updating the file.`);
                await this.writeRow(row, dbHash);
            }
            else {
                conflicts.push(row.relPath);
                this.log(`${row.relPath}: CONFLICT - changed both on disk and in the database. Left untouched.`);
            }
        }
        // Prune files for rows that no longer exist, but only inside the folder we just refreshed.
        for (const relPath of Object.keys(this.manifest.entries)) {
            if (relPath.startsWith(`${folder}/`) && !seen.has(relPath)) {
                delete this.manifest.entries[relPath];
                try {
                    await vscode.workspace.fs.delete(vscode.Uri.joinPath(this.root, relPath));
                    this.log(`${relPath}: removed, no longer present in the database.`);
                }
                catch {
                    // Already gone.
                }
            }
        }
        await this.saveManifest();
        if (conflicts.length) {
            const message = conflicts.length === 1
                ? `Cabinet Vision UCS "${conflicts[0]}" changed both on disk and in the database.`
                : `${conflicts.length} Cabinet Vision UCS files changed both on disk and in the database.`;
            vscode.window.showWarningMessage(`${message} Neither copy was overwritten.`, 'Show Details')
                .then(choice => { if (choice) {
                this.output.show();
            } });
        }
    }
    async writeRow(row, dbHash) {
        await this.writeIfChanged(row.uri, toCrlf(applySentinels(row.code, row.kind, row.ucsName)));
        this.setEntry(row, dbHash);
        if (row.kind === 'jsLibrary' && !isValidIdentifier(libraryClassName(row.ucsName))) {
            this.log(`${row.relPath}: library name "${row.ucsName}" is not a valid JavaScript identifier, ` +
                `so "${libraryClassName(row.ucsName)}" will not parse. Rename it in Cabinet Vision.`);
        }
    }
    setEntry(row, syncedHash) {
        this.manifest.entries[row.relPath] = {
            ucsId: row.ucsId,
            ucsName: row.ucsName,
            isLibrary: row.isLibrary,
            kind: row.kind,
            syncedHash
        };
    }
    async pushToDb(ucsId, canonicalCode, relPath, ucsName) {
        try {
            await this.SQLConn.ExecuteStatment('Update UCS Set Code = @Code Where ID = @ID', [{ Name: 'ID', Value: ucsId }, { Name: 'Code', Value: toCrlf(canonicalCode) }]);
            this.onCodePushed?.(ucsId, toCrlf(canonicalCode));
            return true;
        }
        catch (error) {
            const detail = error instanceof Error ? error.message : String(error);
            this.log(`${relPath}: FAILED to save to the database - ${detail}`);
            vscode.window.showErrorMessage(`Could not save UCS "${ucsName}" to the database: ${detail}`);
            return false;
        }
    }
    // ---------------------------------------------------------------- watching
    startWatching() {
        if (!this.root || this.watcher) {
            return;
        }
        this.watcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(this.root, '**/*.{js,ucsm}'));
        this.disposables.push(this.watcher);
        this.disposables.push(this.watcher.onDidChange(uri => this.queue(uri)));
        this.disposables.push(this.watcher.onDidCreate(uri => this.queue(uri)));
        this.disposables.push(this.watcher.onDidDelete(uri => {
            const relPath = this.relPathOf(uri);
            if (relPath && this.manifest.entries[relPath]) {
                this.log(`${relPath}: deleted on disk. The database row is untouched; refresh to restore the file.`);
            }
        }));
    }
    relPathOf(uri) {
        if (!this.root) {
            return undefined;
        }
        const rel = path.relative(this.root.fsPath, uri.fsPath);
        if (rel.startsWith('..') || path.isAbsolute(rel)) {
            return undefined;
        }
        return rel.split(path.sep).join('/');
    }
    queue(uri) {
        const relPath = this.relPathOf(uri);
        if (!relPath) {
            return;
        }
        if (!this.manifest.entries[relPath]) {
            if (!this.warnedAboutStrayFile) {
                this.warnedAboutStrayFile = true;
                this.log(`${relPath}: not a mirrored UCS, ignoring. Creating UCS entries from the ` +
                    `filesystem is not supported - add them in Cabinet Vision instead.`);
            }
            return;
        }
        const existing = this.pending.get(relPath);
        if (existing) {
            clearTimeout(existing);
        }
        this.pending.set(relPath, setTimeout(() => {
            this.pending.delete(relPath);
            void this.syncToDb(relPath, uri);
        }, WRITE_DEBOUNCE_MS));
    }
    /**
     * The single write path to the database. Editor saves and writes by AI agents or external tools
     * all arrive here, so they behave identically.
     */
    async syncToDb(relPath, uri) {
        const entry = this.manifest.entries[relPath];
        if (!entry) {
            return;
        }
        let diskCode;
        try {
            const raw = Buffer.from(await vscode.workspace.fs.readFile(uri)).toString('utf8');
            diskCode = canonical(stripSentinels(raw, entry.kind));
        }
        catch {
            return;
        }
        const diskHash = hash(diskCode);
        if (diskHash === entry.syncedHash) {
            return; // Echo of our own write, or a change confined to the sentinel lines.
        }
        if (await this.pushToDb(entry.ucsId, diskCode, relPath, entry.ucsName)) {
            entry.syncedHash = diskHash;
            await this.saveManifest();
            this.log(`${relPath}: saved to the database.`);
        }
    }
    log(message) {
        this.output.appendLine(`[${new Date().toLocaleTimeString()}] ${message}`);
    }
}
exports.MirrorFileStore = MirrorFileStore;
//# sourceMappingURL=MirrorFileStore.js.map