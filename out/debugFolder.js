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
exports.debugFolder = debugFolder;
exports.debugFolderGlobBase = debugFolderGlobBase;
const vscode = __importStar(require("vscode"));
/**
 * The tail of the path Cabinet Vision opens when it launches VS Code to debug a UCS, for example
 * `C:\ProgramData\Hexagon\CABINET VISION\CV 2025\Temp\UCSJS\`.
 *
 * Only the tail is fixed - the install root and the version segment both vary per machine - so this
 * is matched against the *end* of the folder path rather than being a path of its own.
 */
const DEFAULT_DEBUG_SUFFIX = 'Temp/UCSJS';
/**
 * The Cabinet Vision debug folder open in this window, or undefined if this is not one.
 *
 * Cabinet Vision extracts each UCS it is about to debug into that folder as a plain `.js` file,
 * wrapped in `function fn<Name>() { … }`, and attaches the debugger to its own script engine. Those
 * files are not mirrored, are not ours, and are wiped when Cabinet Vision restarts - but they are
 * still UCS:JS, so everything the extension knows about the language applies to them.
 *
 * The folder's own Uri is returned rather than a path built from the setting, and that is the point
 * of doing it this way: the result goes straight into a `documentSelector` glob, and minimatch is
 * case sensitive, so the casing has to be the one the filesystem actually has.
 */
function debugFolder() {
    const configured = vscode.workspace.getConfiguration('cvucsedit')
        .get('DebugFolderSuffix', DEFAULT_DEBUG_SUFFIX).trim();
    if (!configured) {
        return undefined; // cleared by the user: the feature is off
    }
    const wanted = segments(configured);
    if (!wanted.length) {
        return undefined;
    }
    // Every folder, not just the first: Cabinet Vision opens it as the whole window, but nothing
    // stops someone adding it to a workspace alongside their own project.
    for (const folder of vscode.workspace.workspaceFolders ?? []) {
        const parts = segments(folder.uri.fsPath);
        const from = parts.length - wanted.length;
        if (from >= 0 && wanted.every((want, i) => parts[from + i] === want)) {
            return folder.uri;
        }
    }
    return undefined;
}
/** The debug folder as a forward slashed absolute path, for building documentSelector globs. */
function debugFolderGlobBase() {
    return debugFolder()?.fsPath.replace(/\\/g, '/');
}
/** Lower cased path segments, because Windows, split on either separator so the setting may use both. */
function segments(value) {
    return value.split(/[\\/]+/).filter(Boolean).map(part => part.toLowerCase());
}
//# sourceMappingURL=debugFolder.js.map