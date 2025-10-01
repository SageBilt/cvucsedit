//import { CompletionBase } from './CompletionBase';
import {  
    CompletionItem, 
    CompletionItemKind, 
    Connection, 
    InsertTextFormat,
    Range,
    Hover,
    Location
   } from 'vscode-languageserver/node';
   
   import * as fs from 'fs';
import { UCSJSSystemConstants, UCSJSSystemProperty, UCSJSSystemFunction, UCSJSSystemData,UCSJSSystemMethod, UCSJSParameterDef, DynamicData, docClassRef, classElement, ElementParam, CVManaged, UCSJSObject } from '../interfaces';
import * as CONSTANTS from '../constants';
import { Position, Uri } from 'vscode';


export class ucsjsLanguageHandler {
    private connection: Connection;
    private languageId: string;


    private ucsjsObjects: UCSJSObject[] = [];
    public ucsjsConstants: UCSJSSystemConstants = {} as UCSJSSystemConstants;
    private ucsjsProperties: UCSJSSystemProperty[] = [];
    private ucsjsFunctions: UCSJSSystemFunction[] = [];
    public ucsjsMethods: UCSJSSystemMethod[] = [];
    public dynamicData: DynamicData = {} as DynamicData;

    public classLibraries: docClassRef[] = [];

    public CVAsmManagedReferences: CVManaged[] = [];

    public CVShapeManagedReferences: CVManaged[] = [];

    // private AssemblyTypes: string[] = [];
    // private parameterModTypes: string[] = [];
    // private parameterModStyles: string[] = [];
    // private databaseIDTypes: string[] = [];
    // private parameterTypes: string[] = [];

    constructor(LangID: string,conn: Connection) {
        //super();
        this.connection = conn;
        this.languageId = LangID;

        try {
          const ucsjsSystemData: UCSJSSystemData = JSON.parse(fs.readFileSync(CONSTANTS.UCSJSSYSTEMJSONPATH, 'utf8'));
          this.ucsjsObjects = ucsjsSystemData.objects;
          this.ucsjsConstants = ucsjsSystemData.constants;
          this.ucsjsProperties = ucsjsSystemData.properties;
          this.ucsjsFunctions = ucsjsSystemData.functions;
          this.ucsjsMethods = ucsjsSystemData.methods;

          this.ucsjsConstants.AssemblyTypes

        //   this.AssemblyTypes = ucsjsSystemData.constants.AssemblyTypes;
        //   this.parameterModTypes = ucsjsSystemData.constants.parameterModTypes;
        //   this.parameterModStyles = ucsjsSystemData.constants.parameterModStyles;
        //   this.databaseIDTypes = ucsjsSystemData.constants.databaseIDTypes;
        //   this.parameterTypes = ucsjsSystemData.constants.parameterTypes;  


        } catch (error) {
          const err = error as Error;
           this.connection.console.log(err.message);
        }
    }

    AddObjects(items: CompletionItem[]) {
        this.ucsjsObjects.forEach(obj => {
          items.push({
            label: obj.name,
            kind: CompletionItemKind.Keyword,
            //detail: `**${obj}**\n\n (CV object)`
            documentation: {
                kind: 'markdown',
                value: `**${obj}**\n\n (${obj.Type} object)`
              }
          });
        });
      }

    AddLibraryClassInstances(items: CompletionItem[]) {
        this.classLibraries.forEach((docRef: docClassRef) => {
            //console.log(docRef.name);
            items.push({
                label: docRef.name,
                kind: CompletionItemKind.Class,
                //detail: `**${docRef.name}**\n\n (CV JavaScript library class instance)`
                documentation: {
                    kind: 'markdown',
                    value: `**${docRef.name}**\n\n (CV JavaScript library class instance)`
                  }
            }); 
        });
    }

    isLibraryClassInstances(items: CompletionItem[],lineText: string)  : boolean {
        for (const libInst of this.classLibraries) {
            const wordRegex = new RegExp(`${libInst.name}[^\\s]*$`, 'i');
            if (wordRegex.test(lineText)) {
                this.AddLibraryClassElements(items,libInst.name);
                return true;
            } 
        }
        return false;
    }


    buildLibraryClassParams(params: ElementParam[]): string {
        if (!params) return '';
        let Result: string = '';
        
        params.forEach(param => {
            const Optional = param.optional ? '?' : '' ;
            Result += `${param.name}${Optional}\n\n`
        });

        return Result;
    }  

