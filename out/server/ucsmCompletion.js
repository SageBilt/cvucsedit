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
exports.ucsmCompletion = void 0;
//import { CompletionBase } from './CompletionBase';
const node_1 = require("vscode-languageserver/node");
const fs = __importStar(require("fs"));
const CONSTANTS = __importStar(require(".././constants"));
class ucsmCompletion {
    connection;
    languageId;
    keywords = [];
    datatypes = [];
    variables = [];
    functions = [];
    specialObjects = [];
    constructor(LangID, conn) {
        //super();
        this.connection = conn;
        this.languageId = LangID;
        try {
            const ucsmSystemData = JSON.parse(fs.readFileSync(CONSTANTS.UCSMSYSTEMJSONPATH, 'utf8'));
            this.keywords = ucsmSystemData.keywords || [];
            this.variables = ucsmSystemData.variables || [];
            this.functions = ucsmSystemData.functions || [];
            this.datatypes = ucsmSystemData.types || [];
            this.specialObjects = ucsmSystemData.specialObjects || [];
        }
        catch (error) {
            const err = error;
            this.connection.console.log(err.message);
        }
    }
    AddSpecialObjects(items) {
        this.specialObjects.forEach(spObj => {
            items.push({
                label: spObj.prefix,
                kind: node_1.CompletionItemKind.Class,
                detail: `${spObj.prefix} (${spObj.description})`
            });
        });
    }
    AddKeywords(items) {
        this.keywords.forEach(kw => {
            items.push({
                label: kw,
                kind: node_1.CompletionItemKind.Keyword,
                detail: `${kw} (${this.languageId} keyword)`
            });
        });
    }
    AddVariables(items, parentObject) {
        this.variables.forEach(variable => {
            if (!parentObject && !variable.parentObject || variable.parentObject == parentObject) {
                items.push({
                    label: variable.name,
                    kind: node_1.CompletionItemKind.Variable,
                    detail: `${variable.name} (${variable.type} variable)`,
                    documentation: {
                        kind: 'markdown',
                        value: `**${variable.name}**\n\n${variable.description}\n\n- **Type**: ${variable.type}\n- **Valid Range**: ${variable.validRange}\n- **Applies To**: ${variable.appliesTo}\n- **Values**: ${variable.values}\n- **Visibility**: ${variable.visibility}`
                    }
                });
            }
        });
    }
    AddFunction(items) {
        this.functions.forEach(func => {
            items.push({
                label: func.name,
                kind: node_1.CompletionItemKind.Function,
                insertTextFormat: node_1.InsertTextFormat.Snippet,
                detail: `${func.value} (Common Function)`,
                insertText: func.value,
                documentation: {
                    kind: 'markdown',
                    value: `**${func.name}**\n\n${func.description}`
                }
            });
        });
    }
    AddDatTypes(items) {
        this.datatypes.forEach(type => {
            items.push({
                label: type.name,
                kind: node_1.CompletionItemKind.TypeParameter,
                insertTextFormat: node_1.InsertTextFormat.Snippet,
                detail: `${type.value} (data type)`,
                insertText: type.value,
                documentation: {
                    kind: 'markdown',
                    value: `**${type.name}**\n\n${type.description}`
                }
            });
        });
    }
    hoverFunction() {
    }
    getHoverWord(word, wordRange) {
        const func = this.functions.find(f => f.name === word);
        if (func) {
            return {
                contents: {
                    kind: 'markdown',
                    value: `**${func.name}**\n\n${func.description}`
                },
                range: wordRange // Optional: Highlight the word
            };
        }
        const keyw = this.keywords.find(k => k === word);
        if (keyw) {
            return {
                contents: {
                    kind: 'markdown',
                    value: `${keyw} (${this.languageId} keyword)`
                },
                range: wordRange // Optional: Highlight the word
            };
        }
        const specOjb = this.specialObjects.find(so => so.prefix === word);
        if (specOjb) {
            return {
                contents: {
                    kind: 'markdown',
                    value: `${specOjb.prefix} (${specOjb.description})`
                },
                range: wordRange
            };
        }
        const variable = this.variables.find(v => v.name === word);
        if (variable) {
            return {
                contents: {
                    kind: 'markdown',
                    value: `**${variable.name}**\n\n${variable.description}\n\n- **Type**: ${variable.type}\n- **Valid Range**: ${variable.validRange}\n- **Applies To**: ${variable.appliesTo}\n- **Values**: ${variable.values}\n- **Visibility**: ${variable.visibility}`
                },
                range: wordRange
            };
        }
        const dTypes = this.datatypes.find(dt => dt.name === word);
        if (dTypes) {
            return {
                contents: {
                    kind: 'markdown',
                    value: `**${dTypes.name}**\n\n${dTypes.description}`
                },
                range: wordRange // Optional: Highlight the word
            };
        }
        // Return undefined if no hover info is available
        return undefined;
    }
}
exports.ucsmCompletion = ucsmCompletion;
//# sourceMappingURL=ucsmCompletion.js.map