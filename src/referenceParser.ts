import { parse, ParseResult } from "@babel/parser";
//import { traverse } from "@babel/traverse";
const traverse = require('@babel/traverse').default;
import { ClassDeclaration as BabelClassDeclaration, ClassMethod, Identifier } from '@babel/types';
import { docClassRef, classElement } from './interfaces';
//import { Position,  } from 'vscode';
import { Range, Position, CompletionItemKind } from 'vscode-languageserver/node';


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

    private extractClassesAndMethods(ast: ParseResult) : classElement[] {
        //const symbols = new Map(); // Store class names and their methods
        const methods: classElement[] = [];

        traverse(ast, {
            ClassDeclaration({ node }: { node: BabelClassDeclaration }) {

            const className = '_' + node.id?.name;


            // Extract methods from the class body
            for (const bodyNode of node.body.body) {

                //ClassProperty

                if (bodyNode.type === 'ClassMethod') {
                    const classMeth = bodyNode as ClassMethod;
                    const key = classMeth.key as Identifier;
                    const startPos =  Position.create(classMeth.loc?.start.line || 0,classMeth.loc?.start.index || 0);
                    const endPos =  Position.create(classMeth.loc?.end.line || 0,classMeth.loc?.end.index || 0);

                    methods.push({
                    name: key.name,
                    compKind: CompletionItemKind.Method, 
                    params: classMeth.params,
                    type: bodyNode.type,
                    range: Range.create(startPos,endPos)
                    });
                }
            }


            //symbols.set(className, methods);

            },
        });

        return methods;
    }

}