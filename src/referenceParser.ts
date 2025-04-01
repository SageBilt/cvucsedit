import { parse, ParseResult } from "@babel/parser";
//import { traverse } from "@babel/traverse";
const traverse = require('@babel/traverse').default;
import { ClassDeclaration as BabelClassDeclaration, ClassMethod, ClassProperty, Identifier, Pattern
    , RestElement, CallExpression, MemberExpression, 
    callExpression,
    SourceLocation} from '@babel/types';
import { docClassRef, classElement, ElementParam, ClassReference } from './interfaces';
//import {  } from 'vscode';
import { Position, Range ,CompletionItemKind } from 'vscode-languageserver/node';



export class referenceParser {
    public docReferences: docClassRef[] = [];

    private passParams(params: Array<any>) : ElementParam[] {
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

    private parseDocument(fullDocText: string) : ParseResult | undefined {
        //const text = document.getText();
        try {
            const ast = parse(fullDocText, {
                sourceType: 'script', // Supports ES6 modules
                plugins: ['classProperties', 'jsx'], // Add plugins for specific JS features
                errorRecovery: true,  // Continue parsing despite errors
            });
            return ast;     
        } catch (error) {
            console.log(`Error parsing document with error ${error}`);
        }
    }

    private getRange(loc: SourceLocation | null | undefined) : Range {
        const startPos = loc ? Position.create(loc.start.line - 1, loc.start.column) : Position.create(0, 0);
        const endPos = loc ? Position.create(loc.end.line - 1, loc.end.column) : Position.create(0, 0);
        return Range.create(startPos,endPos);
    }

    public updateClasses(className: string,docURI: string,fullDocText: string,enabled:boolean) {
        //const className = '_' + docName;
        const ast = this.parseDocument(fullDocText);
        if (!ast) return
        const symbolsMap = this.extractClassesAndMethods(ast);

        const existKey = this.docReferences.find(docRef => docRef.name == className);
        if (!existKey) 
            this.docReferences.push({name: className,uri: docURI,classElements: symbolsMap,isEnabled: enabled,elementReferences: [],classReferences: []});
        else 
            existKey.classElements = symbolsMap;
    }


    private extractClassesAndMethods(ast: ParseResult) : classElement[] {
        const classElems: classElement[] = [];

        traverse(ast, {
            ClassDeclaration: ({ node }: { node: BabelClassDeclaration }) => {

            const className = '_' + node.id?.name;


            // Extract methods from the class body
            for (const bodyNode of node.body.body) {

                if (bodyNode.type == 'ClassMethod') {
                    const classMethod = bodyNode as ClassMethod;
                    const key = classMethod.key as Identifier;
                    const startPos = key.loc ? Position.create(key.loc.start.line-1,key.loc.start.column) : Position.create(0,0);
                    const endPos = key.loc ? Position.create(key.loc.end.line-1,key.loc.end.column) : Position.create(0,0);
                    const params = this.passParams(classMethod.params);

                    const element = {
                        name: key.name,
                        compKind: CompletionItemKind.Method, 
                        params: params,
                        type: bodyNode.type,
                        range: Range.create(startPos,endPos)
                        };

                    classElems.push(element);
                }

                if (bodyNode.type == 'ClassProperty') {
                    const classProp = bodyNode as ClassMethod | ClassProperty;
                    const key = classProp.key as Identifier;
                    const startPos = key.loc ? Position.create(key.loc.start.line-1,key.loc.start.column) : Position.create(0,0);
                    const endPos = key.loc ? Position.create(key.loc.end.line-1,key.loc.end.column) : Position.create(0,0);

                    const element = {
                        name: key.name,
                        compKind: CompletionItemKind.Method, 
                        type: bodyNode.type,
                        range: Range.create(startPos,endPos)
                        };


                    classElems.push(element);
                }
            }
            },

        });

        return classElems;
    }

    public updateClassReferences(docName: string,docURI: string,fullDocText: string) {
        const className = '_' + docName;
        const ast = this.parseDocument(fullDocText);
        if (!ast) return
        this.cleanExistingReferences(docURI);
        this.extractCallExpressions(docURI,ast);
    }

    private cleanExistingReferences(docURI: string) {
        this.docReferences.forEach((classRef: docClassRef) => {
            classRef.classReferences = classRef.classReferences.filter(ref => ref.uri != docURI);
            classRef.elementReferences = classRef.elementReferences.filter(ref => ref.uri != docURI);
        });
    }
    private extractCallExpressions(docURI: string,ast: ParseResult) {

        traverse(ast, {
            CallExpression: ({ node }: { node: CallExpression }) => {
                if (node.callee.type === 'MemberExpression') {
                  const memberExpr = node.callee as MemberExpression;
                  const objectName = (memberExpr.object as Identifier)?.name || 'unknown';
                  const propertyName = (memberExpr.property as Identifier)?.name;
        
                  const startPos = node.loc ? Position.create(node.loc.start.line - 1, node.loc.start.column) : Position.create(0, 0);
                  const endPos = node.loc ? Position.create(node.loc.end.line - 1, node.loc.end.column) : Position.create(0, 0);
    
        
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