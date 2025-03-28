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
const ucsmCompletion_1 = require("./ucsmCompletion");
const ucsjsCompletion_1 = require("./ucsjsCompletion");
const ucsmValidation_1 = require("./ucsmValidation");
const CONSTANTS = __importStar(require(".././constants"));
class LanguageServer {
    connection;
    documents;
    languageId;
    ucsmComp;
    ucsjsComp;
    ucsmValid;
    constructor(config) {
        this.connection = (0, node_1.createConnection)(node_1.ProposedFeatures.all);
        this.connection.console.log("Starting language server...");
        this.documents = new node_1.TextDocuments(vscode_languageserver_textdocument_1.TextDocument);
        this.languageId = config.languageId;
        this.ucsmComp = new ucsmCompletion_1.ucsmCompletion(this.languageId, this.connection);
        this.ucsjsComp = new ucsjsCompletion_1.ucsjsCompletion(this.languageId, this.connection);
        this.ucsmValid = new ucsmValidation_1.ucsmValidation(this.languageId, this.connection);
        this.initialize();
        this.setupCompletion();
        this.setupHover();
        this.setDefinitionProvider();
        this.setupDocumentValidation();
        this.setupClientNotification();
        this.documents.listen(this.connection);
        this.connection.listen();
    }
    initialize() {
        this.connection.onInitialize((params) => {
            const dynamicData = params.initializationOptions || {};
            this.ucsmComp.dynamicData = dynamicData;
            this.ucsjsComp.dynamicData = dynamicData;
            this.ucsmValid.dynamicData = dynamicData;
            console.log(`partDefs.length ${dynamicData.partDefs.length}`);
            return {
                capabilities: {
                    textDocumentSync: node_1.TextDocumentSyncKind.Incremental,
                    completionProvider: {
                        //resolveProvider: true
                        triggerCharacters: ['.', ':', '=']
                    },
                    hoverProvider: true,
                    definitionProvider: true
                }
            };
        });
    }
    getMethodParamType(methods, linePrefix, fullLine, cursorPosition) {
        const lineParamCount = this.ucsmValid.getParamCount(fullLine);
        //this.connection.console.log(`paramCount "${lineParamCount}"`);
        // Iterate through all UCSMSyntaxMethods to find a match
        for (const methodDef of methods) {
            const methodName = methodDef.name;
            const methodRegex = new RegExp(`\\b${methodName}\\s*\\(([^)^\\.]*)$`);
            const match = linePrefix.match(methodRegex);
            //this.connection.console.log(`fullLine "${fullLine}"`);
            if (!match)
                continue; // Skip if this method doesn’t match
            const methodParamCount = this.ucsmValid.getParamCount(methodDef.value);
            if (methodParamCount != lineParamCount)
                continue; // Skip if this method if different number of parameters
            //this.connection.console.log(match[1]);
            const argsSoFar = match[1]; // Content inside parentheses up to cursor
            const methodStart = linePrefix.lastIndexOf(match[0]); // Start of method call
            const argsStart = methodStart + methodName.length + 1; // Position after '('
            // Split arguments by comma, handling strings and nested content
            let paramIndex = 0;
            let currentPos = argsStart;
            let inString = false;
            let quoteChar = '';
            let paramCount = 0;
            for (let i = 0; i < argsSoFar.length; i++) {
                const char = argsSoFar[i];
                const absolutePos = argsStart + i;
                if (inString) {
                    //this.connection.console.log('{'+char+'}');
                    if (char === quoteChar && argsSoFar[i - 1] !== '\\') {
                        inString = false; // End of string
                    }
                }
                else {
                    if (char === '"' || char === "'") {
                        inString = true;
                        quoteChar = char;
                    }
                    else if (char === ',' && absolutePos < cursorPosition.character) {
                        //this.connection.console.log(`argsSoFar "${argsSoFar[i - 1]}"`);
                        paramCount++; // Move to next parameter
                    }
                }
                //this.connection.console.log(`Remaining "${linePrefix.substring(absolutePos)}" absolutePos "${absolutePos}" character "${cursorPosition.character}"`);
                if (absolutePos === cursorPosition.character - 1) {
                    paramIndex = paramCount;
                    break;
                }
            }
            // Check if cursor is within the method call and parameters are still open
            const isInside = paramIndex >= 0 && cursorPosition.character > argsStart && !argsSoFar.match(/\)$/);
            //this.connection.console.log(`isInside "${isInside}" paramIndex "${paramIndex}" argsStart "${argsStart}"`);
            if (isInside) {
                // Determine the DataType based on paramIndex
                const dataType = paramIndex < methodDef.parameterDef.length
                    ? methodDef.parameterDef[paramIndex].DataType
                    : undefined;
                return dataType;
            }
        }
    }
    getCursorPosition(position) {
        return { line: position.line, character: position.character };
    }
    getLineTextToCursor(document, position, cursorPosition) {
        const startOfLine = { line: position.line, character: 0 };
        const rangeToCursor = { start: startOfLine, end: cursorPosition };
        const endPostion = { line: position.line, character: Number.MAX_SAFE_INTEGER };
        const rangeToEnd = { start: startOfLine, end: endPostion };
        const linePrefix = document.getText(rangeToCursor);
        const fullLine = document.getText(rangeToEnd);
        return [linePrefix, fullLine];
    }
    setupCompletion() {
        this.connection.onCompletion((params) => {
            let items = [];
            const document = this.documents.get(params.textDocument.uri);
            if (!document)
                return []; // Return empty array if document isn’t found
            const position = params.position; // Cursor position
            const cursorPosition = this.getCursorPosition(position);
            // const startOfLine: Position = { line: position.line, character: 0 };
            // const rangeToCursor: Range = { start: startOfLine, end: cursorPosition };
            // const endPostion: Position = { line: position.line, character: Number.MAX_SAFE_INTEGER };
            // const rangeToEnd: Range = { start: startOfLine, end: endPostion };
            // // Get the text from the start of the line to the cursor
            // const linePrefix = document.getText(rangeToCursor);
            // const fullLine = document.getText(rangeToEnd);
            const [linePrefix, fullLine] = this.getLineTextToCursor(document, position, cursorPosition);
            let FilterObjProps = false;
            const showDataType = this.languageId == 'javascript'
                ? this.getMethodParamType(this.ucsjsComp.ucsjsMethods, linePrefix, fullLine, cursorPosition)
                : 'all';
            if (showDataType) {
                this.connection.console.log(`method parameter data type "${showDataType}"`);
                if (showDataType == 'ucsmSyntax' || this.languageId == 'ucsm') {
                    /*Check show only properties for special objects like _M: and _CV: */
                    for (const spObj of this.ucsmComp.specialObjects) {
                        const wordRegex = new RegExp(`${spObj.prefix}[^\\s]*$`, 'i');
                        //if (linePrefix.endsWith(spObj.prefix)) {
                        if (wordRegex.test(linePrefix)) {
                            this.ucsmComp.AddVariables(items, spObj.prefix);
                            if (spObj.prefix == '_M:')
                                this.ucsmComp.AddMaterialParams(items);
                            if (spObj.prefix == '_CS:')
                                this.ucsmComp.AddConstructionParams(items);
                            if (spObj.prefix == '_MS:')
                                this.ucsmComp.AddScheduleParams(items);
                            FilterObjProps = true;
                            break;
                        }
                    }
                    if (!FilterObjProps) {
                        this.ucsmComp.AddFunction(items);
                        this.ucsmComp.AddVariables(items);
                        if (this.languageId == 'ucsm') {
                            this.ucsmComp.AddKeywords(items); //Only add keywords in ucsm
                        }
                        this, this.ucsmComp.AddPartDefs(items);
                        this.ucsmComp.AddSpecialObjects(items);
                        this.ucsmComp.AddDatTypes(items);
                        this.ucsmComp.Addsymbols(items);
                        this.ucsmComp.AddObjectClass(items);
                        this.ucsmComp.AddObjectType(items);
                    }
                }
                else {
                    const split = showDataType.split('.');
                    if (split.length == 2) {
                        if (split[0] == 'constants') { //For example 'constants.parameterTypes'
                            const key = split[1];
                            this.ucsjsComp.AddConstants(items, this.ucsjsComp.ucsjsConstants[key], split[1]);
                        }
                    }
                    else {
                        //this.connection.console.log(`Javascript method parameter data type "${showDataType}"`);
                        if (showDataType == 'any')
                            this.ucsjsComp.AddObjects(items);
                        //else if (showDataType == 'string')
                        //  this.ucsjsComp.AddAllConstants(items); 
                    }
                }
            }
            else if (this.languageId == 'javascript') {
                if (this.ucsjsComp.isObject(items, linePrefix))
                    return items;
                if (this.ucsjsComp.isLibraryClassInstances(items, linePrefix))
                    return items;
                this.ucsjsComp.AddMethods(items);
                this.ucsjsComp.AddAllConstants(items);
                this.ucsjsComp.AddObjects(items);
                this.ucsjsComp.AddFunctions(items);
                this.ucsjsComp.AddLibraryClassInstances(items);
            }
            return items;
        });
        // this.connection.onCompletionResolve((item) => {
        //   return item;
        // });
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
            const cursorPosition = this.getCursorPosition(position);
            const [linePrefix, fullLine] = this.getLineTextToCursor(document, position, cursorPosition);
            const showDataType = this.languageId == 'javascript'
                ? this.getMethodParamType(this.ucsjsComp.ucsjsMethods, linePrefix, fullLine, cursorPosition)
                : 'all';
            if (showDataType) {
                this.connection.console.log(`Hover parameter "${word}" -> data type "${showDataType}"`);
                if (showDataType == 'ucsmSyntax' || this.languageId == 'ucsm') {
                    const ucsmhover = this.ucsmComp.getHoverWord(word, wordRange);
                    if (ucsmhover)
                        return ucsmhover;
                }
            }
            else
                return this.ucsjsComp.getHoverWord(word, wordRange);
        });
    }
    findSymbolAtPosition(doc, pos) {
        const line = doc.getText({ start: { line: pos.line, character: 0 }, end: { line: pos.line + 1, character: 0 } });
        const offset = doc.offsetAt(pos);
        //const wordRegex = /^\s*(?<![If|While]\s+)[A-Za-z_{}:][A-Za-z0-9_{}@\\.:]*?(?:<(crncy|meas|deg|int|bool|dec|text|style|desc)?>)?\s*:?=\s*/i;
        const wordRegex = /\w+/g;
        let match;
        //console.log(`Line "${line}" character "${pos.character}"`);
        while ((match = wordRegex.exec(line)) !== null) {
            if (match.index <= pos.character && pos.character <= match.index + match[0].length) {
                return match[0];
            }
        }
        return null;
    }
    setDefinitionProvider() {
        this.connection.onDefinition((params) => {
            const uri = params.textDocument.uri;
            const position = params.position;
            // Get the document text (assumes you’re tracking open documents)
            const document = this.documents.get(uri);
            if (!document)
                return null;
            // Identify the symbol at the position
            const symbol = this.findSymbolAtPosition(document, position);
            if (!symbol)
                return null;
            // Look up its definition in your symbol table or AST
            //console.log(`symbol "${symbol}"`);
            const definition = this.ucsmComp.getDefinition(symbol, uri);
            if (!definition)
                return null;
            // console.log(`uri "${definition.uri}" uri "${params.textDocument.uri}"`);
            // console.log(`StartLine "${definition.range.start.line}" StartChar "${definition.range.start.character}"`); 
            // console.log(`EndLine "${definition.range.end.line}" EndChar "${definition.range.end.character}"`);  
            //Return the location
            return {
                uri: definition.uri,
                range: definition.range
            };
            return null;
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
    validateTextDocument(document) {
        let diagnostics = [];
        const text = document.getText();
        if (this.languageId == 'javascript')
            diagnostics = this.ucsmValid.validateUCSJS(text, this.languageId);
        else {
            this.ucsmComp.updateSymbolTable(document);
            diagnostics = this.ucsmValid.validateUCSM(text, this.languageId);
        }
        //console.log(diagnostics);
        const normalizedUri = decodeURIComponent(document.uri);
        this.connection.sendDiagnostics({ uri: normalizedUri, diagnostics });
    }
    setupClientNotification() {
        this.connection.onNotification('updateJSLibraryReferences', (params) => {
            this.ucsjsComp.classLibraries = params;
            console.log(`Received data updated references for libraries`);
        });
    }
}
//console.log("🌍 Language server is starting...");
const languageId = process.argv[2]; // Get language ID from command-line argument
if (!languageId) {
    console.error("No language ID provided. Usage: node server.js <languageId>");
    process.exit(1);
}
const configs = {
    ucsm: {
        languageId: 'ucsm',
        systemJsonPath: CONSTANTS.UCSMSYSTEMJSONPATH,
        syntaxJsonPath: CONSTANTS.UCSMSYNTAXJSONPATH,
        controlStructuresJsonPath: CONSTANTS.UCSMCONTROLSTRUCTURESJSONPATH,
    },
    javascript: {
        languageId: 'javascript',
        systemJsonPath: CONSTANTS.UCSMSYSTEMJSONPATH,
        syntaxJsonPath: CONSTANTS.UCSMSYNTAXJSONPATH,
        controlStructuresJsonPath: CONSTANTS.UCSMCONTROLSTRUCTURESJSONPATH,
    },
};
const config = configs[languageId];
if (!config) {
    console.error(`Unsupported language ID: ${languageId}`);
    process.exit(1);
}
new LanguageServer(config);
//# sourceMappingURL=server.js.map