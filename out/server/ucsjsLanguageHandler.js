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
//import { CompletionBase } from './CompletionBase';
const node_1 = require("vscode-languageserver/node");
const fs = __importStar(require("fs"));
const CONSTANTS = __importStar(require("../constants"));
class ucsjsLanguageHandler {
    connection;
    languageId;
    ucsjsObjects = [];
    ucsjsConstants = {};
    ucsjsProperties = [];
    ucsjsFunctions = [];
    ucsjsMethods = [];
    dynamicData = {};
    classLibraries = [];
    CVAsmManagedReferences = [];
    CVShapeManagedReferences = [];
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
                label: obj.name,
                kind: node_1.CompletionItemKind.Keyword,
                //detail: `**${obj}**\n\n (CV object)`
                documentation: {
                    kind: 'markdown',
                    value: `**${obj}**\n\n (${obj.Type} object)`
                }
            });
        });
    }
    AddLibraryClassInstances(items) {
        this.classLibraries.forEach((docRef) => {
            //console.log(docRef.name);
            items.push({
                label: docRef.name,
                kind: node_1.CompletionItemKind.Class,
                //detail: `**${docRef.name}**\n\n (CV JavaScript library class instance)`
                documentation: {
                    kind: 'markdown',
                    value: `**${docRef.name}**\n\n (CV JavaScript library class instance)`
                }
            });
        });
    }
    isLibraryClassInstances(items, lineText) {
        for (const libInst of this.classLibraries) {
            const wordRegex = new RegExp(`${libInst.name}[^\\s]*$`, 'i');
            if (wordRegex.test(lineText)) {
                this.AddLibraryClassElements(items, libInst.name);
                return true;
            }
        }
        return false;
    }
    buildLibraryClassParams(params) {
        if (!params)
            return '';
        let Result = '';
        params.forEach(param => {
            const Optional = param.optional ? '?' : '';
            Result += `${param.name}${Optional}\n\n`;
        });
        return Result;
    }
    buildLibraryClassSnippet(elem) {
        if (!elem)
            return '';
        const funcBegin = elem.type.includes('Property') ? '' : '(';
        const funcEnd = elem.type.includes('Property') ? '' : ')';
        let Result = elem.name + funcBegin;
        elem.params?.forEach((param, index) => {
            const Optional = param.optional ? '?' : '';
            if (index > 0)
                Result += ',';
            Result += '${' + index + 1 + ':' + param.name + Optional + '}';
        });
        return Result + funcEnd;
    }
    AddLibraryClassElements(items, className) {
        const classLibrary = this.classLibraries.find(docRef => docRef.name == className);
        if (classLibrary) {
            classLibrary.classElements.forEach(elem => {
                const paramDefs = elem.params ? this.buildLibraryClassParams(elem.params) : undefined;
                const paramsStr = paramDefs ? `\n- **Parameters**: \n\n ${paramDefs}` : '';
                console.log(paramsStr);
                items.push({
                    label: elem.name,
                    insertTextFormat: node_1.InsertTextFormat.Snippet,
                    kind: elem.compKind,
                    //detail: `${elem.name} ${elem.type}`,
                    insertText: this.buildLibraryClassSnippet(elem),
                    documentation: {
                        kind: 'markdown',
                        value: `**${elem.name}**\n\n **Library**: ${classLibrary.name}\n\n **Type**: ${elem.type}${paramsStr}`
                    }
                });
            });
        }
    }
    buildMethodParams(parameterDef) {
        if (!parameterDef)
            return '';
        let Result = '';
        parameterDef.forEach(param => Result += `\n\nType: ${param.ParamName}\n\n Description: ${param.ParamValue}`);
        return Result;
    }
    AddMethods(items, parentObject, type) {
        this.ucsjsMethods.forEach(method => {
            const pObj = parentObject ? parentObject : '';
            const paramDefs = this.buildMethodParams(method.parameterDef);
            const paramDefStr = paramDefs != '' ? `\n **Parameters**: ${paramDefs}` : '';
            //console.log(type , method.objectType, parentObject, method.parentObject);
            if (!parentObject && !method.parentObject || method.parentObject.includes(pObj) || type && method.objectType == type) {
                items.push({
                    label: method.name,
                    kind: node_1.CompletionItemKind.Method,
                    insertTextFormat: node_1.InsertTextFormat.Snippet,
                    //detail: `${method.name} (${method.description} variable)`,
                    insertText: method.value,
                    documentation: {
                        kind: 'markdown',
                        value: `**${method.name}**\n\n- **Description**: ${method.description}\n- **Definition**: ${method.definition}\n- **Example**: ${method.example}\n- **ReturnType**: ${method.returnType}${paramDefStr}`
                    }
                });
            }
        });
    }
    AddProperties(items, parentObject, type) {
        const pObj = parentObject ? parentObject : '';
        //console.log(parentObject, type);
        this.ucsjsProperties.forEach(prop => {
            if (!parentObject && !prop.parentObject || parentObject && prop.parentObject.includes(pObj) || type && prop.objectType == type) {
                console.log(prop.name, type, prop.objectType, parentObject, '-', pObj, '-', prop.parentObject);
                items.push({
                    label: prop.name,
                    kind: node_1.CompletionItemKind.Property,
                    documentation: {
                        kind: 'markdown',
                        value: `**${prop.name}**\n\n (${prop.Type} type)`
                    }
                    //detail: `**${prop.name}**\n\n (${prop.Type} type)`,
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
            const wordRegex = new RegExp(`${spObj.name}[^\\s]*$`, 'i');
            if (wordRegex.test(lineText)) {
                //console.log(lineText , spObj.name, spObj.Type);
                this.AddProperties(items, spObj.name);
                this.AddMethods(items, spObj.name);
                return true;
            }
        }
        return false;
    }
    isCVManaged(items, linePrefix) {
        const findCVManObj = (list) => {
            for (const CVManObj of list) {
                //console.log(linePrefix , CVManObj.variableName);
                //const wordRegex = new RegExp(`${CVAsmObj.objectName}[^\\s]*$`, 'i');
                if (linePrefix == CVManObj.variableName.toUpperCase()) {
                    //console.log(linePrefix , CVManObj.variableName);
                    this.AddProperties(items, CVManObj.objectName, CVManObj.type);
                    this.AddMethods(items, CVManObj.objectName, CVManObj.type);
                    //console.log(linePrefix , CVManObj.variableName, CVManObj.objectName);
                    return true;
                }
            }
            return false;
        };
        if (findCVManObj(this.CVAsmManagedReferences))
            return true;
        if (findCVManObj(this.CVShapeManagedReferences))
            return true;
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
    getHoverWord(word, wordRange, prefixWord) {
        const object = this.ucsjsObjects.find(obj => obj.name === word);
        if (object) {
            return {
                contents: {
                    kind: 'markdown',
                    value: `**${object.name}**\n\n (${object.Type} object)`
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
        const CVAsmManVarRefMatch = this.CVAsmManagedReferences.find(varRef => varRef.variableName.toUpperCase() == prefixWord);
        const CVShapeManVarRefMatch = this.CVShapeManagedReferences.find(varRef => varRef.variableName.toUpperCase() == prefixWord);
        //this.connection.console.log(`variableName "${this.CVShapeManagedReferences[0].variableName}" objectName "${this.CVShapeManagedReferences[0].objectName}"`);
        //this.connection.console.log(`prefixWord "${prefixWord}" objectType "${CVShapeManVarRefMatch?.type}" variableName "${CVShapeManVarRefMatch?.variableName}"`);
        const property = this.ucsjsProperties.find(prop => prop.name === word);
        if (property) { // 
            const parObjUpper = property.parentObject ? property.parentObject.map(o => o.toUpperCase()) : [];
            if (parObjUpper.includes(prefixWord)
                || CVAsmManVarRefMatch && property.parentObject.includes(CVAsmManVarRefMatch.objectName)
                || CVShapeManVarRefMatch && property.objectType == CVShapeManVarRefMatch.type) {
                //this.connection.console.log(`prefixWord "${prefixWord}" parentObject "${property.parentObject}"`);
                return {
                    contents: {
                        kind: 'markdown',
                        value: `**${property.name}**\n\n (${property.Type} type)`
                    },
                    range: wordRange
                };
            }
        }
        const method = this.ucsjsMethods.find(method => method.name === word);
        if (method) {
            //this.connection.console.log(`prefixWord "${prefixWord}" parentObject "${method.parentObject}"`);
            const parObjUpper = method.parentObject.map(o => o.toUpperCase());
            //this.connection.console.log(`prefixWord "${prefixWord}" parentObject "${method.parentObject}" parObjUpper "${parObjUpper}" objectName "${CVAsmManVarRefMatch?.objectName}"`);
            if (parObjUpper.includes(prefixWord)
                || CVAsmManVarRefMatch && method.parentObject.includes(CVAsmManVarRefMatch.objectName)
                || CVShapeManVarRefMatch && method.objectType == CVShapeManVarRefMatch.type) {
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
        }
        const classLib = this.classLibraries.find(item => item.name === word);
        if (classLib) {
            return {
                contents: {
                    kind: 'markdown',
                    value: `**${classLib.name}**\n\n (CV JavaScript library class instance)`
                },
                range: wordRange // Optional: Highlight the word
            };
        }
        for (const classLibrary of this.classLibraries) {
            if (classLibrary.name == prefixWord) {
                const element = classLibrary.classElements.find(elem => elem.name === word);
                if (element) {
                    const paramDefs = element.params ? this.buildLibraryClassParams(element.params) : undefined;
                    const paramsStr = paramDefs ? `\n- **Parameters**: \n\n ${paramDefs}` : '';
                    return {
                        contents: {
                            kind: 'markdown',
                            value: `**${element.name}**\n\n **Library**: ${classLibrary.name}\n\n **Type**: ${element.type}${paramsStr}`
                        },
                        range: wordRange // Optional: Highlight the word
                    };
                }
            }
        }
        for (const CVAsmObj of this.CVAsmManagedReferences) {
            if (CVAsmObj.variableName == word) {
                return {
                    contents: {
                        kind: 'markdown',
                        value: `**${CVAsmObj.variableName}**\n\n (CVAsmManaged object "${CVAsmObj.objectName}")`
                    },
                    range: wordRange // Optional: Highlight the word
                };
            }
        }
        for (const CVManObj of this.CVShapeManagedReferences) {
            if (CVManObj.variableName == word) {
                return {
                    contents: {
                        kind: 'markdown',
                        value: `**${CVManObj.variableName}**\n\n (CVShapeManaged object "${CVManObj.objectName}")`
                    },
                    range: wordRange // Optional: Highlight the word
                };
            }
        }
        for (const key of Object.keys(this.ucsjsConstants)) {
            const KeyName = key;
            const cons = this.ucsjsConstants[KeyName].find(con => con === word);
            if (cons) {
                return {
                    contents: {
                        kind: 'markdown',
                        value: `**${cons}**\n\n (${key} constant)`
                    },
                    range: wordRange // Optional: Highlight the word
                };
            }
        }
        // Return undefined if no hover info is available
        return undefined;
    }
    getDefinition(symbol, prefixSymbol) {
        for (const classLibrary of this.classLibraries) {
            if (classLibrary.name === symbol && prefixSymbol == '') {
                const startPos = { line: 0, character: 0 };
                const endPos = { line: 1, character: 0 };
                const range = node_1.Range.create(startPos, endPos);
                return { uri: classLibrary.uri, range };
            }
            if (prefixSymbol == classLibrary.name) {
                const Symbols = classLibrary.classElements.find(elem => elem.name === symbol);
                if (Symbols) {
                    const sym = Symbols;
                    if (sym) {
                        return { uri: classLibrary.uri, range: sym.range };
                    }
                }
            }
        }
    }
    getReferences(symbol, prefixSymbol, uri) {
        for (const classLibrary of this.classLibraries) {
            if (classLibrary.name === symbol && prefixSymbol == '') {
                return classLibrary.classReferences.map(classRef => node_1.Location.create(classRef.uri, classRef.range));
            }
            console.log(`uri "${uri}" split "${uri.split(":/")}"`);
            const libName = '_' + uri.split(":/")[1].split(".")[0];
            ;
            if (prefixSymbol == classLibrary.name || libName == classLibrary.name) {
                //console.log(`symbol "${symbol}" prefixWord "${prefixSymbol}"`);
                const Symbols = classLibrary.classElements.find(elem => elem.name === symbol);
                if (Symbols) {
                    const sym = Symbols;
                    if (sym) {
                        const elemRefs = classLibrary.elementReferences.filter(elemRef => elemRef.elementName == sym.name);
                        return elemRefs.map(elemRef => node_1.Location.create(elemRef.uri, elemRef.range));
                    }
                }
            }
        }
    }
}
exports.ucsjsLanguageHandler = ucsjsLanguageHandler;
//# sourceMappingURL=ucsjsLanguageHandler.js.map