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
exports.CustomLanguageFoldingProvider = void 0;
const vscode = __importStar(require("vscode"));
const fs = __importStar(require("fs"));
const CONSTANTS = __importStar(require("./constants"));
class CustomLanguageFoldingProvider {
    controlStructures;
    constructor() {
        // Load the JSON file from the extension directory
        const jsonPath = CONSTANTS.UCSMCONTROLSTRUCTURESJSONPATH;
        const jsonContent = fs.readFileSync(jsonPath, 'utf8');
        const config = JSON.parse(jsonContent);
        this.controlStructures = config.controlStructures;
    }
    provideFoldingRanges(document, context, token) {
        const foldingRanges = [];
        for (let i = 0; i < document.lineCount; i++) {
            const line = document.lineAt(i).text.trim();
            // Check each control structure
            for (const structure of this.controlStructures) {
                if (!structure.customValidation) {
                    // const openingPattern = structure.requiredSuffix
                    //     ? `${structure.openingKeyword} ${structure.requiredSuffix}`
                    //     : structure.openingKeyword;
                    const openingPattern = structure.openingKeyword;
                    const KeyW = structure.openingKeyword;
                    const Suffix = structure.requiredSuffix;
                    const pettern = structure.requiredSuffix ? `${KeyW}.*${Suffix}` : `${KeyW}`;
                    const openMatch = new RegExp(pettern, 'i');
                    //if (this.lineMatches(line, structure, document, i)) {
                    if (openMatch.test(line)) {
                        const startLine = i;
                        let endLine = this.findClosingLine(document, i, structure);
                        if (endLine !== -1) {
                            foldingRanges.push(new vscode.FoldingRange(startLine, endLine));
                            // Handle Else clause if supported
                            if (structure.supportsElse) {
                                const elseLine = this.findElseLine(document, startLine, endLine);
                                if (elseLine !== -1) {
                                    foldingRanges.push(new vscode.FoldingRange(startLine, elseLine - 1)); // Before Else
                                    foldingRanges.push(new vscode.FoldingRange(elseLine, endLine)); // After Else
                                }
                            }
                            i = endLine; // Skip to the end of the block
                            break;
                        }
                    }
                }
            }
        }
        return foldingRanges;
    }
    // Find the line number of the closing keyword
    findClosingLine(document, startLine, structure) {
        for (let j = startLine + 1; j < document.lineCount; j++) {
            const line = document.lineAt(j).text.trim();
            if (line === structure.closingKeyword) {
                return j;
            }
        }
        return -1; // Not found
    }
    // Find an Else clause between start and end lines (if supported)
    findElseLine(document, startLine, endLine) {
        for (let j = startLine + 1; j < endLine; j++) {
            const line = document.lineAt(j).text.trim();
            if (line === 'Else') {
                return j;
            }
        }
        return -1; // No Else found
    }
}
exports.CustomLanguageFoldingProvider = CustomLanguageFoldingProvider;
//# sourceMappingURL=ucsmFoldingProvider.js.map