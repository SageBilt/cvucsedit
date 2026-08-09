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
exports.ucsjsLanguageHandler = void 0;
const node_1 = require("vscode-languageserver/node");
const fs = __importStar(require("fs"));
const CONSTANTS = __importStar(require("../constants"));
/**
 * What remains of UCS:JS language support on the server.
 *
 * The Cabinet Vision API itself - objects, properties, methods, constants, library classes and the
 * types flowing between them - is described by the generated cv-api.d.ts and served by VS Code's own
 * TypeScript service, which handles completion, hover, signature help, definitions, references and
 * rename. This class only covers what TypeScript cannot know: which *specific* Cabinet Vision values
 * belong at a given argument position, driven by `parameterDef[].DataType`.
 */
class ucsjsLanguageHandler {
    connection;
    ucsjsObjects = [];
    ucsjsConstants = {};
    ucsjsMethods = [];
    ucsjsSnippets = [];
    dynamicData = {};
    constructor(conn) {
        this.connection = conn;
        try {
            const ucsjsSystemData = JSON.parse(fs.readFileSync(CONSTANTS.UCSJSSYSTEMJSONPATH, 'utf8'));
            this.ucsjsObjects = ucsjsSystemData.objects;
            this.ucsjsConstants = ucsjsSystemData.constants;
            this.ucsjsMethods = ucsjsSystemData.methods;
        }
        catch (error) {
            const err = error;
            this.connection.console.log(err.message);
        }
        try {
            const snippets = JSON.parse(fs.readFileSync(CONSTANTS.UCSJSSNIPPETSJSONPATH, 'utf8'));
            this.ucsjsSnippets = this.buildSnippetItems(snippets);
        }
        catch (error) {
            const err = error;
            this.connection.console.log(`Could not load UCS:JS snippets: ${err.message}`);
        }
    }
    /**
     * Turns the snippet file into completion items once, at construction: the file is static, so
     * rebuilding it on every keystroke would be wasted work.
     */
    buildSnippetItems(snippets) {
        return Object.entries(snippets).map(([name, snippet]) => {
            const body = Array.isArray(snippet.body) ? snippet.body.join('\n') : snippet.body;
            return {
                label: snippet.prefix || name,
                kind: node_1.CompletionItemKind.Snippet,
                detail: snippet.description ?? name,
                insertText: body,
                insertTextFormat: node_1.InsertTextFormat.Snippet,
                documentation: {
                    kind: 'markdown',
                    value: `${snippet.description ? `${snippet.description}\n\n` : ''}\`\`\`javascript\n${body}\n\`\`\``
                }
            };
        });
    }
    /**
     * The multi line UCS:JS snippets - new part, route, dado, hole, linebore and connection. These
     * used to be a `package.json` snippet contribution, but that is scoped by language id alone and
     * so offered them in every JavaScript file in the window. Here they ride on the language
     * client's document selector, which is already restricted to the mirror and the debug folder.
     */
    AddSnippets(items) {
        items.push(...this.ucsjsSnippets);
    }
    AddObjects(items) {
        this.ucsjsObjects.forEach(obj => {
            items.push({
                label: obj.name,
                kind: node_1.CompletionItemKind.Keyword,
                documentation: {
                    kind: 'markdown',
                    value: `**${obj.name}**\n\n${obj.Type ? `(${obj.Type} object)` : '(Cabinet Vision object)'}`
                }
            });
        });
    }
    AddConstants(items, constantList, ConstantListName) {
        constantList.forEach(cons => {
            items.push({
                label: cons,
                kind: node_1.CompletionItemKind.Constant,
                detail: `${cons} (${ConstantListName} constant)`,
                //   documentation: {
                //     kind: 'markdown',
                //     value: `**${method.name}**\n\n- **Description**: ${method.description}\n- **Definition**: ${method.definition}\n- **Example**: ${method.example}\n- **ReturnType**: ${method.returnType}${paramDefStr}`
                //   }
            });
        });
    }
}
exports.ucsjsLanguageHandler = ucsjsLanguageHandler;
//# sourceMappingURL=ucsjsLanguageHandler.js.map