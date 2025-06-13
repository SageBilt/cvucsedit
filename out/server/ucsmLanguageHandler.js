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
exports.ucsmLanguageHandler = void 0;
//import { CompletionBase } from './CompletionBase';
const node_1 = require("vscode-languageserver/node");
const fs = __importStar(require("fs"));
const CONSTANTS = __importStar(require("../constants"));
class ucsmLanguageHandler {
    connection;
    languageId;
    keywords = [];
    objectClass = [];
    objectTypes = [];
    datatypes = [];
    variables = [];
    functions = [];
    specialObjects = [];
    dynamicData = {};
    symbolTable = new Map();
    constructor(LangID, conn) {
        //super();
        this.connection = conn;
        this.languageId = LangID;
        try {
            const ucsmSystemData = JSON.parse(fs.readFileSync(CONSTANTS.UCSMSYSTEMJSONPATH, 'utf8'));
            this.keywords = ucsmSystemData.keywords || [];
            this.objectClass = ucsmSystemData.objectClass || [];
            this.objectTypes = ucsmSystemData.objectTypes || [];
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
    updateSymbolTable(doc) {
        const Insert = (varName, lineNum, Char, dataType) => {
            if (!varName)
                return;
            if (excluded.includes(varName.toUpperCase()))
                return;
            const range = {
                start: { line: lineNum, character: Char },
                end: { line: lineNum, character: Char + varName.length }
            };
            console.log(varName, dataType);
            const newSymbol = { name: varName, uri: doc.uri, range, dataType: dataType };
            const varNameRef = varName.toUpperCase();
            const symbols = this.symbolTable.get(varNameRef);
            if (!symbols)
                this.symbolTable.set(varNameRef, [newSymbol]);
            else
                symbols.push(newSymbol);
        };
        this.symbolTable.clear(); // For simplicity; optimize later with incremental updates
        const text = doc.getText();
        const Vars = this.variables.map(v => v.name);
        const specOjb = this.specialObjects.map(v => v.prefix);
        const excluded = [...this.keywords, ...Vars, ...specOjb, ...this.objectClass, ...this.objectTypes, ...this.dynamicData.partDefs];
        // Example: Naive parsing for variables like "let x = ..."
        const lines = text.split('\n');
        lines.forEach((line, lineNum) => {
            const lineWithoutComments = line.split(';')[0];
            if (!lineWithoutComments.toUpperCase().includes('FOR EACH')) {
                const defpPattern = /^\s*([A-Za-z_:][A-Za-z0-9_\\.:]*)+(?:<(crncy|meas|deg|int|bool|dec|text|style|desc)?>)?\s*(?::?=|as)s*/i;
                const matchDef = lineWithoutComments.match(defpPattern);
                if (matchDef) {
                    const varName = matchDef[1].trim();
                    Insert(varName, lineNum, lineWithoutComments.indexOf(varName), matchDef[2]);
                }
                else {
                    const pattern = /(?<!')\b[A-Za-z_][A-Za-z0-9_]*/ig; ///\s*([A-Za-z_{}][A-Za-z0-9_{}@]*)+\s*/ig;
                    const match = lineWithoutComments.match(pattern);
                    if (match) {
                        match.forEach(m => {
                            const varName = m.trim();
                            Insert(varName, lineNum, lineWithoutComments.indexOf(varName));
                        });
                    }
                }
            }
        });
    }
    Addsymbols(items) {
        this.symbolTable.forEach((Symbols, key) => {
            const groupedSymbols = new Map();
            Symbols.forEach((symbol) => {
                const dataTypeUC = symbol.dataType?.toUpperCase();
                if (dataTypeUC && !groupedSymbols.has(dataTypeUC))
                    groupedSymbols.set(dataTypeUC, symbol);
            });
            groupedSymbols.forEach(sym => {
                items.push({
                    label: sym.name,
                    kind: node_1.CompletionItemKind.Variable,
                    documentation: {
                        kind: 'markdown',
                        value: `**${sym.name}** (**Type** ${sym.dataType})`
                    }
                });
            });
        });
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
                documentation: {
                    kind: 'markdown',
                    value: `**${kw}**\n\n (${this.languageId} keyword)`
                }
            });
        });
    }
    AddObjectClass(items) {
        this.objectClass.forEach(cls => {
            items.push({
                label: cls,
                kind: node_1.CompletionItemKind.Constant,
                documentation: {
                    kind: 'markdown',
                    value: `**${cls}**\n\n (${this.languageId} Object class)`
                }
            });
        });
    }
    AddObjectType(items) {
        this.objectTypes.forEach(type => {
            items.push({
                label: type,
                kind: node_1.CompletionItemKind.Constant,
                documentation: {
                    kind: 'markdown',
                    value: `**${type}**\n\n (${this.languageId} Object type)`
                }
            });
        });
    }
    AddPartDefs(items) {
        this.dynamicData.partDefs.forEach(part => {
            items.push({
                label: part.partName,
                kind: node_1.CompletionItemKind.Class,
                documentation: {
                    kind: 'markdown',
                    value: `**${part.partName}**\n\n${part.description}\n\n- **class**: ${part.className}\n- **Sub Class**: ${part.subClassName}`
                }
            });
        });
    }
    AddMaterialParams(items) {
        this.dynamicData.materialParams.forEach(param => {
            items.push({
                label: param.paramName,
                kind: node_1.CompletionItemKind.Property,
                documentation: {
                    kind: 'markdown',
                    value: `**${param.paramName}** (Material Parameter)\n\n${param.paramDesc}\n\n- **Type**: ${param.paramTypeName}`
                }
            });
        });
    }
    AddConstructionParams(items) {
        this.dynamicData.constructionParams.forEach(param => {
            items.push({
                label: param.paramName,
                kind: node_1.CompletionItemKind.Property,
                documentation: {
                    kind: 'markdown',
                    value: `**${param.paramName}** (Construction Parameter)\n\n${param.paramDesc}\n\n- **Type**: ${param.paramTypeName}`
                }
            });
        });
    }
    AddScheduleParams(items) {
        this.dynamicData.scheduleParams.forEach(param => {
            items.push({
                label: param.paramName,
                kind: node_1.CompletionItemKind.Property,
                documentation: {
                    kind: 'markdown',
                    value: `**${param.paramName}** (Material Schedule Parameter)\n\n${param.paramDesc}\n\n- **Type**: ${param.paramTypeName}`
                }
            });
        });
    }
    AddCaseStandards(items) {
        this.dynamicData.caseStandards.forEach(std => {
            items.push({
                label: std.id.toString(),
                kind: node_1.CompletionItemKind.Property,
                documentation: {
                    kind: 'markdown',
                    value: `**${std.id.toString()}** (Construction case standard)\n\n${std.name}\n\n${std.description}\n\n- **Measurment Type**: ${std.typeName}`
                }
            });
        });
    }
    AddMaterials(items, compAsStr) {
        this.dynamicData.materials.forEach(mat => {
            items.push({
                label: mat.name,
                insertText: compAsStr ? mat.name : mat.id.toString(),
                kind: node_1.CompletionItemKind.Value,
                documentation: {
                    kind: 'markdown',
                    value: `**${mat.name}** (CV Material)\n\n${mat.description}\n\n- **Material Type**: ${mat.typeName}`
                }
            });
        });
    }
    AddConstructions(items, constType, compAsStr) {
        this.dynamicData.constructions.forEach(con => {
            if (constType == con.typeName || constType == '') {
                items.push({
                    label: con.name,
                    insertText: compAsStr ? con.name : con.id.toString(),
                    kind: node_1.CompletionItemKind.Value,
                    documentation: {
                        kind: 'markdown',
                        value: `**${con.name}** (CV Construction)\n\n${con.description}\n\n- **Construction Type**: ${con.typeName}`
                    }
                });
            }
        });
    }
    AddSchedules(items, constType, compAsStr) {
        this.dynamicData.schedules.forEach(sched => {
            if (constType == sched.typeName || constType == '') {
                items.push({
                    label: sched.name,
                    insertText: compAsStr ? sched.name : sched.id.toString(),
                    kind: node_1.CompletionItemKind.Value,
                    documentation: {
                        kind: 'markdown',
                        value: `**${sched.name}** (CV Schedule)\n\n${sched.description}\n\n- **Schedule Type**: ${sched.typeName}`
                    }
                });
            }
        });
    }
    AddDoors(items, compAsStr) {
        this.dynamicData.doors.forEach(dor => {
            items.push({
                label: dor.name,
                insertText: compAsStr ? dor.name : dor.id.toString(),
                kind: node_1.CompletionItemKind.Value,
                documentation: {
                    kind: 'markdown',
                    value: `**${dor.name}** (CV Door)\n\n${dor.description}\n\n- **Catalog Name**: ${dor.CatName}\n- **Notes**: ${dor.Notes}\n- **Tags**: ${dor.Tags}`
                }
            });
        });
    }
    AddConnections(items, compAsStr) {
        this.dynamicData.connections.forEach(conn => {
            items.push({
                label: conn.name,
                insertText: compAsStr ? conn.name : conn.id.toString(),
                kind: node_1.CompletionItemKind.Value,
                documentation: {
                    kind: 'markdown',
                    value: `**${conn.name}** (CV Connection)\n\n${conn.description}\n\n- **Connection Type**: ${conn.typeName}`
                }
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
    AddDatTypes(items, excludeFirstChar) {
        this.datatypes.forEach(type => {
            items.push({
                label: type.name,
                kind: node_1.CompletionItemKind.TypeParameter,
                //insertTextFormat: InsertTextFormat.Snippet,
                detail: `${type.value} (data type)`,
                insertText: excludeFirstChar ? type.value.substring(1) : type.value,
                documentation: {
                    kind: 'markdown',
                    value: `**${type.name}**\n\n${type.description}`
                }
            });
        });
    }
    FilterVariableNameForWorkPlan(word) {
        if (word.substring(0, 4) == '_EDG') {
            const splitParts = word.split(/[0-9]/);
            if (splitParts.length > 1)
                return `${splitParts[0]}N${splitParts[1]}`;
        }
        return word;
    }
    getHoverMaterialFromID(word) {
        const matID = Number(word);
        if (!isNaN(matID)) {
            const mat = this.dynamicData.materials.find(m => m.id == matID);
            if (mat) {
                //console.log(`mat ${mat.name}`);
                return {
                    contents: {
                        kind: 'markdown',
                        value: `**${mat.name}** (CV Material)\n\n${mat.description}\n\n- **Material Type**: ${mat.typeName}`
                    },
                };
            }
        }
    }
    getHoverConstructionFromID(word) {
        const matID = Number(word);
        if (!isNaN(matID)) {
            const con = this.dynamicData.constructions.find(c => c.id == matID);
            if (con) {
                //console.log(`mat ${con.name}`);
                return {
                    contents: {
                        kind: 'markdown',
                        value: `**${con.name}** (CV Construction)\n\n${con.description}\n\n- **Construction Type**: ${con.typeName}`
                    },
                };
            }
        }
    }
    getHoverScheduleFromID(word) {
        const schedID = Number(word);
        if (!isNaN(schedID)) {
            const sched = this.dynamicData.schedules.find(sched => sched.id == schedID);
            if (sched) {
                //console.log(`mat ${con.name}`);
                return {
                    contents: {
                        kind: 'markdown',
                        value: `**${sched.name}** (CV Schedule)\n\n${sched.description}\n\n- **Schedule Type**: ${sched.typeName}`
                    },
                };
            }
        }
    }
    getHoverConnectionFromID(word) {
        const connID = Number(word);
        if (!isNaN(connID)) {
            const conn = this.dynamicData.connections.find(conn => conn.id == connID);
            if (conn) {
                return {
                    contents: {
                        kind: 'markdown',
                        value: `**${conn.name}** (CV Connection)\n\n${conn.description}\n\n- **Connection Type**: ${conn.typeName}`
                    },
                };
            }
        }
    }
    getHoverWord(word, wordRange, prefixWord) {
        // this.symbolTable.forEach((Symbols: SymbolInfo[], key: string) => {
        //   console.log(` this is the ${key}`);
        // });
        //console.log(` this is the ${this.symbolTable.}`);
        const func = this.functions.find(f => f.name.toUpperCase() === word);
        if (func) {
            return {
                contents: {
                    kind: 'markdown',
                    value: `**${func.name}**\n\n${func.description}`
                },
                range: wordRange // Optional: Highlight the word
            };
        }
        const keyw = this.keywords.find(k => k.toUpperCase() === word);
        if (keyw) {
            return {
                contents: {
                    kind: 'markdown',
                    value: `**${keyw}**\n\n(${this.languageId} keyword)`
                },
                range: wordRange // Optional: Highlight the word
            };
        }
        const specOjb = this.specialObjects.find(so => so.prefix.toUpperCase() === word);
        if (specOjb) {
            return {
                contents: {
                    kind: 'markdown',
                    value: `**${specOjb.prefix}**\n\n(${specOjb.description})`
                },
                range: wordRange
            };
        }
        const dataType = this.datatypes.find(dt => dt.value.toUpperCase() === word);
        if (dataType) {
            return {
                contents: {
                    kind: 'markdown',
                    value: `**${dataType.name}**\n\n${dataType.description}`
                },
                range: wordRange
            };
        }
        const objClass = this.objectClass.find(cls => cls.toUpperCase() === word);
        if (objClass) {
            return {
                contents: {
                    kind: 'markdown',
                    value: `**${objClass}**\n\n(${this.languageId} Object class)`
                },
                range: wordRange // Optional: Highlight the word
            };
        }
        const objType = this.objectTypes.find(type => type.toUpperCase() === word);
        if (objType) {
            return {
                contents: {
                    kind: 'markdown',
                    value: `**${objType}**\n\n(${this.languageId} Object type)`
                },
                range: wordRange // Optional: Highlight the word
            };
        }
        console.log(typeof this.dynamicData.materialParams);
        const MatParams = this.dynamicData.materialParams.find(param => param.paramName.toUpperCase() === word);
        if (MatParams && prefixWord == '_M:') {
            return {
                contents: {
                    kind: 'markdown',
                    value: `**${MatParams.paramName}** (Material Parameter)\n\n${MatParams.paramDesc}\n\n- **Type**: ${MatParams.paramTypeName}`
                },
                range: wordRange
            };
        }
        const ConstParams = this.dynamicData.constructionParams.find(param => param.paramName.toUpperCase() === word);
        if (ConstParams && prefixWord == '_CS:') {
            return {
                contents: {
                    kind: 'markdown',
                    value: `**${ConstParams.paramName}** (Construction Parameter)\n\n${ConstParams.paramDesc}\n\n- **Type**: ${ConstParams.paramTypeName}`
                },
                range: wordRange
            };
        }
        const SchedParams = this.dynamicData.scheduleParams.find(param => param.paramName.toUpperCase() === word);
        if (SchedParams && prefixWord == '_MS:') {
            return {
                contents: {
                    kind: 'markdown',
                    value: `**${SchedParams.paramName}** (Material Schedule Parameter)\n\n${SchedParams.paramDesc}\n\n- **Type**: ${SchedParams.paramTypeName}`
                },
                range: wordRange
            };
        }
        const dor = this.dynamicData.doors.find(dor => dor.id.toString() == word);
        if (dor && (prefixWord == '_STYLEID' || prefixWord == 'DOORSTYLEID')) {
            return {
                contents: {
                    kind: 'markdown',
                    value: `**${dor.name}** (CV Door)\n\n${dor.description}\n\n- **Catalog Name**: ${dor.CatName}\n- **Notes**: ${dor.Notes}\n- **Tags**: ${dor.Tags}`
                },
                range: wordRange
            };
        }
        const caseStd = this.dynamicData.caseStandards.find(std => std.id.toString() === word);
        if (caseStd && (prefixWord == '_CB:' || prefixWord == '_CV:')) {
            return {
                contents: {
                    kind: 'markdown',
                    value: `**${caseStd.id.toString()}** (Construction case standard)\n\n${caseStd.name}\n\n${caseStd.description}\n\n- **Measurment Type**: ${caseStd.typeName}`
                },
                range: wordRange
            };
        }
        const PartDefs = this.dynamicData.partDefs.find(part => part.partName.toUpperCase() === word);
        if (PartDefs) {
            return {
                contents: {
                    kind: 'markdown',
                    value: `**${PartDefs.partName}**\n\n${PartDefs.description}\n\n- **class**: ${PartDefs.className}\n- **Sub Class**: ${PartDefs.subClassName}`
                },
                range: wordRange
            };
        }
        const filtForWorkPlan = this.FilterVariableNameForWorkPlan(word);
        const variable = this.variables.find(v => {
            //if (v.name.substring(0,4) == '_EDG') console.log(`"${filtForWorkPlan}" "${v.name.toUpperCase()}"`);
            if (v.name.toUpperCase() == filtForWorkPlan && (!v.parentObject || v.parentObject == prefixWord)) {
                return v;
            }
        });
        if (variable) {
            return {
                contents: {
                    kind: 'markdown',
                    value: `**${variable.name}**\n\n${variable.description}\n\n- **Type**: ${variable.type}\n- **Valid Range**: ${variable.validRange}\n- **Applies To**: ${variable.appliesTo}\n- **Values**: ${variable.values}\n- **Visibility**: ${variable.visibility}`
                },
                range: wordRange
            };
        }
        const dTypes = this.datatypes.find(dt => dt.name.toUpperCase() === word);
        if (dTypes) {
            return {
                contents: {
                    kind: 'markdown',
                    value: `**${dTypes.name}**\n\n${dTypes.description}`
                },
                range: wordRange // Optional: Highlight the word
            };
        }
        const Symbols = this.symbolTable.get(word);
        if (Symbols) {
            console.log(` this is the ${Symbols.length}`);
            const sym = Symbols[0];
            if (sym) {
                return {
                    contents: {
                        kind: 'markdown',
                        value: `**${sym.name}**\n\n(***Type*** ${sym.dataType})`
                    },
                    range: wordRange // Optional: Highlight the word
                };
            }
        }
        // Return undefined if no hover info is available
        return undefined;
    }
    getReferences(symbol) {
        const Result = [];
        const Symbols = this.symbolTable.get(symbol.toUpperCase());
        if (Symbols) {
            Symbols.forEach((sym) => {
                Result.push({ uri: sym.uri, range: sym.range });
            });
        }
        return Result;
    }
}
exports.ucsmLanguageHandler = ucsmLanguageHandler;
//# sourceMappingURL=ucsmLanguageHandler.js.map