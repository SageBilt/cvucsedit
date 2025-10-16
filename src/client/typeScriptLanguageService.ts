import * as ts from 'typescript';
import * as fs from 'fs';
import * as path from 'path'; // ← ADD THIS

//const defFileName = '../Languages/ucsjs/uscjs_definitions.d.ts';

export function createTSLanguageServiceHost(definitionsPath: string, documentUri?: string, documentContent?: string) : ts.LanguageServiceHost {
    const defFileName = path.normalize(definitionsPath).replace(/\\/g, '/');

    return {
           getScriptFileNames: () => {
                const files = [defFileName];
                if (documentUri) files.push(documentUri); // ← ADD DOC
                return files;
            },
            getScriptSnapshot: (fileName) => {
                if (fileName === defFileName) {
                    return ts.ScriptSnapshot.fromString(fs.readFileSync(definitionsPath, 'utf8'));
                }
                if (fileName === documentUri && documentContent) { // ← ADD DOC CONTENT
                    return ts.ScriptSnapshot.fromString(documentContent);
                }
                return undefined;
            },
            getScriptVersion: (fileName: string) => '1',
            getCurrentDirectory: () => process.cwd(),
            getCompilationSettings: () => ({ allowJs: true, checkJs: true }),
            getDefaultLibFileName: () => '',
            fileExists: (fileName: string) => {
                if (fileName === defFileName) {
                    return fs.existsSync(fileName);
                }
                return true;
            },
            readFile: (fileName: string) => {
                if (fileName === defFileName) {
                return fs.readFileSync(fileName, 'utf8');
                }
                return undefined;
            }
        };
    
}