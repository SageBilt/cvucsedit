import { parse, ParseResult } from "@babel/parser";
//import { traverse } from "@babel/traverse";
const traverse = require('@babel/traverse').default;
import { ClassDeclaration as BabelClassDeclaration, ClassMethod, ClassProperty, Identifier, Pattern, RestElement } from '@babel/types';
import { docClassRef, classElement, ElementParam } from './interfaces';
//import { Position,  } from 'vscode';
import { Range, Position, CompletionItemKind } from 'vscode-languageserver/node';
import * as ts from "typescript";


// Define a union type for the return value
type ParameterType =
  | "Identifier"
  | "Pattern"
  | "RestElement"
  | "TSParameterProperty"
  | "Unknown";

function identifyParameterType(param: ts.ParameterDeclaration): ParameterType {
// Check for Identifier (e.g., `x`)
    if (ts.isIdentifier(param.name)) {
        return "Identifier";
    }
    // Check for Pattern (e.g., `{ a, b }` or `[x, y]`)
    if (
        ts.isObjectBindingPattern(param.name) ||
        ts.isArrayBindingPattern(param.name)
    ) {
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

function passParams(params: Array<any>) : ElementParam[] {
    const Result: ElementParam[] = [];
    let paramTyped;
    params.forEach((param) => {
        //const paramType = identifyParameterType(param);

        // Process based on type
        switch (param.type) {
            case "Identifier":
                paramTyped = param as Identifier;
                Result.push({name:paramTyped.name,optional:paramTyped.optional});
            break;
            // case "Pattern":
            //     paramTyped = param.name as Pattern;
            //     Result.push({name:paramTyped.,optional:paramTyped.optional});
            // break;
            case "RestElement":
                paramTyped = param as RestElement;
                Result.push({name:paramTyped.argument.type,optional:paramTyped.optional});
            break;
            // case "TSParameterProperty":

            // break;
            default:
        }
    });
    return Result;
}

export class referenceParser {
    public docReferences: docClassRef[] = [];

    public updateDocRefs(docName: string,docURI: string,fullDocText: string) {
        const className = '_' + docName;
        const ast = this.parseDocument(fullDocText);
        if (!ast) return
        const symbolsMap = this.extractClassesAndMethods(ast);

        const existKey = this.docReferences.find(docRef => docRef.name == className);
        if (!existKey) 
            this.docReferences.push({name: className,uri: docURI,classElements: symbolsMap});
        else 
            existKey.classElements = symbolsMap;
    }

    private parseDocument(fullDocText: string) : ParseResult | undefined {
        //const text = document.getText();
        try {
            const ast = parse(fullDocText, {
                sourceType: 'unambiguous', // Supports ES6 modules
                plugins: ['classProperties', 'jsx'], // Add plugins for specific JS features
            });
            return ast;     
        } catch (error) {
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

    private extractClassesAndMethods(ast: ParseResult) : classElement[] {
        //const symbols = new Map(); // Store class names and their methods
        const elements: classElement[] = [];

        traverse(ast, {
            ClassDeclaration({ node }: { node: BabelClassDeclaration }) {

            const className = '_' + node.id?.name;


            // Extract methods from the class body
            for (const bodyNode of node.body.body) {

                if (bodyNode.type == 'ClassMethod') {
                    const classMethod = bodyNode as ClassMethod;
                    const key = classMethod.key as Identifier;
                    const startPos =  Position.create(classMethod.loc?.start.line || 0,classMethod.loc?.start.index || 0);
                    const endPos =  Position.create(classMethod.loc?.end.line || 0,classMethod.loc?.end.index || 0);
                    const params = passParams(classMethod.params);

                    const element = {
                        name: key.name,
                        compKind: CompletionItemKind.Method, 
                        params: params,
                        type: bodyNode.type,
                        range: Range.create(startPos,endPos)
                        };

                    elements.push(element);
                }

                if (bodyNode.type == 'ClassProperty') {
                    const classProp = bodyNode as ClassMethod | ClassProperty;
                    const key = classProp.key as Identifier;
                    const startPos =  Position.create(classProp.loc?.start.line || 0,classProp.loc?.start.index || 0);
                    const endPos =  Position.create(classProp.loc?.end.line || 0,classProp.loc?.end.index || 0);

                    const element = {
                        name: key.name,
                        compKind: CompletionItemKind.Method, 
                        type: bodyNode.type,
                        range: Range.create(startPos,endPos)
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