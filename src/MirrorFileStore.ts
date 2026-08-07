import * as vscode from 'vscode';
import * as path from 'path';
import * as crypto from 'crypto';
import { SQLConnection } from './SQLConnection';

/**
 * The kind of sentinel decoration a mirrored file carries. Sentinels are the only difference
 * between the on disk form of a UCS and the form stored in the database, and they exist so the
 * TypeScript service resolves UCS:JS with the correct scoping:
 *
 *   jsLibrary - wrapped in `const _<Name> = new class { ... }();`. No import/export, so TypeScript
 *               treats the file as a *script* and `_<Name>` becomes a project wide global, callable
 *               from every UCS. It has to be an *instance* rather than a bare class declaration:
 *               UCS code calls `_<Name>.Method()` directly, and the members of `class _<Name> {}`
 *               live on the prototype, so they would not resolve off the class itself.
 *   js        - wrapped in `(function () { ... })();`, mirroring what Cabinet Vision does at
 *               runtime: a UCS is executed as a function body, which is why a top level `return` is
 *               legal in one. Presenting it to TypeScript as a bare script instead was a lie that
 *               cost a TS1108 on every `return`. The wrapper also gives the file its own scope, so
 *               one UCS still cannot see another's declarations - the job the earlier trailing
 *               `export {};` module marker did, now done by function scope instead.
 *   ucsm      - no sentinels, UCS:M is not part of the TypeScript project.
 */
export type SentinelKind = 'jsLibrary' | 'js' | 'ucsm';

/** The module marker written by 2.0.0. Only still recognised so those mirrors round trip. */
export const MODULE_MARKER = 'export {};';

/**
 * The generated header carried by every mirrored file.
 *
 * `AGENTS.md` in the mirror root only helps an agent that goes looking for it, and that turns out
 * to depend entirely on the tool: nested instruction files are discovered lazily, at the project
 * root only, or not at all, and a folder that is both dot prefixed and git ignored is skipped
 * outright by some. The header sidesteps discovery altogether - it is in the file the agent was
 * asked to edit, so it is in context the moment the file is read, in any tool.
 *
 * It is part of the sentinel block, not part of the code: stripped before hashing, never pushed to
 * the database, and reverted by the editor guard.
 */
const BANNER_PREFIX_JS = '//~';
const BANNER_PREFIX_UCSM = ';~';

/**
 * Required on the first banner line for the block to be recognised on the way back out. Without it
 * a run of lines that merely happen to start with the prefix could be silently eaten from someone's
 * code, and stripping is destructive - it decides what is *not* written to the database.
 */
const BANNER_MARKER = 'cvucsedit';

function bannerPrefix(kind: SentinelKind): string {
    return kind === 'ucsm' ? BANNER_PREFIX_UCSM : BANNER_PREFIX_JS;
}

function escapeRegExp(text: string): string {
    return text.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
}

/**
 * Kept to four lines. This sits at the top of every UCS the user opens, so it has to earn its space:
 * only the things that are both invisible from the file and expensive to get wrong.
 */
function bannerLines(kind: SentinelKind): string[] {
    return [
        `Cabinet Vision UCS - generated header (${BANNER_MARKER}). Not part of this standard.`,
        'Saving this file writes straight to the live database. There is no undo and no git history.',
        kind === 'ucsm'
            ? 'These ~ lines belong to the extension. The standard itself starts below them.'
            : 'These ~ lines and the last line belong to the extension. Edit only between them.',
        'Creating a file here does NOT create a UCS. Read ../AGENTS.md before changing anything.'
    ];
}

export function leadingBanner(kind: SentinelKind): string {
    const prefix = bannerPrefix(kind);
    return bannerLines(kind).map(line => `${prefix} ${line}`).join('\r\n');
}

/**
 * Remove the generated header. Tolerant in the same way as `stripSentinels`, and for the same
 * reason: something that bypasses the editor guard may have mangled it, and that must not corrupt
 * the round trip. Only a block that starts on the first line *and* identifies itself is removed, so
 * a comment of the user's own is never mistaken for one.
 */
export function stripBanner(text: string, kind: SentinelKind): string {
    const prefix = bannerPrefix(kind);
    const firstLine = /^[^\r\n]*/.exec(text)?.[0] ?? '';
    if (!firstLine.trimStart().startsWith(prefix) || !firstLine.includes(BANNER_MARKER)) {
        return text;
    }
    const block = new RegExp(`^(?:[ \\t]*${escapeRegExp(prefix)}[^\\r\\n]*(?:\\r?\\n|$))+`);
    return text.replace(block, '');
}

