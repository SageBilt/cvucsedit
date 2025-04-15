import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { ControlStructure} from './interfaces';
import * as CONSTANTS from './constants';

export class CustomLanguageFoldingProvider implements vscode.FoldingRangeProvider {
    private controlStructures: ControlStructure[];

    constructor() {
        // Load the JSON file from the extension directory
        const jsonPath = CONSTANTS.UCSMCONTROLSTRUCTURESJSONPATH;
        const jsonContent = fs.readFileSync(jsonPath, 'utf8');
        const config = JSON.parse(jsonContent);
        this.controlStructures = config.controlStructures;
    }

    private isOpeningKeyword(line: string,structure: ControlStructure) : boolean {
        const KeyW = structure.openingKeyword;
        const Suffix = structure.requiredSuffix;
        const pettern = structure.requiredSuffix ? `${KeyW}.*${Suffix}` : `${KeyW}` ;
        const openMatch = new RegExp(pettern,'i' );

        return openMatch.test(line);
    }

    provideFoldingRanges(
        document: vscode.TextDocument,
        context: vscode.FoldingContext,
        token: vscode.CancellationToken
    ): vscode.FoldingRange[] {
        const foldingRanges: vscode.FoldingRange[] = [];

        for (let i = 0; i < document.lineCount; i++) {
            const line = document.lineAt(i).text.trim();
            const lineWithoutComments = line.split(';')[0];

            // Check each control structure
            for (const structure of this.controlStructures) {
                if (!structure.customValidation) {
                    // const openingPattern = structure.requiredSuffix
                    //     ? `${structure.openingKeyword} ${structure.requiredSuffix}`
                    //     : structure.openingKeyword;
                    //const openingPattern = structure.openingKeyword;
                    // const KeyW = structure.openingKeyword;
                    // const Suffix = structure.requiredSuffix;
                    // const pettern = structure.requiredSuffix ? `${KeyW}.*${Suffix}` : `${KeyW}` ;
                    // const openMatch = new RegExp(pettern,'i' );

                    //if (this.lineMatches(lineWithoutComments, structure, document, i)) {
                    if (this.isOpeningKeyword(lineWithoutComments,structure)) {    
                        const startLine = i;
                        let endLine = this.findClosingLine(document, i, structure);

                        if (endLine !== -1) {
                            foldingRanges.push(new vscode.FoldingRange(startLine, endLine));

                            // Handle Else clause if supported
                            if (structure.supportsElse) {
                                const elseLine = this.findElseLine(document, startLine, endLine,structure);
                                if (elseLine !== -1) {
                                    foldingRanges.push(new vscode.FoldingRange(startLine, elseLine - 1)); // Before Else
                                    foldingRanges.push(new vscode.FoldingRange(elseLine, endLine)); // After Else
                                }
                            }

                            //i = endLine; // Skip to the end of the block
                            //break;
                        }
                    }
                }
            }
        }

        return foldingRanges;
    }

    // Find the line number of the closing keyword
    private findClosingLine(document: vscode.TextDocument, startLine: number, structure: ControlStructure): number {
        let openCount = 0;
        for (let j = startLine + 1; j < document.lineCount; j++) {
            const line = document.lineAt(j).text.trim();
            const lineWithoutComments = line.split(';')[0].toUpperCase();
            if (this.isOpeningKeyword(lineWithoutComments,structure)) {
                openCount++;
            } else if (lineWithoutComments === structure.closingKeyword.toUpperCase()) {
                if (openCount === 0) {
                    return j;
                }
                openCount--;
            }
        }
        return -1; // Not found
    }

    // Find an Else clause between start and end lines (if supported)
    private findElseLine(document: vscode.TextDocument, startLine: number, endLine: number, structure: ControlStructure): number {
        let openCount = 0;
        for (let j = startLine + 1; j < endLine; j++) {
            const line = document.lineAt(j).text.trim();
            const lineWithoutComments = line.split(';')[0].toUpperCase();
            if (this.isOpeningKeyword(lineWithoutComments,structure)) {
                openCount++;

            } else if (lineWithoutComments === 'ELSE') {
                if (openCount === 0) {
                    return j;
                }
                openCount--;    
            }
        }
        return -1; // No Else found
    }
}