    buildLibraryClassSnippet(elem: classElement): string {
        if (!elem) return '';
        const funcBegin = elem.type.includes('Property') ? '' : '(';
        const funcEnd = elem.type.includes('Property') ? '' : ')';
        let Result: string = elem.name + funcBegin;
        
        elem.params?.forEach((param,index) => {
            const Optional = param.optional ? '?' : '' ;
            if (index > 0) Result += ','
            Result += '${'+index+1+':'+param.name + Optional+'}'
        });

        return Result + funcEnd;
    }  

    AddLibraryClassElements(items: CompletionItem[],className : string) {     
        const classLibrary = this.classLibraries.find(docRef => docRef.name == className);

        if (classLibrary) {     
            classLibrary.classElements.forEach(elem => {
                const paramDefs = elem.params ? this.buildLibraryClassParams(elem.params) : undefined; 
                const paramsStr = paramDefs ? `\n- **Parameters**: \n\n ${paramDefs}` : '';

                console.log(paramsStr);
                items.push({
                    label: elem.name,
                    insertTextFormat: InsertTextFormat.Snippet,
                    kind: elem.compKind,
                    //detail: `${elem.name} ${elem.type}`,
                    insertText: this.buildLibraryClassSnippet(elem),
                    documentation: {
                        kind: 'markdown',
                        value: `**${elem.name}**\n\n **Library**: ${classLibrary.name}\n\n **Type**: ${elem.type}${paramsStr}`
                      }
                }); 
            });
        }
    }

    buildMethodParams(parameterDef: UCSJSParameterDef[]): string {
        if (!parameterDef) return '';
        let Result: string = '';
        
        parameterDef.forEach(param =>
            Result += `\n\nType: ${param.ParamName}\n\n Description: ${param.ParamValue}`
        );

        return Result;
    }  

    AddMethods(items: CompletionItem[],parentObject? : string,type?: string) {
        this.ucsjsMethods.forEach(method => {
            const pObj = parentObject ? parentObject : ''; 
            const paramDefs = this.buildMethodParams(method.parameterDef); 
            const paramDefStr = paramDefs != '' ? `\n **Parameters**: ${paramDefs}` : '';

          //console.log(type , method.objectType, parentObject, method.parentObject);

          if (!parentObject && !method.parentObject || method.parentObject.includes(pObj) || type && method.objectType == type) {
            items.push({
              label: method.name,
              kind: CompletionItemKind.Method,
              insertTextFormat: InsertTextFormat.Snippet,
              //detail: `${method.name} (${method.description} variable)`,
              insertText: method.value,
              documentation: {
                kind: 'markdown',
                value: `**${method.name}**\n\n- **Description**: ${method.description}\n- **Definition**: ${method.definition}\n- **Example**: ${method.example}\n- **ReturnType**: ${method.returnType}${paramDefStr}`
              }
            });
          }
        });
    }

    AddProperties(items: CompletionItem[],parentObject? : string,type?: string) {
        const pObj = parentObject ? parentObject : ''; 
//console.log(parentObject, type);
        this.ucsjsProperties.forEach(prop => {
            if (!parentObject && !prop.parentObject || parentObject && prop.parentObject.includes(pObj) || type && prop.objectType == type) {
                 console.log(prop.name , type, prop.objectType , parentObject , '-', pObj , '-', prop.parentObject);
                items.push({
                label: prop.name,
                kind: CompletionItemKind.Property,
                documentation: {
                    kind: 'markdown',
                    value: `**${prop.name}**\n\n (${prop.Type} type)`
                }
                //detail: `**${prop.name}**\n\n (${prop.Type} type)`,
                //   documentation: {
                //     kind: 'markdown',
                //     value: `**${prop.name}**\n\n- **Description**: ${prop.description}\n- **Value**: ${prop.value}\n- **Example**: ${prop.example}\n- **ReturnType**: ${prop.returnType}$`
                //   }
                });
            }
        });     
    }

    isObject(items: CompletionItem[],lineText: string)  : boolean {
        for (const spObj of this.ucsjsObjects) {
            const wordRegex = new RegExp(`${spObj.name}[^\\s]*$`, 'i');
            if (wordRegex.test(lineText)) {
                //console.log(lineText , spObj.name, spObj.Type);
                this.AddProperties(items,spObj.name);
                this.AddMethods(items,spObj.name);
                return true;
            } 
        }
        
        return false;
    }

