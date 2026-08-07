import {
    CompletionItem,
    CompletionItemKind,
    Connection
   } from 'vscode-languageserver/node';

import * as fs from 'fs';
import { UCSJSSystemConstants, UCSJSSystemData, UCSJSSystemMethod, DynamicData, UCSJSObject } from '../interfaces';
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