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
//import { Position,  } from 'vscode';
const node_1 = require("vscode-languageserver/node");
const ts = __importStar(require("typescript"));
function identifyParameterType(param) {
    // Check for Identifier (e.g., `x`)
    if (ts.isIdentifier(param.name)) {
        return "Identifier";
    }
    // Check for Pattern (e.g., `{ a, b }` or `[x, y]`)
    if (ts.isObjectBindingPattern(param.name) ||
        ts.isArrayBindingPattern(param.name)) {
        return "Pattern";
    }
    // Check for RestElement (e.g., `...args`)
    if (param.dotDotDotToken) {
        return "RestElement";
    }
    // Check for TSParameterProperty (e.g., `public x` in a class constructor)
    if (ts.isParameterPropertyDeclaration(param, param.parent)) {
        return "TSParameterProperty";
    }
    return "Unknown";
}
function passParams(params) {
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
class referenceParser {
    docReferences = [];
    updateDocRefs(docName, docURI, fullDocText) {
        const className = '_' + docName;
        const ast = this.parseDocument(fullDocText);
        if (!ast)
            return;
        const symbolsMap = this.extractClassesAndMethods(ast);
        const existKey = this.docReferences.find(docRef => docRef.name == className);
        if (!existKey)
            this.docReferences.push({ name: className, uri: docURI, classElements: symbolsMap });
        else
            existKey.classElements = symbolsMap;
    }
    parseDocument(fullDocText) {
        //const text = document.getText();
        try {
            const ast = (0, parser_1.parse)(fullDocText, {
                sourceType: 'unambiguous', // Supports ES6 modules
                plugins: ['classProperties', 'jsx'], // Add plugins for specific JS features
            });
            return ast;
        }
        catch (error) {
            console.log(`Error parsing document with error ${error}`);
        }
    }
    // private passParams(params: Array<any>) : ElementParam[] {
    //     const Result: ElementParam[] = [];
    //     let paramTyped;
    //     params.forEach((param) => {
    //         const paramType = this.identifyParameterType(param);
    //         // Process based on type
    //         switch (paramType) {
    //             case "Identifier":
    //                 paramTyped = param.name as Identifier;
    //                 Result.push({name:paramTyped.name,optional:paramTyped.optional});
    //             break;
    //             // case "Pattern":
    //             //     paramTyped = param.name as Pattern;
    //             //     Result.push({name:paramTyped.,optional:paramTyped.optional});
    //             // break;
    //             case "RestElement":
    //                 paramTyped = param.name as RestElement;
    //                 Result.push({name:paramTyped.argument.type,optional:paramTyped.optional});
    //             break;
    //             // case "TSParameterProperty":
    //             // break;
    //             default:
    //         }
    //     });
    //     return Result;
    // }
    extractClassesAndMethods(ast) {
        //const symbols = new Map(); // Store class names and their methods
        const elements = [];
        traverse(ast, {
            ClassDeclaration({ node }) {
                const className = '_' + node.id?.name;
                // Extract methods from the class body
                for (const bodyNode of node.body.body) {
                    if (bodyNode.type == 'ClassMethod') {
                        const classMethod = bodyNode;
                        const key = classMethod.key;
                        const startPos = node_1.Position.create(classMethod.loc?.start.line || 0, classMethod.loc?.start.index || 0);
                        const endPos = node_1.Position.create(classMethod.loc?.end.line || 0, classMethod.loc?.end.index || 0);
                        const params = passParams(classMethod.params);
                        const element = {
                            name: key.name,
                            compKind: node_1.CompletionItemKind.Method,
                            params: params,
                            type: bodyNode.type,
                            range: node_1.Range.create(startPos, endPos)
                        };
                        elements.push(element);
                    }
                    if (bodyNode.type == 'ClassProperty') {
                        const classProp = bodyNode;
                        const key = classProp.key;
                        const startPos = node_1.Position.create(classProp.loc?.start.line || 0, classProp.loc?.start.index || 0);
                        const endPos = node_1.Position.create(classProp.loc?.end.line || 0, classProp.loc?.end.index || 0);
                        const element = {
                            name: key.name,
                            compKind: node_1.CompletionItemKind.Method,
                            type: bodyNode.type,
                            range: node_1.Range.create(startPos, endPos)
                        };
                        elements.push(element);
                    }
                }
                //symbols.set(className, methods);
            },
        });
        return elements;
    }
}
exports.referenceParser = referenceParser;
//# sourceMappingURL=referenceParser.js.map