    isCVManaged(items: CompletionItem[],linePrefix: string)  : boolean {
        const findCVManObj = (list:CVManaged[]) => {
         for (const CVManObj of list) {
             //console.log(linePrefix , CVManObj.variableName);
             //const wordRegex = new RegExp(`${CVAsmObj.objectName}[^\\s]*$`, 'i');
             if (linePrefix == CVManObj.variableName.toUpperCase()) {
                //console.log(linePrefix , CVManObj.variableName);
                 this.AddProperties(items,CVManObj.objectName,CVManObj.type);
                 this.AddMethods(items,CVManObj.objectName,CVManObj.type);
                 //console.log(linePrefix , CVManObj.variableName, CVManObj.objectName);
                 return true;
             } 
         }
         return false;
        }
        
        if (findCVManObj(this.CVAsmManagedReferences)) return true;
        if (findCVManObj(this.CVShapeManagedReferences)) return true;
        return false;
    }

    // isObject() : boolean {
   
    // }

    AddConstants(items: CompletionItem[],constantList: string[],ConstantListName: string) {
        constantList.forEach(cons => {
            items.push({
              label: cons,
              kind: CompletionItemKind.Constant,
              detail: `${cons} (${ConstantListName} constant)`,
            //   documentation: {
            //     kind: 'markdown',
            //     value: `**${method.name}**\n\n- **Description**: ${method.description}\n- **Definition**: ${method.definition}\n- **Example**: ${method.example}\n- **ReturnType**: ${method.returnType}${paramDefStr}`
            //   }
            });
        });       
    }

    AddAllConstants(items: CompletionItem[]) {
        for (const [key, constants] of Object.entries(this.ucsjsConstants)) {
            this.AddConstants(items,constants,key);
        }
    }

    AddFunctions(items: CompletionItem[]) {
        this.ucsjsFunctions.forEach(func => {
          items.push({
            label: func.name,
            kind: CompletionItemKind.Function,
            detail: `${func.name} (CV function)`,
            documentation: {
                kind: 'markdown',
                value: `**${func.name}**\n\n- **Description**: ${func.description}\n- **Definition**: ${func.definition}\n- **Example**: ${func.example}`
              }
          });
        });
      }