/**
 * Number of sentinel lines inserted *before* the code, i.e. the line offset for reveal/highlight.
 * Derived from `leadingSentinel` rather than stated separately, so the two cannot drift - the count
 * does not depend on the UCS name, which only ever appears within a line.
 */
export function leadingSentinelLines(kind: SentinelKind, ucsName = ''): number {
    const leading = leadingSentinel(kind, ucsName);
    return leading ? leading.split('\n').length : 0;
}

export interface ManifestEntry {
    ucsId: number;
    ucsName: string;
    isLibrary: boolean;
    kind: SentinelKind;
    /** sha256 of the canonical (sentinel stripped, LF normalised) code last synced with the database. */
    syncedHash: string;
}

interface Manifest {
    version: number;
    database: string;
    entries: { [relPath: string]: ManifestEntry };
}

/** A database row reduced to what the mirror needs in order to place it on disk. */
export interface MirrorRow {
    ucsId: number;
    ucsName: string;
    code: string;
    kind: SentinelKind;
    isLibrary: boolean;
}

/** Where a row was placed, handed back so the tree item can be built against the same URI. */
export interface PlacedRow extends MirrorRow {
    relPath: string;
    uri: vscode.Uri;
}

const MANIFEST_VERSION = 1;
const MANIFEST_NAME = 'manifest.json';
const WRITE_DEBOUNCE_MS = 300;

/**
 * Not dot prefixed, deliberately. A hidden folder is skipped outright by some AI agent tools when
 * they look for context and instruction files, which defeats the entire point of mirroring to disk.
 */
const DEFAULT_MIRROR_FOLDER = 'cvucs';
const LEGACY_MIRROR_FOLDER = '.cvucs';

const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

/** Canonical form used for every hash and comparison: sentinel free, LF line endings. */
function canonical(code: string): string {
    return code.replace(/\r\n/g, '\n');
}

function hash(code: string): string {
    return crypto.createHash('sha256').update(canonical(code), 'utf8').digest('hex');
}

/** Files are written with CRLF, matching what Cabinet Vision stores. */
function toCrlf(text: string): string {
    return text.replace(/\r\n/g, '\n').replace(/\n/g, '\r\n');
}

/** Make a UCS name safe to use as a Windows filename. Collisions are resolved by the caller. */
function sanitiseFileName(name: string): string {
    let safe = name.replace(/[\\/:*?"<>|\x00-\x1f]/g, '_').replace(/[. ]+$/, '').trim();
    if (WINDOWS_RESERVED.test(safe)) {
        safe = `${safe}_`;
    }
    return safe.length ? safe : 'ucs';
}

/** The identifier a library is bound to. This is the name UCS code calls it by. */
export function libraryClassName(ucsName: string): string {
    return `_${ucsName.toLowerCase()}`;
}

export function isValidIdentifier(name: string): boolean {
    return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name);
}

const IDENTIFIER = '[A-Za-z_$][A-Za-z0-9_$]*';

/** `const _Name = new class {`, or the earlier `class _Name {` still on disk from older mirrors. */
const LIBRARY_OPEN = new RegExp(
    `^[ \\t]*(?:const[ \\t]+${IDENTIFIER}[ \\t]*=[ \\t]*new[ \\t]+class(?:[ \\t]+${IDENTIFIER})?|class[ \\t]+${IDENTIFIER})[ \\t]*\\{[ \\t]*\\r?\\n?`
);

/** The matching `}();`. The `()` is required, so a body whose last line is a brace is left alone. */
const LIBRARY_CLOSE = /(\r?\n)?[ \t]*\}[ \t]*\([ \t]*\)[ \t]*;?[ \t]*(\r?\n)*$/;

/** The legacy bare `}`. Only safe to strip when the leading sentinel was the legacy one too. */
const LIBRARY_CLOSE_LEGACY = /(\r?\n)?[ \t]*\}[ \t]*(\r?\n)*$/;

/** `(function () {`, allowing a name so a hand edited wrapper is still recognised. */
const UCS_OPEN = new RegExp(
    `^[ \\t]*\\([ \\t]*function[ \\t]*(?:${IDENTIFIER})?[ \\t]*\\([ \\t]*\\)[ \\t]*\\{[ \\t]*\\r?\\n?`
);

