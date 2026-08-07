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