    getHoverWord(word: string,wordRange: Range,prefixWord: string) : Hover | undefined {

        const object = this.ucsjsObjects.find(obj => obj.name === word);
        if (object) {
            return {
            contents: {
                kind: 'markdown',
                value: `**${object.name}**\n\n (${object.Type} object)`
            },
            range: wordRange // Optional: Highlight the word
            };
        }
      
        const func = this.ucsjsFunctions.find(f => f.name === word);
        if (func) {
            return {
            contents: {
                kind: 'markdown',
                value: `**${func.name}**\n\n- **Description**: ${func.description}\n- **Definition**: ${func.definition}\n- **Example**: ${func.example}`
            },
            range: wordRange // Optional: Highlight the word
            };
        }

        const CVAsmManVarRefMatch = this.CVAsmManagedReferences.find(varRef => varRef.variableName.toUpperCase() == prefixWord);
        const CVShapeManVarRefMatch = this.CVShapeManagedReferences.find(varRef => varRef.variableName.toUpperCase() == prefixWord);
        //this.connection.console.log(`variableName "${this.CVShapeManagedReferences[0].variableName}" objectName "${this.CVShapeManagedReferences[0].objectName}"`);
        //this.connection.console.log(`prefixWord "${prefixWord}" objectType "${CVShapeManVarRefMatch?.type}" variableName "${CVShapeManVarRefMatch?.variableName}"`);

        const property = this.ucsjsProperties.find(prop => prop.name === word);
        if (property) { // 
            const parObjUpper = property.parentObject ? property.parentObject.map(o => o.toUpperCase()) : [];
            if (parObjUpper.includes(prefixWord) 
                || CVAsmManVarRefMatch && property.parentObject.includes(CVAsmManVarRefMatch.objectName)
                || CVShapeManVarRefMatch && property.objectType == CVShapeManVarRefMatch.type
            ) {
                //this.connection.console.log(`prefixWord "${prefixWord}" parentObject "${property.parentObject}"`);
                return {
                contents: {
                    kind: 'markdown',
                    value: `**${property.name}**\n\n (${property.Type} type)`
                },
                range: wordRange
                };
            }
        }

        const method = this.ucsjsMethods.find(method => method.name === word);
        if (method) {
            //this.connection.console.log(`prefixWord "${prefixWord}" parentObject "${method.parentObject}"`);
            const parObjUpper = method.parentObject.map(o => o.toUpperCase());
            //this.connection.console.log(`prefixWord "${prefixWord}" parentObject "${method.parentObject}" parObjUpper "${parObjUpper}" objectName "${CVAsmManVarRefMatch?.objectName}"`);
            if (parObjUpper.includes(prefixWord) 
                || CVAsmManVarRefMatch && method.parentObject.includes(CVAsmManVarRefMatch.objectName)
                || CVShapeManVarRefMatch && method.objectType == CVShapeManVarRefMatch.type
            ) {
                const paramDefs = this.buildMethodParams(method.parameterDef); 
                const paramDefStr = paramDefs != '' ? `\n- **Parameters**: \n\n- ${paramDefs}` : '';
                this.connection.console.log(`Hover parameter data type "${method.name}"`);
                return {
                contents: {
                    kind: 'markdown',
                    value: `**${method.name}**\n\n- **Description**: ${method.description}\n- **Definition**: ${method.definition}\n- **Example**: ${method.example}\n- **ReturnType**: ${method.returnType}${paramDefStr}`
                },
                range: wordRange
                };
            }
        }

        const classLib = this.classLibraries.find(item => item.name === word);
        if (classLib) {
            return {
                contents: {
                    kind: 'markdown',
                    value: `**${classLib.name}**\n\n (CV JavaScript library class instance)`
                },
                range: wordRange // Optional: Highlight the word
                }; 
        }



        for (const classLibrary of this.classLibraries) {
            if (classLibrary.name == prefixWord) {
                const element = classLibrary.classElements.find(elem => elem.name === word);
                if (element) {
                    const paramDefs = element.params ? this.buildLibraryClassParams(element.params) : undefined; 
                    const paramsStr = paramDefs ? `\n- **Parameters**: \n\n ${paramDefs}` : '';
                        return {
                        contents: {
                            kind: 'markdown',
                            value: `**${element.name}**\n\n **Library**: ${classLibrary.name}\n\n **Type**: ${element.type}${paramsStr}`
                        },
                        range: wordRange // Optional: Highlight the word
                    };  
                }
            }
        }

        for (const CVAsmObj of this.CVAsmManagedReferences) {
            if (CVAsmObj.variableName == word) {

                return {
                    contents: {
                        kind: 'markdown',
                        value: `**${CVAsmObj.variableName}**\n\n (CVAsmManaged object "${CVAsmObj.objectName}")`
                    },
                    range: wordRange // Optional: Highlight the word
                    };
            }
        }

        for (const CVManObj of this.CVShapeManagedReferences) {
            if (CVManObj.variableName == word) {

                return {
                    contents: {
                        kind: 'markdown',
                        value: `**${CVManObj.variableName}**\n\n (CVShapeManaged object "${CVManObj.objectName}")`
                    },
                    range: wordRange // Optional: Highlight the word
                    };
            }
        }

    
        for (const key of Object.keys( this.ucsjsConstants )) {
            const KeyName = key as keyof UCSJSSystemConstants;
            const cons = this.ucsjsConstants[KeyName].find(con => con === word);
            if (cons) {
                return {
                contents: {
                    kind: 'markdown',
                    value: `**${cons}**\n\n (${key} constant)`
                },
                range: wordRange // Optional: Highlight the word
                };
            }
        }

    
        // Return undefined if no hover info is available
        return undefined;
    }

    getDefinition(symbol: string,prefixSymbol: string) : Location | undefined {
    
        for (const classLibrary of this.classLibraries) {
            if (classLibrary.name === symbol && prefixSymbol == '') {
                const startPos = {line: 0,character: 0};
                const endPos = {line: 1,character: 0};
                const range = Range.create(startPos,endPos);
                return {uri:classLibrary.uri ,range};
            }

            if (prefixSymbol == classLibrary.name) {
                const Symbols = classLibrary.classElements.find(elem => elem.name === symbol);
                if (Symbols) {
                    const sym = Symbols;
                    if (sym) {
                    return {uri:classLibrary.uri ,range:sym.range}
                    }
                }
            }
        }

    }

    getReferences(symbol: string,prefixSymbol: string,uri: string) : Location[] | undefined {
    
        for (const classLibrary of this.classLibraries) {
            if (classLibrary.name === symbol && prefixSymbol == '') {
                
                return classLibrary.classReferences.map(classRef => Location.create(classRef.uri ,classRef.range));
            }

            console.log(`uri "${uri}" split "${uri.split(":/")}"`);
            const libName = '_' + uri.split(":/")[1].split(".")[0] ;;

            if (prefixSymbol == classLibrary.name || libName == classLibrary.name) {
                //console.log(`symbol "${symbol}" prefixWord "${prefixSymbol}"`);
                const Symbols = classLibrary.classElements.find(elem => elem.name === symbol);
                if (Symbols) {
                    const sym = Symbols;
                    if (sym) {
                        const elemRefs = classLibrary.elementReferences.filter(elemRef => elemRef.elementName == sym.name);
                        return elemRefs.map(elemRef => Location.create(elemRef.uri ,elemRef.range));
                    }
                }
            }
        }

    }
}