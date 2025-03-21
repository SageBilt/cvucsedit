import {  
    Connection, 
    Diagnostic, 
    DiagnosticSeverity, 
   } from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import * as fs from 'fs';
import { UCSMSystemVariable, ControlStructure, UCSMSpecialObject, UCSMSystemData , UCSMSyntaxData , UCSMSystemFunctions, UCSMVariableTypes, UCSJSSystemMethod, UCSJSSystemData } from '.././interfaces';
import * as CONSTANTS from '.././constants';

export class ucsmValidation {
    private connection: Connection;
    private languageId: string;

    private functions: UCSMSystemFunctions[];
    private valueTypes: string[];
    private dimTypes: string[];
    private forEachTypes: string[];
    private controlStructures: ControlStructure[];
    private specialObjects: UCSMSpecialObject[];
    private ucsjsMethods: UCSJSSystemMethod[] = [];
    private UCSJSSyntaxMethods: UCSJSSystemMethod[] = [];

    constructor(LangID: string,conn: Connection) {
        this.connection = conn;
        this.languageId = LangID;  
        
        const systemData: UCSMSystemData = JSON.parse(fs.readFileSync(CONSTANTS.UCSMSYSTEMJSONPATH, 'utf8'));
        this.functions = systemData.functions || [];
        this.specialObjects = systemData.specialObjects || [];
    
        const syntaxData: UCSMSyntaxData = JSON.parse(fs.readFileSync(CONSTANTS.UCSMSYNTAXJSONPATH, 'utf8'));
        this.valueTypes = syntaxData.valueTypes || [];
        this.dimTypes = syntaxData.dimTypes || [];
        this.forEachTypes = syntaxData.forEachTypes || [];
    
        const controlData = JSON.parse(fs.readFileSync(CONSTANTS.UCSMCONTROLSTRUCTURESJSONPATH, 'utf8'));
        this.controlStructures = controlData.controlStructures || [];

        const ucsjsSystemData: UCSJSSystemData = JSON.parse(fs.readFileSync(CONSTANTS.UCSJSSYSTEMJSONPATH, 'utf8'));
        this.ucsjsMethods = ucsjsSystemData.methods;

        this.FindUCSJSSyntaxMethods(); 
    }

    private FindUCSJSSyntaxMethods() {
        this.ucsjsMethods.forEach((Method:UCSJSSystemMethod)=> {
            if (Method.parameterDef?.some(param =>  param.DataType == "ucsmSyntax"))
            this.UCSJSSyntaxMethods.push(Method);
        });
    }

    public getParamCount(fullLine: string) : number {
    const commaCount = (fullLine.match(/,/g) || []).length;
    return commaCount + 1;
    }

    private filterUCSMContext(lineText:string) : {filteredText: string,startOffset: number } | undefined {

        function getParamDataType(methodDef: UCSJSSystemMethod,paramIndex: number) {
            return paramIndex < methodDef.parameterDef.length
            ? methodDef.parameterDef[paramIndex].DataType
            : undefined;
        }

        const lineParamCount = this.getParamCount(lineText);

        for (const methodDef of this.UCSJSSyntaxMethods) {
            const methodName = methodDef.name;
            
    
            const methodRegex = new RegExp(`\\b${methodName}\\s*\\(([^\\.]*)`); //^)
            const match = lineText.match(methodRegex);
            //this.connection.console.log(`lineText "${lineText}" methodName "${methodName}"`);
    
            //this.connection.console.log(`lineText "${lineText}" match "${match}" methodName "${methodName}"`);
            if (!match) continue; // Skip if this method doesn’t match
            const methodParamCount = this.getParamCount(methodDef.value);
            if (methodParamCount != lineParamCount) continue; // Skip if this method if different number of parameters
    

            //this.connection.console.log(match[1]);
            const argsSoFar = match[1]; // Content inside parentheses up to cursor
            const methodStart = lineText.lastIndexOf(match[0]); // Start of method call
            const argsStart = methodStart + methodName.length + 1; // Position after '('
            const absoluteStartPos = lineText.lastIndexOf(match[1]); //lineText.lastIndexOf(`${methodName}(`)
    
            //this.connection.console.log(`methodtext "${lineText.substring(absoluteStartPos,absoluteStartPos+methodName.length + 1)}"`);

            // Split arguments by comma, handling strings and nested content
            let paramIndex = 0;
            let StrStart = absoluteStartPos + 1;
            let inString = false;
            let quoteChar = '';
            let paramDataType = getParamDataType(methodDef,paramIndex);
    
            for (let i = 0; i < argsSoFar.length; i++) {
                const char = argsSoFar[i];
                const absolutePos = argsStart + i;
    
                //this.connection.console.log(`text to evaluate "${lineToEval}"`);

                if (inString) {
                  //this.connection.console.log('{'+char+'}');
                  if (char === quoteChar && argsSoFar[i - 1] !== '\\') {
                      inString = false; // End of string
                      //this.connection.console.log(`paramDataType "${paramDataType}" insideStr "${lineText.substring(StrStart,argsStart + i)}"`);
                      if (paramDataType == 'ucsmSyntax') {

                        const filteredText = lineText.substring(StrStart,argsStart + i);
                        const startOffset = StrStart;
                        return  {filteredText: filteredText,startOffset: StrStart };
                      }
                  }
                } else {
                  if (char === '"' || char === "'") {
                      inString = true;
                      quoteChar = char;
                      StrStart = absoluteStartPos + i + 1;
                  } else if (char === ',') {
                    //this.connection.console.log(`argsSoFar "${argsSoFar[i - 1]}"`);
                    paramIndex++; // Move to next parameter
                      paramDataType = getParamDataType(methodDef,paramIndex);
                  }
                }
            }

        }
    }

