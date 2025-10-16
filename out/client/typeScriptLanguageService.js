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
exports.createTSLanguageServiceHost = createTSLanguageServiceHost;
const ts = __importStar(require("typescript"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path")); // ← ADD THIS
//const defFileName = '../Languages/ucsjs/uscjs_definitions.d.ts';
function createTSLanguageServiceHost(definitionsPath, documentUri, documentContent) {
    const defFileName = path.normalize(definitionsPath).replace(/\\/g, '/');
    return {
        getScriptFileNames: () => {
            const files = [defFileName];
            if (documentUri)
                files.push(documentUri); // ← ADD DOC
            return files;
        },
        getScriptSnapshot: (fileName) => {
            if (fileName === defFileName) {
                return ts.ScriptSnapshot.fromString(fs.readFileSync(definitionsPath, 'utf8'));
            }
            if (fileName === documentUri && documentContent) { // ← ADD DOC CONTENT
                return ts.ScriptSnapshot.fromString(documentContent);
            }
            return undefined;
        },
        getScriptVersion: (fileName) => '1',
        getCurrentDirectory: () => process.cwd(),
        getCompilationSettings: () => ({ allowJs: true, checkJs: true }),
        getDefaultLibFileName: () => '',
        fileExists: (fileName) => {
            if (fileName === defFileName) {
                return fs.existsSync(fileName);
            }
            return true;
        },
        readFile: (fileName) => {
            if (fileName === defFileName) {
                return fs.readFileSync(fileName, 'utf8');
            }
            return undefined;
        }
    };
}
//# sourceMappingURL=typeScriptLanguageService.js.map