/** The matching `})();`. Specific enough that a body ending in a brace is never mistaken for it. */
const UCS_CLOSE = /(\r?\n)?[ \t]*\}[ \t]*\)[ \t]*\([ \t]*\)[ \t]*;?[ \t]*(\r?\n)*$/;

/** The trailing `export {};` written by 2.0.0, before the function wrapper replaced it. */
const MODULE_MARKER_PATTERN = /(\r?\n)?[ \t]*export[ \t]*\{[ \t]*\}[ \t]*;?[ \t]*(\r?\n)*$/;

/**
 * The sentinel line written before the code, if any. Single source of truth for the editor guard.
 *
 * The library's class expression is named after the UCS wherever that is a legal identifier, purely
 * so hovers and errors read `const _MyLib: MyLib` rather than `(Anonymous class)`. The name is local
 * to the expression, so it adds no global of its own. The UCS wrapper stays anonymous - nothing
 * refers to it, and a name would only be one more thing to keep in step with a rename.
 */
export function leadingSentinel(kind: SentinelKind, ucsName: string): string | undefined {
    const banner = leadingBanner(kind);
    switch (kind) {
        case 'jsLibrary': {
            const typeName = isValidIdentifier(ucsName) ? ` ${ucsName}` : '';
            return `${banner}\r\nconst ${libraryClassName(ucsName)} = new class${typeName.toLowerCase()} {`;
        }
        case 'js': return `${banner}\r\n(function () {`;
        // UCS:M has no wrapper - it is not in the TypeScript project and needs no scoping - but it
        // does get the header, which is the whole point of the header.
        default: return banner;
    }
}

/** The sentinel line written after the code, if any. */
export function trailingSentinel(kind: SentinelKind): string | undefined {
    switch (kind) {
        case 'jsLibrary': return '}();';
        case 'js': return '})();';
        default: return undefined;
    }
}

