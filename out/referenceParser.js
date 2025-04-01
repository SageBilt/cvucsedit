"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.referenceParser = void 0;
const parser_1 = require("@babel/parser");
//import { traverse } from "@babel/traverse";
const traverse = require('@babel/traverse').default;
//import {  } from 'vscode';
const node_1 = require("vscode-languageserver/node");
class referenceParser {
    docReferences = [];
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
        const existKey = this.docReferences.find(docRef => docRef.name == className);
        if (!existKey)
            this.docReferences.push({ name: className, uri: docURI, classElements: symbolsMap, isEnabled: enabled, elementReferences: [], classReferences: [] });
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
    updateClassReferences(docName, docURI, fullDocText) {
        const className = '_' + docName;
        const ast = this.parseDocument(fullDocText);
        if (!ast)
            return;
        this.cleanExistingReferences(docURI);
        this.extractCallExpressions(docURI, ast);
    }
    cleanExistingReferences(docURI) {
        this.docReferences.forEach((classRef) => {
            classRef.classReferences = classRef.classReferences.filter(ref => ref.uri != docURI);
            classRef.elementReferences = classRef.elementReferences.filter(ref => ref.uri != docURI);
        });
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
                    const classRef = this.docReferences.find(docRef => docRef.name == objectName);
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
}
exports.referenceParser = referenceParser;
//# sourceMappingURL=referenceParser.js.map