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
const node_1 = require("vscode-languageserver/node");
const vscode_languageserver_textdocument_1 = require("vscode-languageserver-textdocument");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
class LanguageServer {
    connection;
    documents;
    languageId;
    keywords;
    datatypes;
    variables;
    functions;
    valueTypes;
    dimTypes;
    forEachTypes;
    controlStructures;
    specialObjects;
    constructor(config) {
        this.connection = (0, node_1.createConnection)(node_1.ProposedFeatures.all);
        this.connection.console.log("Starting language server...");
        this.documents = new node_1.TextDocuments(vscode_languageserver_textdocument_1.TextDocument);
        this.languageId = config.languageId;
        const systemData = JSON.parse(fs.readFileSync(config.systemJsonPath, 'utf8'));
        this.keywords = systemData.keywords || [];
        this.variables = systemData.variables || [];
        this.functions = systemData.functions || [];
        this.datatypes = systemData.types || [];
        const syntaxData = JSON.parse(fs.readFileSync(config.syntaxJsonPath, 'utf8'));
        this.valueTypes = syntaxData.valueTypes || [];
        this.dimTypes = syntaxData.dimTypes || [];
        this.forEachTypes = syntaxData.forEachTypes || [];
        const controlData = JSON.parse(fs.readFileSync(config.controlStructuresJsonPath, 'utf8'));
        this.controlStructures = controlData.controlStructures || [];
        const specialObjectsData = JSON.parse(fs.readFileSync(config.specialObjectsJsonPath, 'utf8'));
        this.specialObjects = specialObjectsData.specialObjects || [];
        this.initialize();
        this.setupCompletion();
        this.setupHover();
        this.setupDocumentValidation();
        this.documents.listen(this.connection);
        this.connection.listen();
    }
    initialize() {
        this.connection.onInitialize((params) => {
            return {
                capabilities: {
                    textDocumentSync: node_1.TextDocumentSyncKind.Incremental,
                    completionProvider: {
                        resolveProvider: true,
                        triggerCharacters: ['.', ':', '=']
                    },
                    hoverProvider: true
                }
            };
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
    getWordRangeAtPosition(document, position) {
        const text = document.getText();
        const offset = document.offsetAt(position);
        const wordRegex = /\w+:?/g;
        let match;
        while ((match = wordRegex.exec(text)) !== null) {
            const startOffset = match.index;
            const endOffset = startOffset + match[0].length;
            if (startOffset <= offset && offset <= endOffset) {
                return {
                    start: document.positionAt(startOffset),
                    end: document.positionAt(endOffset)
                };
            }
        }
        return undefined;
    }
    setupCompletion() {
        this.connection.onCompletion((params) => {
            let FilterObjProps = false;
            const document = this.documents.get(params.textDocument.uri);
            if (!document)
                return []; // Return empty array if document isn’t found
            const position = params.position; // Cursor position
            const startOfLine = { line: position.line, character: 0 };
            const cursorPosition = { line: position.line, character: position.character };
            const range = { start: startOfLine, end: cursorPosition };
            // Get the text from the start of the line to the cursor
            const linePrefix = document.getText(range);
            const items = [];
            /*Check show only properties for special objects like _M: and _CV: */
            for (const spObj of this.specialObjects) {
                const wordRegex = new RegExp(`${spObj.prefix}[^\\s]*$`, 'i');
                //if (linePrefix.endsWith(spObj.prefix)) {
                if (wordRegex.test(linePrefix)) {
                    this.AddVariables(items, spObj.prefix);
                    FilterObjProps = true;
                    break;
                }
            }
            if (!FilterObjProps) {
                this.AddFunction(items);
                this.AddVariables(items);
                this.AddKeywords(items);
                this.AddSpecialObjects(items);
                this.AddDatTypes(items);
            }
            return items;
        });
        this.connection.onCompletionResolve((item) => {
            // const variable = this.variables.find(v => v.name === item.label);
            // const Func = this.functions.find(v => v.name === item.label);
            // if (variable && item.kind === CompletionItemKind.Variable) {
            //   item.detail = `${variable.name} (${variable.type} variable)`;
            //   item.documentation = {
            //     kind: 'markdown',
            //     value: `**${variable.name}**\n\n${variable.description}\n\n- **Type**: ${variable.type}\n- **Valid Range**: ${variable.validRange}\n- **Applies To**: ${variable.appliesTo}\n- **Values**: ${variable.values}\n- **Visibility**: ${variable.visibility}`
            //   };
            // } else if (Func && item.kind === CompletionItemKind.Function) {
            //   //item.insertText = new SnippetString(Func.value); // Use the snippet syntax from your data
            //   //item.insertTextFormat = InsertTextFormat.Snippet;
            //   item.documentation = {
            //     kind: 'markdown',
            //     value: `**${Func.name}**\n\n${Func.description}`
            //   }
            // } else if (item.kind === CompletionItemKind.Keyword) {
            //   item.documentation = `Keyword: ${item.label}.`;
            // }
            return item;
        });
    }
    setupHover() {
        this.connection.onHover((params) => {
            const document = this.documents.get(params.textDocument.uri);
            if (!document)
                return undefined;
            const position = params.position;
            const wordRange = this.getWordRangeAtPosition(document, position); // Helper to get word under cursor
            if (!wordRange)
                return undefined;
            const word = document.getText(wordRange).toUpperCase();
            console.log(`Hover text "${word}"`);
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
        });
    }
    setupDocumentValidation() {
        this.documents.onDidChangeContent((change) => {
            this.validateTextDocument(change.document);
        });
        this.documents.onDidOpen((event) => {
            this.validateTextDocument(event.document);
        });
    }
    addDiagnostic(diagnostics, line, startChar, endChar, message, severity = node_1.DiagnosticSeverity.Error) {
        diagnostics.push({
            severity,
            range: { start: { line, character: startChar }, end: { line, character: endChar } },
            message,
            source: this.languageId
        });
    }
    validateTextDocument(document) {
        const diagnostics = [];
        const text = document.getText();
        const lines = text.split('\n');
        const stack = [];
        const openingKeywords = this.controlStructures.map(cs => cs.openingKeyword).join('|');
        const closingKeywords = this.controlStructures.map(cs => cs.closingKeyword).join('|');
        const openingRegex = new RegExp(`^(${openingKeywords})\\b`, 'i');
        const closingRegex = new RegExp(`^(${closingKeywords})\\b`, 'i');
        for (let i = 0; i < lines.length; i++) {
            const lineWithoutComments = lines[i].split(';')[0].trim();
            if (!lineWithoutComments)
                continue;
            const bracketCheck = this.checkBalancedBrackets(lineWithoutComments);
            if (bracketCheck !== true) {
                this.addDiagnostic(diagnostics, i, bracketCheck.position, bracketCheck.position + 1, bracketCheck.message);
            }
            const openingMatch = lineWithoutComments.match(openingRegex);
            if (openingMatch) {
                const keyword = openingMatch[1].toLowerCase();
                const structure = this.controlStructures.find(cs => cs.openingKeyword.toLowerCase() === keyword);
                stack.push({ keyword, line: i });
                if (structure.requiredSuffix) {
                    const suffixRegex = new RegExp(`${structure.requiredSuffix}\\s*$`, 'i');
                    if (!lineWithoutComments.match(suffixRegex)) {
                        this.addDiagnostic(diagnostics, i, 0, lines[i].length, `'${structure.openingKeyword}' statement must end with '${structure.requiredSuffix}'.`);
                    }
                    else {
                        const conditionMatch = lineWithoutComments.match(new RegExp(`^${structure.openingKeyword}\\s+(.+?)\\s+${structure.requiredSuffix}\\s*$`, 'i'));
                        if (!conditionMatch) {
                            this.addDiagnostic(diagnostics, i, 0, lines[i].length, `'${structure.openingKeyword}' statement must have a condition before '${structure.requiredSuffix}'.`);
                        }
                        else {
                            const condition = conditionMatch[1].trim();
                            if (!condition) {
                                this.addDiagnostic(diagnostics, i, structure.openingKeyword.length + 1, lineWithoutComments.length - structure.requiredSuffix.length - 1, `Condition in '${structure.openingKeyword}' statement cannot be empty.`);
                            }
                            else if (!this.isValidCondition(condition)) {
                                this.addDiagnostic(diagnostics, i, structure.openingKeyword.length + 1, lineWithoutComments.length - structure.requiredSuffix.length - 1, `'${condition}' is not a valid condition. Expected a variable, object.property (with optional : prefixes or inline {variable}), or a comparison (e.g., x > 5) with optional arithmetic expressions and logical operators.`);
                            }
                        }
                    }
                }
                if (structure.customValidation === 'forEachValidation') {
                    const match = lineWithoutComments.match(/^For\s+Each\s+([A-Za-z|_?][A-Za-z0-9|_?]*(?:\s*(?:\||\bOR\b)\s*[A-Za-z|_?][A-Za-z0-9|_?]*)*)\s+([A-Za-z][A-Za-z0-9]*)/i);
                    if (!match) {
                        this.addDiagnostic(diagnostics, i, 0, lines[i].length, `Invalid 'For Each' syntax. Expected: For Each <object> [| or OR <object>]* <type>`);
                    }
                    else {
                        const [, objectsStr, type] = match;
                        const typeLower = type.toLowerCase();
                        const lowerCaseForEachTypes = this.forEachTypes.map(t => t.toLowerCase());
                        if (!lowerCaseForEachTypes.includes(typeLower)) {
                            this.addDiagnostic(diagnostics, i, lineWithoutComments.indexOf(type), lineWithoutComments.indexOf(type) + type.length, `'${type}' is not a valid For Each type. Expected one of: ${this.forEachTypes.join(', ')}`);
                        }
                    }
                }
            }
            else if (lineWithoutComments.match(/^[A-Za-z_:][A-Za-z0-9_:]*\s*(?:=|\:=|=[\+\-\*\/]=)/i)) {
                const assignmentMatch = lineWithoutComments.match(/^(.+?)\s*$/i);
                if (assignmentMatch) {
                    const assignment = assignmentMatch[1].trim();
                    if (!this.isValidCondition(assignment)) {
                        this.addDiagnostic(diagnostics, i, 0, lines[i].length, `'${assignment}' is not a valid assignment or expression.`);
                    }
                }
            }
            else if (closingRegex.test(lineWithoutComments)) {
                const closingMatch = lineWithoutComments.match(closingRegex);
                const closingKeyword = closingMatch[1].toLowerCase();
                const structure = this.controlStructures.find(cs => cs.closingKeyword.toLowerCase() === closingKeyword);
                if (!stack.length) {
                    this.addDiagnostic(diagnostics, i, 0, lines[i].length, `'${structure.closingKeyword}' without matching opening statement.`);
                }
                else {
                    const last = stack.pop();
                    if (structure.openingKeyword.toLowerCase() !== last.keyword) {
                        this.addDiagnostic(diagnostics, i, 0, lines[i].length, `'${structure.closingKeyword}' does not match the last opening statement '${last.keyword}'.`);
                    }
                }
            }
            else if (lineWithoutComments.match(/^Else\s*$/i)) {
                const ifStructure = this.controlStructures.find(cs => cs.supportsElse && cs.openingKeyword.toLowerCase() === 'if');
                if (!ifStructure || !stack.length || stack[stack.length - 1].keyword !== 'if') {
                    this.addDiagnostic(diagnostics, i, 0, lines[i].length, `'Else' without a preceding 'If' statement.`);
                }
            }
        }
        stack.forEach(unclosed => {
            const structure = this.controlStructures.find(cs => cs.openingKeyword.toLowerCase() === unclosed.keyword);
            if (structure && structure.closingKeyword !== 'End For') {
                this.addDiagnostic(diagnostics, unclosed.line, 0, lines[unclosed.line].length, `'${structure.openingKeyword}' statement is not closed. Expected '${structure.closingKeyword}'.`);
            }
        });
        const normalizedUri = decodeURIComponent(document.uri);
        this.connection.sendDiagnostics({ uri: normalizedUri, diagnostics });
    }
    isValidCondition(condition) {
        const bracketCheck = this.checkBalancedBrackets(condition);
        if (bracketCheck !== true) {
            return false;
        }
        try {
            const identifier = '[\\+\\-*/%!]?\\s*[A-Za-z_:{}@][A-Za-z0-9_{}@\\.]*(@|\\d+)*';
            const number = '-?\\d+\\.?\\d*(mm|in)?';
            const stringLiteral = `'(?:[^']*)'|"[^"]*"`;
            const booleanOrNull = 'True|False|null';
            const inlineVarSegment = `${identifier}(?:\\{${identifier}\\}${identifier})*`;
            const specialObjectPatterns = this.specialObjects.map(obj => {
                const basePattern = `${obj.prefix.replace(/:/g, '\\:')}${obj.propertyPattern}`;
                return obj.allowsSubProperties ? `${basePattern}(?:\\:${identifier})*` : basePattern;
            }).join('|');
            const propertySegment = `(?:${identifier}|${inlineVarSegment})`;
            const propertyPattern = `(?:${specialObjectPatterns})|(?::+${identifier}|${propertySegment})(?:\\.(${specialObjectPatterns}|${propertySegment}))*`;
            const arithmeticOperand = `(?:${propertyPattern}|${number}|${stringLiteral}|${booleanOrNull})(?:\\s*[\\+\\-*/%]\\s*(?:${propertyPattern}|${number}))*`;
            const comparisonOperators = '=|<|>|<=|>=|!=|==';
            const assignmentOperators = '=|\\:=|=\\s*[\\+\\-*\\/]=';
            const logicalOperators = '\\bAnd\\b|\\bOr\\b|&|\\|';
            const singleComparison = `${arithmeticOperand}\\s*(?:${comparisonOperators})\\s*${arithmeticOperand}`;
            const singleAssignment = `${propertyPattern}\\s*(?:${assignmentOperators})\\s*${arithmeticOperand}`;
            const comparisonPattern = `^\\s*(?:${singleComparison}|${singleAssignment}|${arithmeticOperand})\\s*$`;
            let strippedCondition = condition;
            this.functions.forEach(Func => {
                const functionRegex = new RegExp(`\\b${Func.name}\\s*\\(+`, 'gi');
                strippedCondition = strippedCondition.replace(functionRegex, match => {
                    const innerContent = match.slice(match.indexOf('(') + 1, match.lastIndexOf(')')).trim();
                    return innerContent || '';
                });
            });
            strippedCondition = strippedCondition.replace(/[()]/g, '').trim();
            if (!strippedCondition)
                return false;
            const logicalOperatorSplit = /\s*(\bAnd\b|\bOr\b|&|\|)\s*/i;
            const parts = strippedCondition.split(logicalOperatorSplit);
            if (parts.length === 0)
                return false;
            let expectComparison = true;
            for (let i = 0; i < parts.length; i++) {
                const part = parts[i].trim();
                if (!part)
                    continue;
                if (expectComparison) {
                    if (!new RegExp(comparisonPattern, 'i').test(part)) {
                        console.log(`Invalid comparison chunk: "${part}"`);
                        return false;
                    }
                    expectComparison = false;
                }
                else {
                    if (!/^\bAnd\b|\bOr\b|&|\|$/i.test(part)) {
                        console.log(`Expected logical operator, got: "${part}"`);
                        return false;
                    }
                    expectComparison = true;
                }
            }
            if (expectComparison) {
                console.log("Condition ends with a logical operator, incomplete");
                return false;
            }
            console.log(`Condition "${condition}" is valid (stripped: "${strippedCondition}")`);
            return true;
        }
        catch (error) {
            console.error("Error in isValidCondition:", error);
            return false;
        }
    }
    checkBalancedBrackets(condition) {
        let openCount = 0;
        for (let i = 0; i < condition.length; i++) {
            if (condition[i] === '(') {
                openCount++;
            }
            else if (condition[i] === ')') {
                if (openCount === 0) {
                    return { message: `Unmatched closing parenthesis ')' in condition.`, position: i };
                }
                openCount--;
            }
        }
        if (openCount > 0) {
            let unmatchedPos = -1;
            let count = openCount;
            for (let i = condition.length - 1; i >= 0 && count > 0; i--) {
                if (condition[i] === '(') {
                    count--;
                    if (count === 0)
                        unmatchedPos = i;
                }
            }
            return { message: `Unmatched opening parenthesis '(' in condition.`, position: unmatchedPos };
        }
        return true;
    }
}
console.log("🌍 Language server is starting...");
// const ucsmLangServer = new LanguageServer({
//   languageId: 'ucsm',
//   systemJsonPath: path.join(__dirname, '../../Languages/data/system.json'),
//   syntaxJsonPath: path.join(__dirname, '../../Languages/ucsm/data/ucsm_syntax.json'),
//   controlStructuresJsonPath: path.join(__dirname, '../../Languages/ucsm/data/control_structures.json'),
//   specialObjectsJsonPath: path.join(__dirname, '../../Languages/ucsm/data/special_objects.json')
// });
// const ucsjsLangServer = new LanguageServer({
//   languageId: 'javascript',
//   systemJsonPath: path.join(__dirname, '../../Languages/data/system.json'),
//   syntaxJsonPath: path.join(__dirname, '../../Languages/ucsm/data/ucsm_syntax.json'),
//   controlStructuresJsonPath: path.join(__dirname, '../../Languages/ucsm/data/control_structures.json'),
//   specialObjectsJsonPath: path.join(__dirname, '../../Languages/ucsm/data/special_objects.json')
// });
const languageId = process.argv[2]; // Get language ID from command-line argument
if (!languageId) {
    console.error("No language ID provided. Usage: node server.js <languageId>");
    process.exit(1);
}
const configs = {
    ucsm: {
        languageId: 'ucsm',
        systemJsonPath: path.join(__dirname, '../../Languages/data/system.json'),
        syntaxJsonPath: path.join(__dirname, '../../Languages/ucsm/data/ucsm_syntax.json'),
        controlStructuresJsonPath: path.join(__dirname, '../../Languages/ucsm/data/control_structures.json'),
        specialObjectsJsonPath: path.join(__dirname, '../../Languages/ucsm/data/special_objects.json'),
    },
    javascript: {
        languageId: 'javascript',
        systemJsonPath: path.join(__dirname, '../../Languages/data/system.json'),
        syntaxJsonPath: path.join(__dirname, '../../Languages/ucsm/data/ucsm_syntax.json'),
        controlStructuresJsonPath: path.join(__dirname, '../../Languages/ucsm/data/control_structures.json'),
        specialObjectsJsonPath: path.join(__dirname, '../../Languages/ucsm/data/special_objects.json'),
    },
};
const config = configs[languageId];
if (!config) {
    console.error(`Unsupported language ID: ${languageId}`);
    process.exit(1);
}
new LanguageServer(config);
//# sourceMappingURL=server.js.map