/** Add the sentinel lines that turn database code into the on disk form. */
export function applySentinels(code: string, kind: SentinelKind, ucsName: string): string {
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
export function stripSentinels(text: string, kind: SentinelKind): string {
    // The header always comes off first: it sits above the wrapper, so the wrapper patterns below
    // are all anchored to the start of what is left. A mirror from an earlier version has no header
    // and this is a no-op, which is what keeps those files round tripping.
    text = stripBanner(text, kind);

    if (kind === 'ucsm') {
        return text;
    }

    if (kind === 'js') {
        // Current form: the function wrapper. Its closing line is only stripped when the opening one
        // was found, so a UCS that merely ends in `})();` of its own is left alone.
        const open = UCS_OPEN.exec(text);
        if (open) {
            return text.slice(open[0].length).replace(UCS_CLOSE, '');
        }
        // Otherwise a mirror written by 2.0.0, or a wrapper someone has deleted.
        return text.replace(MODULE_MARKER_PATTERN, '');
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
export class MirrorFileStore implements vscode.Disposable {
    public root: vscode.Uri | undefined;
    /** The workspace folder the mirror sits in, if any. Where the root pointer files are written. */
    public workspaceRoot: vscode.Uri | undefined;

    private manifest: Manifest = { version: MANIFEST_VERSION, database: '', entries: {} };
    private watcher: vscode.FileSystemWatcher | undefined;
    private pending = new Map<string, NodeJS.Timeout>();
    private disposables: vscode.Disposable[] = [];
    private output: vscode.OutputChannel;
    private initialised = false;
    private warnedAboutStrayFile = false;
    private label = '';

    /** Called after an external edit has been pushed to the database, so the tree stays current. */
    public onCodePushed: ((ucsId: number, code: string) => void) | undefined;

    constructor(private readonly SQLConn: SQLConnection) {
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
    async initialize(): Promise<void> {
        if (this.initialised) {
            return;
        }

        const config = vscode.workspace.getConfiguration('cvucsedit');
        const folderName = config.get<string>('MirrorFolder', DEFAULT_MIRROR_FOLDER);
        const database = config.get('Database', 'CVData');

        this.label = `${folderName}/${sanitiseFileName(database)}/`;

        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        const base = workspaceFolder ? workspaceFolder.uri : this.fallbackRoot();
        if (!workspaceFolder) {
            vscode.window.showWarningMessage(
                'No folder is open, so Cabinet Vision UCS files are being mirrored outside the workspace. ' +
                'Open a folder for AI agents and search to be able to reach them.'
            );
        }
        this.workspaceRoot = workspaceFolder?.uri;
        this.root = vscode.Uri.joinPath(base, folderName, sanitiseFileName(database));

        // The default folder name lost its dot in 2.1. Move an existing mirror rather than leaving
        // it behind: the manifest inside it is the three way merge base, so starting fresh would
        // silently discard any edit made on disk but not yet pushed.
        // `get` falls back to the package.json default, so only `inspect` can tell "unset" from
        // "set to the default"; a folder the user chose explicitly is never moved out from under them.
        const chosen = config.inspect<string>('MirrorFolder');
        const explicit = chosen?.globalValue ?? chosen?.workspaceValue ?? chosen?.workspaceFolderValue;
        if (explicit === undefined && folderName !== LEGACY_MIRROR_FOLDER) {
            await this.migrateLegacyRoot(
                vscode.Uri.joinPath(base, LEGACY_MIRROR_FOLDER, sanitiseFileName(database)),
                vscode.Uri.joinPath(base, LEGACY_MIRROR_FOLDER)
            );
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
     * Move a mirror written under the old dot prefixed folder name to the new one. Renaming keeps
     * `manifest.json` with it, which matters more than it looks: `syncedHash` is the three way merge
     * base, and without it `syncFromDb` has nothing to merge against and lets the database win,
     * silently discarding any edit made on disk since the last sync.
     *
     * Best effort throughout. A failure here is not worth blocking activation for - the worst case
     * is the old folder being left behind, which is inert.
     */
    private async migrateLegacyRoot(legacyRoot: vscode.Uri, legacyParent: vscode.Uri): Promise<void> {
        try {
            await vscode.workspace.fs.stat(legacyRoot);
        } catch {
            return; // nothing to migrate
        }

        try {
            await vscode.workspace.fs.stat(this.root!);
            return; // the new location already exists; leave the old one alone rather than merge
        } catch {
            // Expected: the new location is where we are moving to.
        }

        try {
            await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(this.root!, '..'));
            await vscode.workspace.fs.rename(legacyRoot, this.root!, { overwrite: false });
            this.log(`Mirror moved from ${LEGACY_MIRROR_FOLDER}/ to ${this.label}`);

            // Only remove the old parent if we emptied it - another database may still be mirrored there.
            const remaining = await vscode.workspace.fs.readDirectory(legacyParent);
            if (!remaining.length) {
                await vscode.workspace.fs.delete(legacyParent, { recursive: true });
            }
        } catch (error) {
            this.log(`Could not move the mirror out of ${LEGACY_MIRROR_FOLDER}/ - ${
                error instanceof Error ? error.message : String(error)}. The old folder can be deleted by hand.`);
        }
    }

    /**
     * Write the generated TypeScript project files. These are what give mirrored UCS:JS full
     * IntelliSense, rename and find-references from VS Code's own JavaScript service.
     */
    public async writeProjectFiles(dts: string, jsconfig: string): Promise<void> {
        if (!this.root) {
            return;
        }
        await this.writeIfChanged(vscode.Uri.joinPath(this.root, 'cv-api.d.ts'), dts);
        await this.writeIfChanged(vscode.Uri.joinPath(this.root, 'jsconfig.json'), jsconfig);
    }

    /**
     * Write the agent facing documentation. Separate from `writeProjectFiles` because these are for
     * a reader rather than for the TypeScript service: they describe the rules an agent cannot infer
     * from the files themselves - that a save goes straight to SQL, that a new file is ignored, that
     * the sentinel lines are not code - and they are the only UCS:M reference anywhere in the
     * workspace.
     */
    public async writeAgentDocs(docs: { [fileName: string]: string }): Promise<void> {
        if (!this.root) {
            return;
        }
        for (const [name, content] of Object.entries(docs)) {
            await this.writeIfChanged(vscode.Uri.joinPath(this.root, name), content);
        }
    }

    /** The mirror root as it reads in the workspace, e.g. `cvucs/CVData/`. For display only. */
    public get rootLabel(): string {
        return this.label;
    }

    /**
     * Maintain the pointer block in the workspace root `AGENTS.md` and `CLAUDE.md`.
     *
     * This is the only thing the extension writes outside its own folder, so it is conservative:
     * off with one setting, additive between markers, and it announces itself the first time it
     * creates or changes one of these files.
     *
     * `merge` returns undefined when the file already says the right thing, so a workspace that is
     * up to date is never written to at all.
     */
    public async writeRootPointer(
        block: string,
        merge: (existing: string | undefined, block: string) => string | undefined,
        announce: () => void
    ): Promise<void> {
        if (!this.workspaceRoot) {
            return; // mirroring outside the workspace; there is no project root to point from
        }
        if (!vscode.workspace.getConfiguration('cvucsedit').get('WriteRootAgentFiles', true)) {
            return;
        }

        for (const name of ['AGENTS.md', 'CLAUDE.md']) {
            const uri = vscode.Uri.joinPath(this.workspaceRoot, name);
            let existing: string | undefined;
            try {
                existing = Buffer.from(await vscode.workspace.fs.readFile(uri)).toString('utf8');
            } catch {
                existing = undefined;
            }

            const merged = merge(existing, block);
            if (merged === undefined) {
                continue;
            }

            try {
                await vscode.workspace.fs.writeFile(uri, Buffer.from(merged, 'utf8'));
                this.log(`${name}: ${existing === undefined ? 'created' : 'updated'} the UCS pointer block.`);
                announce();
            } catch (error) {
                this.log(`${name}: could not write the UCS pointer block - ${
                    error instanceof Error ? error.message : String(error)}`);
            }
        }
    }

    /** Mirror root as a forward slashed absolute path, for building documentSelector globs. */
    public globBase(): string | undefined {
        return this.root ? this.root.fsPath.replace(/\\/g, '/') : undefined;
    }

    private fallbackRoot(): vscode.Uri {
        // globalStorageUri is only reachable through the extension context; the caller sets it.
        return this.globalStorage ?? vscode.Uri.file(path.join(process.env.TEMP || process.cwd(), 'cvucsedit'));
    }

    public globalStorage: vscode.Uri | undefined;

    private async loadManifest(database: string) {
        const uri = vscode.Uri.joinPath(this.root!, MANIFEST_NAME);
        try {
            const raw = Buffer.from(await vscode.workspace.fs.readFile(uri)).toString('utf8');
            const parsed = JSON.parse(raw) as Manifest;
            if (parsed.version === MANIFEST_VERSION && parsed.database === database) {
                this.manifest = parsed;
                return;
            }
        } catch {
            // No manifest yet, or it is unreadable: start clean. The database wins on this run.
        }
        this.manifest = { version: MANIFEST_VERSION, database, entries: {} };
    }

    private async saveManifest() {
        if (!this.root) {
            return;
        }
        const uri = vscode.Uri.joinPath(this.root, MANIFEST_NAME);
        await this.writeIfChanged(uri, JSON.stringify(this.manifest, null, 2));
    }

    /** Write only when the bytes differ, so we do not churn mtimes or reload open editors. */
    private async writeIfChanged(uri: vscode.Uri, text: string): Promise<boolean> {
        const buffer = Buffer.from(text, 'utf8');
        try {
            const existing = Buffer.from(await vscode.workspace.fs.readFile(uri));
            if (existing.equals(buffer)) {
                return false;
            }
        } catch {
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
    public planPaths(rows: MirrorRow[]): PlacedRow[] {
        const taken = new Set<string>();
        return rows.map(row => {
            const folder = row.isLibrary ? 'lib' : 'ucs';
            const ext = row.kind === 'ucsm' ? '.ucsm' : '.ucs.js';
            const base = sanitiseFileName(row.ucsName);

            let relPath = `${folder}/${base}${ext}`;
            if (taken.has(relPath.toLowerCase())) {
                relPath = `${folder}/${base}~${row.ucsId}${ext}`;
            }
            taken.add(relPath.toLowerCase());

            return { ...row, relPath, uri: vscode.Uri.joinPath(this.root!, relPath) };
        });
    }

    // ---------------------------------------------------------------- sync

    /**
     * Reconcile one list of rows against disk, using the manifest's `syncedHash` as the three way
     * merge base. Handles both first population and every later refresh.
     */
    public async syncFromDb(placed: PlacedRow[], folder: 'ucs' | 'lib'): Promise<void> {
        if (!this.root) {
            return;
        }

        const seen = new Set<string>();
        const conflicts: string[] = [];

        for (const row of placed) {
            seen.add(row.relPath);
            const entry = this.manifest.entries[row.relPath];
            const dbCode = canonical(row.code);
            const dbHash = hash(dbCode);

            let diskCode: string | undefined;
            try {
                const raw = Buffer.from(await vscode.workspace.fs.readFile(row.uri)).toString('utf8');
                diskCode = canonical(stripSentinels(raw, row.kind));
            } catch {
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
            } else if (diskHash !== base && dbHash === base) {
                // Edited on disk while we were not watching - an agent, or an external tool.
                this.log(`${row.relPath}: local edit found, pushing to the database.`);
                await this.pushToDb(row.ucsId, diskCode, row.relPath, row.ucsName);
                this.setEntry(row, diskHash);
            } else if (diskHash === base && dbHash !== base) {
                this.log(`${row.relPath}: changed in Cabinet Vision, updating the file.`);
                await this.writeRow(row, dbHash);
            } else {
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
                } catch {
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
                .then(choice => { if (choice) { this.output.show(); } });
        }
    }

    private async writeRow(row: PlacedRow, dbHash: string) {
        await this.writeIfChanged(row.uri, toCrlf(applySentinels(row.code, row.kind, row.ucsName)));
        this.setEntry(row, dbHash);

        if (row.kind === 'jsLibrary' && !isValidIdentifier(libraryClassName(row.ucsName))) {
            this.log(
                `${row.relPath}: library name "${row.ucsName}" is not a valid JavaScript identifier, ` +
                `so "${libraryClassName(row.ucsName)}" will not parse. Rename it in Cabinet Vision.`
            );
        }
    }

    private setEntry(row: PlacedRow, syncedHash: string) {
        this.manifest.entries[row.relPath] = {
            ucsId: row.ucsId,
            ucsName: row.ucsName,
            isLibrary: row.isLibrary,
            kind: row.kind,
            syncedHash
        };
    }

    private async pushToDb(ucsId: number, canonicalCode: string, relPath: string, ucsName: string): Promise<boolean> {
        try {
            await this.SQLConn.ExecuteStatment(
                'Update UCS Set Code = @Code Where ID = @ID',
                [{ Name: 'ID', Value: ucsId }, { Name: 'Code', Value: toCrlf(canonicalCode) }]
            );
            this.onCodePushed?.(ucsId, toCrlf(canonicalCode));
            return true;
        } catch (error) {
            const detail = error instanceof Error ? error.message : String(error);
            this.log(`${relPath}: FAILED to save to the database - ${detail}`);
            vscode.window.showErrorMessage(`Could not save UCS "${ucsName}" to the database: ${detail}`);
            return false;
        }
    }

    // ---------------------------------------------------------------- watching

    private startWatching() {
        if (!this.root || this.watcher) {
            return;
        }

        this.watcher = vscode.workspace.createFileSystemWatcher(
            new vscode.RelativePattern(this.root, '**/*.{js,ucsm}')
        );
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

    private relPathOf(uri: vscode.Uri): string | undefined {
        if (!this.root) {
            return undefined;
        }
        const rel = path.relative(this.root.fsPath, uri.fsPath);
        if (rel.startsWith('..') || path.isAbsolute(rel)) {
            return undefined;
        }
        return rel.split(path.sep).join('/');
    }

    private queue(uri: vscode.Uri) {
        const relPath = this.relPathOf(uri);
        if (!relPath) {
            return;
        }

        if (!this.manifest.entries[relPath]) {
            if (!this.warnedAboutStrayFile) {
                this.warnedAboutStrayFile = true;
                this.log(
                    `${relPath}: not a mirrored UCS, ignoring. Creating UCS entries from the ` +
                    `filesystem is not supported - add them in Cabinet Vision instead.`
                );
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
    private async syncToDb(relPath: string, uri: vscode.Uri) {
        const entry = this.manifest.entries[relPath];
        if (!entry) {
            return;
        }

        let diskCode: string;
        try {
            const raw = Buffer.from(await vscode.workspace.fs.readFile(uri)).toString('utf8');
            diskCode = canonical(stripSentinels(raw, entry.kind));
        } catch {
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

    private log(message: string) {
        this.output.appendLine(`[${new Date().toLocaleTimeString()}] ${message}`);
    }
}
