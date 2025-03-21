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
exports.ucsjsCompletion = void 0;
//import { CompletionBase } from './CompletionBase';
const node_1 = require("vscode-languageserver/node");
const fs = __importStar(require("fs"));
const CONSTANTS = __importStar(require(".././constants"));
class ucsjsCompletion {
    connection;
    languageId;
    ucsjsObjects = [];
    ucsjsConstants = {};
    ucsjsProperties = [];
    ucsjsFunctions = [];
    ucsjsMethods = [];
    // private AssemblyTypes: string[] = [];
    // private parameterModTypes: string[] = [];
    // private parameterModStyles: string[] = [];
    // private databaseIDTypes: string[] = [];
    // private parameterTypes: string[] = [];
    constructor(LangID, conn) {
        //super();
        this.connection = conn;
        this.languageId = LangID;
        try {
            const ucsjsSystemData = JSON.parse(fs.readFileSync(CONSTANTS.UCSJSSYSTEMJSONPATH, 'utf8'));
            this.ucsjsObjects = ucsjsSystemData.objects;
            this.ucsjsConstants = ucsjsSystemData.constants;
            this.ucsjsProperties = ucsjsSystemData.properties;
            this.ucsjsFunctions = ucsjsSystemData.functions;
            this.ucsjsMethods = ucsjsSystemData.methods;
            this.ucsjsConstants.AssemblyTypes;
            //   this.AssemblyTypes = ucsjsSystemData.constants.AssemblyTypes;
            //   this.parameterModTypes = ucsjsSystemData.constants.parameterModTypes;
            //   this.parameterModStyles = ucsjsSystemData.constants.parameterModStyles;
            //   this.databaseIDTypes = ucsjsSystemData.constants.databaseIDTypes;
            //   this.parameterTypes = ucsjsSystemData.constants.parameterTypes;  
        }
        catch (error) {
            const err = error;
            this.connection.console.log(err.message);
        }
    }
    AddObjects(items) {
        this.ucsjsObjects.forEach(obj => {
            items.push({
                label: obj,
                kind: node_1.CompletionItemKind.Keyword,
                detail: `${obj} (CV object)`
            });
        });
    }
    buildMethodParams(parameterDef) {
        if (!parameterDef)
            return '';
        let Result = '';
        parameterDef.forEach(param => Result += `*Type*: ${param.ParamName}\n- *Description*: ${param.ParamValue}`);
        return Result;
    }
    AddMethods(items, parentObject) {
        this.ucsjsMethods.forEach(method => {
            const pObj = parentObject ? parentObject : '';
            const paramDefs = this.buildMethodParams(method.parameterDef);
            const paramDefStr = paramDefs != '' ? `\n- **Parameters**: \n\n- ${paramDefs}` : '';
            if (!parentObject && !method.parentObject || method.parentObject.includes(pObj)) {
                items.push({
                    label: method.name,
                    kind: node_1.CompletionItemKind.Method,
                    insertTextFormat: node_1.InsertTextFormat.Snippet,
                    detail: `${method.name} (${method.description} variable)`,
                    insertText: method.value,
                    documentation: {
                        kind: 'markdown',
                        value: `**${method.name}**\n\n- **Description**: ${method.description}\n- **Definition**: ${method.definition}\n- **Example**: ${method.example}\n- **ReturnType**: ${method.returnType}${paramDefStr}`
                    }
                });
            }
        });
    }
    AddProperties(items, parentObject) {
        const pObj = parentObject ? parentObject : '';
        this.ucsjsProperties.forEach(prop => {
            if (!parentObject && !prop.parentObject || prop.parentObject.includes(pObj)) {
                items.push({
                    label: prop.name,
                    kind: node_1.CompletionItemKind.Property,
                    detail: `${prop.name} (${prop.Type} type)`,
                    //   documentation: {
                    //     kind: 'markdown',
                    //     value: `**${prop.name}**\n\n- **Description**: ${prop.description}\n- **Value**: ${prop.value}\n- **Example**: ${prop.example}\n- **ReturnType**: ${prop.returnType}$`
                    //   }
                });
            }
        });
    }
    isObject(items, lineText) {
        for (const spObj of this.ucsjsObjects) {
            const wordRegex = new RegExp(`${spObj}[^\\s]*$`, 'i');
            if (wordRegex.test(lineText)) {
                this.AddProperties(items, spObj);
                this.AddMethods(items, spObj);
                return true;
            }
        }
        return false;
    }
    // isObject() : boolean {
    // }
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
    AddAllConstants(items) {
        for (const [key, constants] of Object.entries(this.ucsjsConstants)) {
            this.AddConstants(items, constants, key);
        }
    }
    AddFunctions(items) {
        this.ucsjsFunctions.forEach(func => {
            items.push({
                label: func.name,
                kind: node_1.CompletionItemKind.Function,
                detail: `${func.name} (CV function)`,
                documentation: {
                    kind: 'markdown',
                    value: `**${func.name}**\n\n- **Description**: ${func.description}\n- **Definition**: ${func.definition}\n- **Example**: ${func.example}`
                }
            });
        });
    }
    getHoverWord(word, wordRange) {
        const object = this.ucsjsObjects.find(obj => obj === word);
        if (object) {
            return {
                contents: {
                    kind: 'markdown',
                    value: `${object} (CV object)`
                },
                range: wordRange // Optional: Highlight the word
            };
        }
        const func = this.ucsjsFunctions.find(f => f.name === word);
        if (func) {
            return {
                contents: {
                    kind: 'markdown',
                    value: `**${func.name}**\n\n- **Description**: ${func.description}\n- **Definition**: ${func.definition}\n- **Example**: ${func.example}`
                },
                range: wordRange // Optional: Highlight the word
            };
        }
        const property = this.ucsjsProperties.find(prop => prop.name === word);
        if (property) {
            return {
                contents: {
                    kind: 'markdown',
                    value: `${property.name} (${property.Type} type)`
                },
                range: wordRange
            };
        }
        const method = this.ucsjsMethods.find(method => method.name === word);
        if (method) {
            const paramDefs = this.buildMethodParams(method.parameterDef);
            const paramDefStr = paramDefs != '' ? `\n- **Parameters**: \n\n- ${paramDefs}` : '';
            this.connection.console.log(`Hover parameter data type "${method.name}"`);
            return {
                contents: {
                    kind: 'markdown',
                    value: `**${method.name}**\n\n- **Description**: ${method.description}\n- **Definition**: ${method.definition}\n- **Example**: ${method.example}\n- **ReturnType**: ${method.returnType}${paramDefStr}`
                },
                range: wordRange
            };
        }
        for (const key of Object.keys(this.ucsjsConstants)) {
            const KeyName = key;
            const cons = this.ucsjsConstants[KeyName].find(con => con === word);
            if (cons) {
                return {
                    contents: {
                        kind: 'markdown',
                        value: `${cons}  (${key} constant)`
                    },
                    range: wordRange // Optional: Highlight the word
                };
            }
        }
        // Return undefined if no hover info is available
        return undefined;
    }
}
exports.ucsjsCompletion = ucsjsCompletion;
//# sourceMappingURL=ucsjsCompletion.js.map