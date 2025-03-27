"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.referenceParser = void 0;
const parser_1 = require("@babel/parser");
//import { traverse } from "@babel/traverse";
const traverse = require('@babel/traverse').default;
//import { Position,  } from 'vscode';
const node_1 = require("vscode-languageserver/node");
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
    extractClassesAndMethods(ast) {
        //const symbols = new Map(); // Store class names and their methods
        const methods = [];
        traverse(ast, {
            ClassDeclaration({ node }) {
                const className = '_' + node.id?.name;
                // Extract methods from the class body
                for (const bodyNode of node.body.body) {
                    //ClassProperty
                    if (bodyNode.type === 'ClassMethod') {
                        const classMeth = bodyNode;
                        const key = classMeth.key;
                        const startPos = node_1.Position.create(classMeth.loc?.start.line || 0, classMeth.loc?.start.index || 0);
                        const endPos = node_1.Position.create(classMeth.loc?.end.line || 0, classMeth.loc?.end.index || 0);
                        methods.push({
                            name: key.name,
                            compKind: node_1.CompletionItemKind.Method,
                            params: classMeth.params,
                            type: bodyNode.type,
                            range: node_1.Range.create(startPos, endPos)
                        });
                    }
                }
                //symbols.set(className, methods);
            },
        });
        return methods;
    }
}
exports.referenceParser = referenceParser;
//# sourceMappingURL=referenceParser.js.map