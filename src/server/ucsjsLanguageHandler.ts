import {
    CompletionItem,
    CompletionItemKind,
    Connection,
    InsertTextFormat
   } from 'vscode-languageserver/node';

import * as fs from 'fs';
import { UCSJSSystemConstants, UCSJSSystemData, UCSJSSystemMethod, DynamicData, UCSJSObject, UCSJSSnippets } from '../interfaces';
import * as CONSTANTS from '../constants';

/**
 * What remains of UCS:JS language support on the server.
 *
 * The Cabinet Vision API itself - objects, properties, methods, constants, library classes and the
 * types flowing between them - is described by the generated cv-api.d.ts and served by VS Code's own
 * TypeScript service, which handles completion, hover, signature help, definitions, references and
 * rename. This class only covers what TypeScript cannot know: which *specific* Cabinet Vision values
 * belong at a given argument position, driven by `parameterDef[].DataType`.
 */
export class ucsjsLanguageHandler {
    private connection: Connection;

    private ucsjsObjects: UCSJSObject[] = [];
    public ucsjsConstants: UCSJSSystemConstants = {} as UCSJSSystemConstants;
    public ucsjsMethods: UCSJSSystemMethod[] = [];
    private ucsjsSnippets: CompletionItem[] = [];
    public dynamicData: DynamicData = {} as DynamicData;

    constructor(conn: Connection) {
        this.connection = conn;

        try {
          const ucsjsSystemData: UCSJSSystemData = JSON.parse(fs.readFileSync(CONSTANTS.UCSJSSYSTEMJSONPATH, 'utf8'));
          this.ucsjsObjects = ucsjsSystemData.objects;
          this.ucsjsConstants = ucsjsSystemData.constants;
          this.ucsjsMethods = ucsjsSystemData.methods;
        } catch (error) {
          const err = error as Error;
           this.connection.console.log(err.message);
        }

        try {
          const snippets: UCSJSSnippets = JSON.parse(fs.readFileSync(CONSTANTS.UCSJSSNIPPETSJSONPATH, 'utf8'));
          this.ucsjsSnippets = this.buildSnippetItems(snippets);
        } catch (error) {
          const err = error as Error;
           this.connection.console.log(`Could not load UCS:JS snippets: ${err.message}`);
        }
    }

    /**
     * Turns the snippet file into completion items once, at construction: the file is static, so
     * rebuilding it on every keystroke would be wasted work.
     */
    private buildSnippetItems(snippets: UCSJSSnippets): CompletionItem[] {
        return Object.entries(snippets).map(([name, snippet]) => {
          const body = Array.isArray(snippet.body) ? snippet.body.join('\n') : snippet.body;
          return {
            label: snippet.prefix || name,
            kind: CompletionItemKind.Snippet,
            detail: snippet.description ?? name,
            insertText: body,
            insertTextFormat: InsertTextFormat.Snippet,
            documentation: {
                kind: 'markdown' as const,
                value: `${snippet.description ? `${snippet.description}\n\n` : ''}\`\`\`javascript\n${body}\n\`\`\``
              }
          };
        });
    }

    /**
     * The multi line UCS:JS snippets - new part, route, dado, hole, linebore and connection. These
     * used to be a `package.json` snippet contribution, but that is scoped by language id alone and
     * so offered them in every JavaScript file in the window. Here they ride on the language
     * client's document selector, which is already restricted to the mirror and the debug folder.
     */
    AddSnippets(items: CompletionItem[]) {
        items.push(...this.ucsjsSnippets);
    }

    AddObjects(items: CompletionItem[]) {
        this.ucsjsObjects.forEach(obj => {
          items.push({
            label: obj.name,
            kind: CompletionItemKind.Keyword,
            documentation: {
                kind: 'markdown',
                value: `**${obj.name}**\n\n${obj.Type ? `(${obj.Type} object)` : '(Cabinet Vision object)'}`
              }
          });
        });
      }

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


}