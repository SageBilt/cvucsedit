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
exports.referenceParser = void 0;
const parser_1 = require("@babel/parser");
//import { traverse } from "@babel/traverse";
const traverse = require('@babel/traverse').default;
const fs = __importStar(require("fs"));
const CONSTANTS = __importStar(require("./constants"));
const node_1 = require("vscode-languageserver/node");
class referenceParser {
    classReferences = [];
    CVAsmManagedReferences = [];
    ucsjsObjects = [];
    ucsjsMethods = [];
    constructor() {
        const ucsjsSystemData = JSON.parse(fs.readFileSync(CONSTANTS.UCSJSSYSTEMJSONPATH, 'utf8'));
        this.ucsjsObjects = ucsjsSystemData.objects;
        this.ucsjsMethods = ucsjsSystemData.methods;
    }
    passParams(params) {
        const Result = [];
        let paramTyped;
        params.forEach((param) => {
            //const paramType = identifyParameterType(param);
            // Process based on type
            switch (param.type) {
                case "Identifier":
                    paramTyped = param;
                    Result.push({ name: paramTyped.name, optional: paramTyped.optional });
                    break;
                // case "Pattern":
                //     paramTyped = param.name as Pattern;
                //     Result.push({name:paramTyped.,optional:paramTyped.optional});
                // break;
                case "RestElement":
                    paramTyped = param;
                    Result.push({ name: paramTyped.argument.type, optional: paramTyped.optional });
                    break;
                // case "TSParameterProperty":
                // break;
                default:
            }
        });
        return Result;
    }
    parseDocument(fullDocText) {
        //const text = document.getText();
        try {
            const ast = (0, parser_1.parse)(fullDocText, {
                sourceType: 'script', // Supports ES6 modules
                plugins: ['classProperties', 'jsx'], // Add plugins for specific JS features
                errorRecovery: true, // Continue parsing despite errors
            });
            return ast;
        }
        catch (error) {
            console.log(`Error parsing document with error ${error}`);
        }
    }
    getRange(loc) {
        const startPos = loc ? node_1.Position.create(loc.start.line - 1, loc.start.column) : node_1.Position.create(0, 0);
        const endPos = loc ? node_1.Position.create(loc.end.line - 1, loc.end.column) : node_1.Position.create(0, 0);
        return node_1.Range.create(startPos, endPos);
    }
    updateClasses(className, docURI, fullDocText, enabled) {
        //const className = '_' + docName;
        const ast = this.parseDocument(fullDocText);
        if (!ast)
            return;
        const symbolsMap = this.extractClassesAndMethods(ast);
        const existKey = this.classReferences.find(docRef => docRef.name == className);
        if (!existKey)
            this.classReferences.push({ name: className, uri: docURI, classElements: symbolsMap, isEnabled: enabled, elementReferences: [], classReferences: [] });
        else
            existKey.classElements = symbolsMap;
    }
    extractClassesAndMethods(ast) {
        const classElems = [];
        traverse(ast, {
            ClassDeclaration: ({ node }) => {
                const className = '_' + node.id?.name;
                // Extract methods from the class body
                for (const bodyNode of node.body.body) {
                    if (bodyNode.type == 'ClassMethod') {
                        const classMethod = bodyNode;
                        const key = classMethod.key;
                        const startPos = key.loc ? node_1.Position.create(key.loc.start.line - 1, key.loc.start.column) : node_1.Position.create(0, 0);
                        const endPos = key.loc ? node_1.Position.create(key.loc.end.line - 1, key.loc.end.column) : node_1.Position.create(0, 0);
                        const params = this.passParams(classMethod.params);
                        const element = {
                            name: key.name,
                            compKind: node_1.CompletionItemKind.Method,
                            params: params,
                            type: bodyNode.type,
                            range: node_1.Range.create(startPos, endPos)
                        };
                        classElems.push(element);
                    }
                    if (bodyNode.type == 'ClassProperty') {
                        const classProp = bodyNode;
                        const key = classProp.key;
                        const startPos = key.loc ? node_1.Position.create(key.loc.start.line - 1, key.loc.start.column) : node_1.Position.create(0, 0);
                        const endPos = key.loc ? node_1.Position.create(key.loc.end.line - 1, key.loc.end.column) : node_1.Position.create(0, 0);
                        const element = {
                            name: key.name,
                            compKind: node_1.CompletionItemKind.Method,
                            type: bodyNode.type,
                            range: node_1.Range.create(startPos, endPos)
                        };
                        classElems.push(element);
                    }
                }
            },
        });
        return classElems;
    }
    updateReferences(docName, docURI, fullDocText) {
        const className = '_' + docName;
        const ast = this.parseDocument(fullDocText);
        if (!ast)
            return;
        this.cleanExistingReferences(docURI);
        this.extractCallExpressions(docURI, ast);
        this.extractVariableAssignments(docURI, ast);
    }
    cleanExistingReferences(docURI) {
        this.classReferences.forEach((classRef) => {
            classRef.classReferences = classRef.classReferences.filter(ref => ref.uri != docURI);
            classRef.elementReferences = classRef.elementReferences.filter(ref => ref.uri != docURI);
        });
        this.CVAsmManagedReferences = this.CVAsmManagedReferences.filter(ref => ref.uri != docURI);
    }
    extractCallExpressions(docURI, ast) {
        traverse(ast, {
            CallExpression: ({ node }) => {
                if (node.callee.type === 'MemberExpression') {
                    const memberExpr = node.callee;
                    const objectName = memberExpr.object?.name || 'unknown';
                    const propertyName = memberExpr.property?.name;
                    const startPos = node.loc ? node_1.Position.create(node.loc.start.line - 1, node.loc.start.column) : node_1.Position.create(0, 0);
                    const endPos = node.loc ? node_1.Position.create(node.loc.end.line - 1, node.loc.end.column) : node_1.Position.create(0, 0);
                    const classRef = this.classReferences.find(docRef => docRef.name == objectName);
                    if (classRef) {
                        classRef.classReferences.push({
                            elementName: objectName,
                            uri: docURI,
                            range: this.getRange(memberExpr.object.loc)
                        });
                        const classElem = classRef.classElements.find(elem => elem.name == propertyName);
                        if (classElem) {
                            classRef.elementReferences.push({
                                elementName: propertyName,
                                uri: docURI,
                                range: this.getRange(memberExpr.property.loc)
                            });
                        }
                    }
                }
            }
        });
    }
    extractVariableAssignments(docURI, ast) {
        traverse(ast, {
            VariableDeclaration: ({ node }) => {
                node.declarations.forEach((declarator) => {
                    //declarator.id.name - this is the variable name
                    //
                    const init = declarator.init;
                    if (init.type === 'Identifier') {
                        this.ucsjsObjects.forEach(obj => {
                            if (obj == init.name) {
                                const variableName = declarator.id.name;
                                this.CVAsmManagedReferences.push({
                                    variableName,
                                    objectName: obj,
                                    uri: docURI,
                                    range: this.getRange(declarator.loc),
                                });
                            }
                        });
                    }
                    if (init.type === 'CallExpression') {
                        const variableName = declarator.id.name;
                        const callee = init.callee;
                        const calleeObj = callee.object;
                        const calleeProp = callee.property;
                        const varRef = this.CVAsmManagedReferences.find(varRef => varRef.variableName == calleeObj?.name
                            && varRef.variableName != variableName);
                        //callee.object.name should be _this
                        //callee.property.name should be the method name
                        this.ucsjsMethods.forEach(meth => {
                            if (meth.name == calleeProp?.name && meth.parentObject.includes(calleeObj?.name) || varRef) {
                                if (meth.returnType.includes('CVAsmManaged')) {
                                    this.CVAsmManagedReferences.push({
                                        variableName,
                                        objectName: varRef ? varRef.objectName : calleeObj.name,
                                        uri: docURI,
                                        range: this.getRange(declarator.loc),
                                    });
                                }
                            }
                        });
                        // this.CVAsmManagedReferences.forEach(varRef => {
                        //     const variableName = (declarator.id as Identifier).name;
                        //     if (varRef.objectName == calleeObj?.name && varRef.variableName != variableName) {
                        //         this.CVAsmManagedReferences.push({
                        //             variableName,
                        //             objectName: calleeObj.name,
                        //             uri: docURI,
                        //             range: this.getRange(declarator.loc),
                        //         });
                        //     }
                        // });
                    }
                });
            },
        });
    }
}
exports.referenceParser = referenceParser;
//# sourceMappingURL=referenceParser.js.map