//import { CompletionBase } from './CompletionBase';
import {  
    CompletionItem, 
    CompletionItemKind, 
    Connection, 
    InsertTextFormat,
    Range,
    Hover
   } from 'vscode-languageserver/node';
   
   import * as fs from 'fs';
import { UCSJSSystemConstants, UCSJSSystemPropertie, UCSJSSystemFunction, UCSJSSystemData,UCSJSSystemMethod, UCSJSParameterDef, DynamicData, docClassRef, classElement, ElementParam } from '.././interfaces';
import * as CONSTANTS from '.././constants';


export class ucsjsCompletion {
    private connection: Connection;
    private languageId: string;


    private ucsjsObjects: string[] = [];
    public ucsjsConstants: UCSJSSystemConstants = {} as UCSJSSystemConstants;
    private ucsjsProperties: UCSJSSystemPropertie[] = [];
    private ucsjsFunctions: UCSJSSystemFunction[] = [];
    public ucsjsMethods: UCSJSSystemMethod[] = [];
    public dynamicData: DynamicData = {} as DynamicData;

    public classLibraries: docClassRef[] = [];


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
            label: obj,
            kind: CompletionItemKind.Keyword,
            //detail: `**${obj}**\n\n (CV object)`
            documentation: {
                kind: 'markdown',
                value: `**${obj}**\n\n (CV object)`
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
            Result += `Type: ${param.ParamName}\n\n Description: ${param.ParamValue}\n\n`
        );

        return Result;
    }  


    AddMethods(items: CompletionItem[],parentObject? : string) {
        this.ucsjsMethods.forEach(method => {
            const pObj = parentObject ? parentObject : ''; 
            const paramDefs = this.buildMethodParams(method.parameterDef); 
            const paramDefStr = paramDefs != '' ? `\n- **Parameters**: \n\n ${paramDefs}` : '';

          if (!parentObject && !method.parentObject || method.parentObject.includes(pObj)) {
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

    AddProperties(items: CompletionItem[],parentObject? : string) {
        const pObj = parentObject ? parentObject : ''; 

        this.ucsjsProperties.forEach(prop => {
            if (!parentObject && !prop.parentObject || prop.parentObject.includes(pObj)) {   
                items.push({
                label: prop.name,
                kind: CompletionItemKind.Property,
                detail: `**${prop.name}**\n\n (${prop.Type} type)`,
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
            const wordRegex = new RegExp(`${spObj}[^\\s]*$`, 'i');
            if (wordRegex.test(lineText)) {
                this.AddProperties(items,spObj);
                this.AddMethods(items,spObj);
                return true;
            } 
        }
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

    getHoverWord(word: string,wordRange: Range) : Hover | undefined {

        const object = this.ucsjsObjects.find(obj => obj.toUpperCase() === word);
        if (object) {
            return {
            contents: {
                kind: 'markdown',
                value: `**${object}**\n\n (CV object)`
            },
            range: wordRange // Optional: Highlight the word
            };
        }
      
        const func = this.ucsjsFunctions.find(f => f.name.toUpperCase() === word);
        if (func) {
            return {
            contents: {
                kind: 'markdown',
                value: `**${func.name}**\n\n- **Description**: ${func.description}\n- **Definition**: ${func.definition}\n- **Example**: ${func.example}`
            },
            range: wordRange // Optional: Highlight the word
            };
        }

        const property = this.ucsjsProperties.find(prop => prop.name.toUpperCase() === word);
        if (property) {
            return {
            contents: {
                kind: 'markdown',
                value: `**${property.name}**\n\n (${property.Type} type)`
            },
            range: wordRange
            };
        }

        const method = this.ucsjsMethods.find(method => method.name.toUpperCase() === word);
        if (method) {
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

        const classLib = this.classLibraries.find(item => item.name.toUpperCase() === word);
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

            const element = classLibrary.classElements.find(elem => elem.name.toUpperCase() === word);
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

    
        for (const key of Object.keys( this.ucsjsConstants )) {
            const KeyName = key as keyof UCSJSSystemConstants;
            const cons = this.ucsjsConstants[KeyName].find(con => con.toUpperCase() === word);
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
}