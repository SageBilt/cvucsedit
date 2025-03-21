//import { CompletionBase } from './CompletionBase';
import {  
    CompletionItem, 
    CompletionItemKind, 
    Connection, 
    InsertTextFormat,
    Range,
    Hover
   } from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import * as fs from 'fs';
import { UCSMSystemVariable, UCSMSpecialObject, UCSMSystemData , UCSMSystemFunctions, UCSMVariableTypes, UCSJSSystemData,UCSJSSystemMethod } from '.././interfaces';
import * as CONSTANTS from '.././constants';
import { inherits } from 'util';

export class ucsmCompletion {
    private connection: Connection;
    private languageId: string;


    private keywords: string[] = [];
    private datatypes: UCSMVariableTypes[] = [];
    private variables: UCSMSystemVariable[] = [];
    private functions: UCSMSystemFunctions[] = [];
    public specialObjects: UCSMSpecialObject[] = [];


    constructor(LangID: string,conn: Connection) {
        //super();
        this.connection = conn;
        this.languageId = LangID;

        try {
          const ucsmSystemData: UCSMSystemData = JSON.parse(fs.readFileSync(CONSTANTS.UCSMSYSTEMJSONPATH, 'utf8'));
          this.keywords = ucsmSystemData.keywords || [];
          this.variables = ucsmSystemData.variables || [];
          this.functions = ucsmSystemData.functions || [];
          this.datatypes = ucsmSystemData.types || [];
          this.specialObjects = ucsmSystemData.specialObjects || [];

               
        } catch (error) {
          const err = error as Error;
           this.connection.console.log(err.message);
        }

    }


      AddSpecialObjects(items: CompletionItem[]) {
        this.specialObjects.forEach(spObj => {
          items.push({
            label: spObj.prefix,
            kind: CompletionItemKind.Class,
            detail: `${spObj.prefix} (${spObj.description})`
          });
        });
      }
    
      AddKeywords(items: CompletionItem[]) {
        this.keywords.forEach(kw => {
          items.push({
            label: kw,
            kind: CompletionItemKind.Keyword,
            detail: `${kw} (${this.languageId} keyword)`
          });
        });
      }
    
      AddVariables(items: CompletionItem[],parentObject? : string) {
        this.variables.forEach(variable => {
    
          if (!parentObject && !variable.parentObject || variable.parentObject == parentObject) {
            items.push({
              label: variable.name,
              kind: CompletionItemKind.Variable,
              detail: `${variable.name} (${variable.type} variable)`,
              documentation: {
                kind: 'markdown',
                value: `**${variable.name}**\n\n${variable.description}\n\n- **Type**: ${variable.type}\n- **Valid Range**: ${variable.validRange}\n- **Applies To**: ${variable.appliesTo}\n- **Values**: ${variable.values}\n- **Visibility**: ${variable.visibility}`
              }
            });
          }
        });
      }
    
      AddFunction(items: CompletionItem[]) {
        this.functions.forEach(func => {
          items.push({
            label: func.name,
            kind: CompletionItemKind.Function,
            insertTextFormat: InsertTextFormat.Snippet,
            detail: `${func.value} (Common Function)`,
            insertText: func.value,
            documentation: {
              kind: 'markdown',
              value: `**${func.name}**\n\n${func.description}`
            }
          });
        });
      }
    
      AddDatTypes(items: CompletionItem[]) {
        this.datatypes.forEach(type => {
          items.push({
            label: type.name,
            kind: CompletionItemKind.TypeParameter,
            insertTextFormat: InsertTextFormat.Snippet,
            detail: `${type.value} (data type)`,
            insertText: type.value,
            documentation: {
              kind: 'markdown',
              value: `**${type.name}**\n\n${type.description}`
            }
          });
        });
      }

      hoverFunction() {

      }
  
      getHoverWord(word: string,wordRange: Range) : Hover | undefined {
      
          const func = this.functions.find(f => f.name === word);
          if (func) {
              return {
              contents: {
                  kind: 'markdown',
                  value: `**${func.name}**\n\n${func.description}`
              },
              range: wordRange // Optional: Highlight the word
              };
          }
      
          const keyw = this.keywords.find(k => k === word);
          if (keyw) {
              return {
              contents: {
                  kind: 'markdown',
                  value: `${keyw} (${this.languageId} keyword)`
              },
              range: wordRange // Optional: Highlight the word
              };
          }
      
          const specOjb = this.specialObjects.find(so => so.prefix === word);
          if (specOjb) {
              return {
              contents: {
                  kind: 'markdown',
                  value: `${specOjb.prefix} (${specOjb.description})`
              },
              range: wordRange
              };
          }
      
          const variable = this.variables.find(v => v.name === word);
          if (variable) {
              return {
              contents: {
                  kind: 'markdown',
                  value: `**${variable.name}**\n\n${variable.description}\n\n- **Type**: ${variable.type}\n- **Valid Range**: ${variable.validRange}\n- **Applies To**: ${variable.appliesTo}\n- **Values**: ${variable.values}\n- **Visibility**: ${variable.visibility}`
              },
              range: wordRange
              };
          }
      
          const dTypes = this.datatypes.find(dt => dt.name === word);
          if (dTypes) {
              return {
              contents: {
                  kind: 'markdown',
                  value: `**${dTypes.name}**\n\n${dTypes.description}`
              },
              range: wordRange // Optional: Highlight the word
              };
          }
      
          // Return undefined if no hover info is available
          return undefined;
      }
}