    private addDiagnostic(diagnostics: Diagnostic[], line: number, startChar: number, endChar: number, message: string, severity: DiagnosticSeverity = DiagnosticSeverity.Error) {
        diagnostics.push({
            severity,
            range: { start: { line, character: startChar }, end: { line, character: endChar } },
            message,
            source: this.languageId
        });
    }

    public validateUCSM(text: string,langID: string): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];
    const lines = text.split('\n');
    const stack: { keyword: string; line: number }[] = [];

    const commentSplitRegex = /\s*[\/\/.*?$|\/\*[\s\S]*?\*\/]/m;
    const commentPattern = this.languageId == 'javascript' ? new RegExp(commentSplitRegex)  : ';'; 

    const openingKeywords = this.controlStructures.map(cs => cs.openingKeyword).join('|');
    const closingKeywords = this.controlStructures.map(cs => cs.closingKeyword).join('|');
    const openingRegex = new RegExp(`^(${openingKeywords})\\b`, 'i');
    const closingRegex = new RegExp(`^(${closingKeywords})\\b`, 'i');

        for (let i = 0; i < lines.length; i++) {
            const lineWithoutComments = lines[i].split(commentPattern)[0];
            const trimStartText = lineWithoutComments.match(/^\s*/);
            const trimStart = trimStartText ? trimStartText[0].length : 0;
            const lineWithoutCommentsTrim = lineWithoutComments.trim();  
            if (!lineWithoutCommentsTrim) continue;
            //this.connection.console.log(`trimStartText "${trimStartText}"`);

            const filteredForJS = this.languageId == 'javascript' ? this.filterUCSMContext(lineWithoutCommentsTrim) : {filteredText: lineWithoutCommentsTrim,startOffset: trimStart } ;
            if (!filteredForJS) continue;

            const startOffset = filteredForJS.startOffset + trimStart;
            const lineToEval = filteredForJS.filteredText;
            this.connection.console.log(`text to evaluate "${lineToEval}"`);

            const bracketCheck = this.checkBalancedBrackets(lineToEval);
            if (bracketCheck !== true) {
                this.addDiagnostic(
                    diagnostics,
                    i,
                    startOffset + bracketCheck.position,
                    startOffset + bracketCheck.position + 1,
                    bracketCheck.message
                );
            }

            const openingMatch = lineToEval.match(openingRegex);
            if (openingMatch) {
            const keyword = openingMatch[1].toLowerCase();
            const structure = this.controlStructures.find(cs => cs.openingKeyword.toLowerCase() === keyword)!;
            stack.push({ keyword, line: i });

            if (structure.requiredSuffix) {
                const suffixRegex = new RegExp(`${structure.requiredSuffix}\\s*$`, 'i');
                if (!lineToEval.match(suffixRegex)) {
                this.addDiagnostic(
                    diagnostics,
                    i,
                    startOffset,
                    lineToEval.length - startOffset,
                    `'${structure.openingKeyword}' statement must end with '${structure.requiredSuffix}'.`
                );
                } else {
                const conditionMatch = lineToEval.match(new RegExp(`^${structure.openingKeyword}\\s+(.+?)\\s+${structure.requiredSuffix}\\s*$`, 'i'));
                if (!conditionMatch) {
                    this.addDiagnostic(
                    diagnostics,
                    i,
                    startOffset,
                    lineToEval.length - startOffset,
                    `'${structure.openingKeyword}' statement must have a condition before '${structure.requiredSuffix}'.`
                    );
                } else {
                    const condition = conditionMatch[1].trim();
                    if (!condition) {
                    this.addDiagnostic(
                        diagnostics,
                        i,
                        startOffset + structure.openingKeyword.length + 1,
                        lineToEval.length - structure.requiredSuffix.length - 1 - startOffset,
                        `Condition in '${structure.openingKeyword}' statement cannot be empty.`
                    );
                    } else if (!this.isValidCondition(condition)) {
                    this.addDiagnostic(
                        diagnostics,
                        i,
                        startOffset + structure.openingKeyword.length + 1,
                        lineToEval.length - structure.requiredSuffix.length - 1 - startOffset,
                        `'${condition}' is not a valid condition. Expected a variable, object.property (with optional : prefixes or inline {variable}), or a comparison (e.g., x > 5) with optional arithmetic expressions and logical operators.`
                    );
                    }
                }
                }
            }

            if (structure.customValidation === 'forEachValidation') {
                const match = lineToEval.match(/^For\s+Each\s+([A-Za-z|_?][A-Za-z0-9|_?]*(?:\s*(?:\||\bOR\b)\s*[A-Za-z|_?][A-Za-z0-9|_?]*)*)\s+([A-Za-z][A-Za-z0-9]*)/i);
                if (!match) {
                this.addDiagnostic(
                    diagnostics,
                    i,
                    startOffset,
                    lineToEval.length - startOffset,
                    `Invalid 'For Each' syntax. Expected: For Each <object> [| or OR <object>]* <type>`
                );
                } else {
                const [, objectsStr, type] = match;
                const typeLower = type.toLowerCase();
                const lowerCaseForEachTypes = this.forEachTypes.map(t => t.toLowerCase());
                if (!lowerCaseForEachTypes.includes(typeLower)) {
                    this.addDiagnostic(
                    diagnostics,
                    i,
                    startOffset + lineToEval.indexOf(type),
                    lineToEval.indexOf(type) + type.length - startOffset,
                    `'${type}' is not a valid For Each type. Expected one of: ${this.forEachTypes.join(', ')}`
                    );
                }
                }
            }
            } else if (lineToEval.match(/^[A-Za-z_:][A-Za-z0-9_:]*\s*(?:=|\:=|=[\+\-\*\/]=)/i)) {
            const assignmentMatch = lineToEval.match(/^(.+?)\s*$/i);
            if (assignmentMatch) {
                const assignment = assignmentMatch[1].trim();
                console.log(`condition "${assignment}"`);
                if (!this.EvalStatement(assignment)) {  //isValidCondition
                this.addDiagnostic(
                    diagnostics,
                    i,
                    startOffset,
                    lineToEval.length - startOffset,
                    `'${assignment}' is not a valid assignment or expression.`
                );
                }
            }
            } else if (closingRegex.test(lineToEval)) {
            const closingMatch = lineToEval.match(closingRegex)!;
            const closingKeyword = closingMatch[1].toLowerCase();
            const structure = this.controlStructures.find(cs => cs.closingKeyword.toLowerCase() === closingKeyword)!;

            if (!stack.length) {
                this.addDiagnostic(
                diagnostics,
                i,
                startOffset,
                lineToEval.length - startOffset,
                `'${structure.closingKeyword}' without matching opening statement.`
                );
            } else {
                const last = stack.pop()!;
                if (structure.openingKeyword.toLowerCase() !== last.keyword) {
                this.addDiagnostic(
                    diagnostics,
                    i,
                    startOffset,
                    lineToEval.length - startOffset,
                    `'${structure.closingKeyword}' does not match the last opening statement '${last.keyword}'.`
                );
                }
            }
            } else if (lineToEval.match(/^Else\s*$/i)) {
            const ifStructure = this.controlStructures.find(cs => cs.supportsElse && cs.openingKeyword.toLowerCase() === 'if');
            if (!ifStructure || !stack.length || stack[stack.length - 1].keyword !== 'if') {
                this.addDiagnostic(
                diagnostics,
                i,
                startOffset,
                lineToEval.length - startOffset,
                `'Else' without a preceding 'If' statement.`
                );
            }
            }
        }

        stack.forEach(unclosed => {
            const structure = this.controlStructures.find(cs => cs.openingKeyword.toLowerCase() === unclosed.keyword);
            if (structure && structure.closingKeyword !== 'End For') {
            this.addDiagnostic(
                diagnostics,
                unclosed.line,
                0,
                lines[unclosed.line].length,
                `'${structure.openingKeyword}' statement is not closed. Expected '${structure.closingKeyword}'.`
            );
            }
        });

        return diagnostics;
    }



    private EvalStatement(statement: string): {valid:boolean,notValidText: string} {

        interface wordType {
            name: string;
            pattern: string;
            weight: number;
        }

        const wordTypes: wordType[] = [
            {name: 'variable',pattern: '^^[A-Za-z_][A-Za-z0-9_\\.]*[A-Za-z0-9_]$',weight: 1 },
            {name: 'identifier',pattern: '^[A-Za-z_][A-Za-z0-9_{}@\\.:]*[A-Za-z0-9_]$',weight: 1 },
            {name: 'dataType',pattern: '^<(crncy|meas|deg|int|bool|dec|text|style|desc)>$',weight: 1 },
            {name: 'number',pattern: '^\\d*\\.?\\d*(mm|in)?$',weight: 1 },
            {name: 'stringLiteral',pattern: `^'(?:[^']*)'$`,weight: 1 },
            {name: 'booleanOrNull',pattern: '^(True|False|null)$',weight: 1 },
            {name: 'comparisonOperators',pattern: '^(<|>|<=|>=|!=|==)$',weight: 1 },
            {name: 'assignmentOperators',pattern: '^(\\:=|[\\+\\-\\*\\/]=)$',weight: 1 },
            {name: 'arithmeticOperators',pattern: `^(\\+|-|\\*|\\/|%)$`,weight: 1 },
            {name: 'equalSign',pattern: `^=$`,weight: 1 },
        ]

        /*
            Note : must start with an "identifier" or "variable"

            if it's a "variable" with a "assignmentOperators" or "equalSign" then only check everything after the "assignmentOperators" or "equalSign"
            possible combinations are
            "variable"  + ("equalSign" or "assignmentOperators" or "comparisonOperators") 
            if second is ("equalSign" or "assignmentOperators" or "dataType") then it's an assigment then only check everything after the "assignmentOperators" or "equalSign"
            if second is ("equalSign" or "comparisonOperators") then it's an comparison 

            if it's a comparison then the next part after the operator must be ("booleanOrNull")

        */

        function getWordType(part: string) : wordType | undefined {
            for (const wordT of wordTypes) {
                const pattern = new RegExp(wordT.pattern, 'i');
                if (pattern.test(part)) return wordT;
            }
        }

        const filterNewLinesPart = statement.split(/[\r\n]+/)[0].trim();

        const logicalOperatorSplit = /\s*(\bAnd\b|\bOr\b|&|\|)\s*/i;
        const parts = filterNewLinesPart.split(logicalOperatorSplit);
        const ops: wordType[] = [];
        const isAssignment = false;

        for (let j = 0; j < parts.length; j++) {
            const part = parts[j];  
            const slitByWhiteSpace = part.split(/\s+/);
            console.log(`part "${part}"`);
            for (let i = 0; i < slitByWhiteSpace.length; i++) {
                const word = slitByWhiteSpace[i];
                const wordT = getWordType(word);
                if (!wordT) break;

                ops.push(wordT);
                if (i == 0 && wordT.name != 'identifier') return {valid: false,notValidText: 'Expression must start with an identifier.'};


                if (i > 0 && )

            }
            
        }

        return {valid: true,notValidText: ''};
    }

    private isValidCondition(condition: string): boolean {
        const bracketCheck = this.checkBalancedBrackets(condition);
        if (bracketCheck !== true) {
            return false;
        }

        try {
            const identifier = '[\\+\\-*/%!]?\\s*[A-Za-z_:{}@][A-Za-z0-9_{}@\\.]*(@|\\d+)*';
            const number = '-?\\d+\\.?\\d*(mm|in)?';
            const stringLiteral = `'(?:[^']*)'|"[^"]*"`;
            const booleanOrNull = 'True|False|null';
            const inlineVarSegment = `${identifier}(?:\\{${identifier}\\}${identifier})*`;
            const specialObjectPatterns = this.specialObjects.map(obj => {
            const basePattern = `${obj.prefix.replace(/:/g, '\\:')}${obj.propertyPattern}`;
            return obj.allowsSubProperties ? `${basePattern}(?:\\:${identifier})*` : basePattern;
            }).join('|');
            const propertySegment = `(?:${identifier}|${inlineVarSegment})`;
            const propertyPattern = `(?:${specialObjectPatterns})|(?::+${identifier}|${propertySegment})(?:\\.(${specialObjectPatterns}|${propertySegment}))*`;
            const arithmeticOperand = `(?:${propertyPattern}|${number}|${stringLiteral}|${booleanOrNull})(?:\\s*[\\+\\-*/%]\\s*(?:${propertyPattern}|${number}))*`;
            const comparisonOperators = '=|<|>|<=|>=|!=|==';
            const assignmentOperators = '=|\\:=|=\\s*[\\+\\-*\\/]=';
            const logicalOperators = '\\bAnd\\b|\\bOr\\b|&|\\|';

            const singleComparison = `${arithmeticOperand}\\s*(?:${comparisonOperators})\\s*${arithmeticOperand}`;
            const singleAssignment = `${propertyPattern}\\s*(?:${assignmentOperators})\\s*${arithmeticOperand}`;
            const comparisonPattern = `^\\s*(?:${singleComparison}|${singleAssignment}|${arithmeticOperand})\\s*$`;

            let strippedCondition = condition;
            this.functions.forEach(Func => {
            const functionRegex = new RegExp(`\\b${Func.name}\\s*\\(+`, 'gi');
            strippedCondition = strippedCondition.replace(functionRegex, match => {
                const innerContent = match.slice(match.indexOf('(') + 1, match.lastIndexOf(')')).trim();
                return innerContent || '';
            });
            });

            strippedCondition = strippedCondition.replace(/[()]/g, '').trim();
            if (!strippedCondition) return false;

            const logicalOperatorSplit = /\s*(\bAnd\b|\bOr\b|&|\|)\s*/i;
            const parts = strippedCondition.split(logicalOperatorSplit);
            if (parts.length === 0) return false;

            let expectComparison = true;
            for (let i = 0; i < parts.length; i++) {
            const part = parts[i].trim();
            if (!part) continue;

            if (expectComparison) {
                if (!new RegExp(comparisonPattern, 'i').test(part)) {
                console.log(`Invalid comparison chunk: "${part}"`);
                return false;
                }
                expectComparison = false;
            } else {
                if (!/^\bAnd\b|\bOr\b|&|\|$/i.test(part)) {
                console.log(`Expected logical operator, got: "${part}"`);
                return false;
                }
                expectComparison = true;
            }
            }

            if (expectComparison) {
            console.log("Condition ends with a logical operator, incomplete");
            return false;
            }

            console.log(`Condition "${condition}" is valid (stripped: "${strippedCondition}")`);
            return true;
        } catch (error) {
            console.error("Error in isValidCondition:", error);
            return false;
        }
    }

    private checkBalancedBrackets(condition: string): true | { message: string; position: number } {
        let openCount = 0;
        for (let i = 0; i < condition.length; i++) {
            if (condition[i] === '(') {
            openCount++;
            } else if (condition[i] === ')') {
            if (openCount === 0) {
                return { message: `Unmatched closing parenthesis ')' in condition.`, position: i };
            }
            openCount--;
            }
        }
        if (openCount > 0) {
            let unmatchedPos = -1;
            let count = openCount;
            for (let i = condition.length - 1; i >= 0 && count > 0; i--) {
            if (condition[i] === '(') {
                count--;
                if (count === 0) unmatchedPos = i;
            }
            }
            return { message: `Unmatched opening parenthesis '(' in condition.`, position: unmatchedPos };
        }
        return true;
    }
}