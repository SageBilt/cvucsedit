import {  
    Connection, 
    Diagnostic, 
    DiagnosticSeverity, 
   } from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import * as fs from 'fs';
import { ControlStructure, UCSMSpecialObject, UCSMSystemData , UCSMSyntaxData , UCSMSystemFunctions, UCSJSSystemMethod, UCSJSSystemData, ClosingPairs, DynamicData } from '.././interfaces';
import * as CONSTANTS from '.././constants';
import { subscribe } from 'diagnostics_channel';

enum dataTypeCheck {
    any = 0,
    number = 1,
    bool = 2,
    text = 3,
    noCheck = 4
}
interface wordType {
    name: string;
    pattern: string;
    weight: number;
    dataType: dataTypeCheck;
}

const wordTypes: wordType[] = [
    {name: 'dataType',pattern: '^<(crncy|meas|deg|int|bool|dec|text|style|desc)>$',weight: 1, dataType: dataTypeCheck.noCheck },
    {name: 'number',pattern: '^\\d*\\.?\\d*(mm|in)?$',weight: 1, dataType: dataTypeCheck.number },
    {name: 'stringLiteral',pattern: `^'(?:[^']*)'$`,weight: 1, dataType: dataTypeCheck.text },
    {name: 'booleanOrNull',pattern: '^(True|False|null)$',weight: 1, dataType: dataTypeCheck.bool },
    {name: 'comparisonOperators',pattern: '^(<|>|<=|>=|!=|==|!)$',weight: 1, dataType: dataTypeCheck.noCheck },
    {name: 'assignmentOperators',pattern: '^(\\:=|[\\+\\-\\*\\/]=)$',weight: 1, dataType: dataTypeCheck.noCheck },
    {name: 'arithmeticOperators',pattern: `^(\\+|-|\\*|\\/|%|\\^)$`,weight: 1, dataType: dataTypeCheck.noCheck },
    {name: 'equalSign',pattern: `^=$`,weight: 1, dataType: dataTypeCheck.noCheck },
    //{name: 'variable',pattern: '^^[A-Za-z_][A-Za-z0-9_\\.]*[A-Za-z0-9_]$',weight: 1, dataType: dataTypeCheck.any },
    {name: 'identifier',pattern: '^[A-Za-z_{}:][A-Za-z0-9_{}@\\.:]*$',weight: 1, dataType: dataTypeCheck.any },
];

interface EvalStatementResult {
    valid:boolean;
    notValidText: string;
}


export class ucsmValidation {
    private connection: Connection;
    private languageId: string;

    private functions: UCSMSystemFunctions[];
    private valueTypes: string[];
    private dimTypes: string[];
    private forEachTypes: string[];
    private controlStructures: ControlStructure[];
    private closingPairs:  ClosingPairs[];
    private specialObjects: UCSMSpecialObject[];
    private ucsjsMethods: UCSJSSystemMethod[] = [];

    private UCSJSSyntaxMethods: UCSJSSystemMethod[] = [];
    public dynamicData: DynamicData = {} as DynamicData;

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
        this.closingPairs = controlData.closingPairs || [];

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

    
    private checkForEach(lineToEval: string, diagnostics: Diagnostic[], i: number, startOffset: number) {

        const match = lineToEval.match(/^For\s+Each\s+([A-Za-z|_?][A-Za-z0-9|_?]*(?:\s*(?:\||\bOR\b)*\s*[A-Za-z|_?][A-Za-z0-9|_?]*)*)\s+([A-Za-z][A-Za-z0-9]*)/i);
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

    private addDiagnostic(diagnostics: Diagnostic[], line: number, startChar: number, endChar: number, message: string, severity: DiagnosticSeverity = DiagnosticSeverity.Error) {
        diagnostics.push({
            severity,
            range: { start: { line, character: startChar }, end: { line, character: endChar } },
            message,
            source: this.languageId
        });
        //this.connection.console.log(`line "${line}" startChar "${startChar}" endChar "${endChar}"`);
    }

    public getUCSJSLineWithoutComment(line:string,inMultiLineComment: boolean) : {newLine:string,start:number,inMultiLineComment:boolean} | false {
        let trimStart = 0;
        const singlelinePos = line.indexOf('//');
        if (singlelinePos > -1) {
            line = line.substring(0,singlelinePos);
        } else {
            const multiLineStartPos = line.indexOf('/*');
            const multiLineEndPos = line.lastIndexOf('*/');
            if (!inMultiLineComment && multiLineStartPos > -1) {

                //this.connection.console.log(`multiLineStartPos "${multiLineStartPos} multiLineEndPos "${multiLineEndPos}"`);
                if (multiLineEndPos > -1) {
                    trimStart += (multiLineEndPos - multiLineStartPos) + 2;
                    line = line.substring(0,multiLineStartPos) + line.substring(multiLineEndPos+2);  
                } else {
                    inMultiLineComment = true;
                    line = line.substring(0,multiLineStartPos);  
                }

            } else if (inMultiLineComment && multiLineEndPos > -1) {
                inMultiLineComment = false;
                trimStart += multiLineEndPos;
                line = line.substring(multiLineStartPos);  
            } else if (inMultiLineComment) return false;
        }

        return {newLine:line,start:trimStart,inMultiLineComment:inMultiLineComment};
    }

    public validateUCSJS(text: string,langID: string): Diagnostic[] {
        const diagnostics: Diagnostic[] = [];
        const lines = text.split('\n');  
        // const commentSplitRegex = /\s*[\/\/.*?$|\/\*[\s\S]*?\*\/]/m;
        // const commentPattern = new RegExp(commentSplitRegex);
        let inMultiLineComment = false;

        for (let i = 0; i < lines.length; i++) {

            //let lineWithoutComments = '';
            
            //lineWithoutComments = lines[i];

            const filteredLine = this.getUCSJSLineWithoutComment(lines[i],inMultiLineComment);
            if (filteredLine === false) continue
            const lineWithoutComments = filteredLine.newLine;
            inMultiLineComment = filteredLine.inMultiLineComment;
            let trimStart = filteredLine.start;


            const trimStartText = lineWithoutComments.match(/^\s*/);
            trimStart += trimStartText ? trimStartText[0].length : 0;
            const lineWithoutCommentsTrim = lineWithoutComments.trim();
            //this.connection.console.log(`lineWithoutCommentsTrim "${lineWithoutCommentsTrim} split "${lines[i].split(commentPattern)}"`);
            if (!lineWithoutCommentsTrim) continue;
            //this.connection.console.log(`lineWithoutCommentsTrim"${lineWithoutCommentsTrim}`);
            const filteredForJS = this.filterUCSMContext(lineWithoutCommentsTrim);
            if (!filteredForJS) continue;
            
            const startOffset = filteredForJS.startOffset + trimStart;
            const lineToEval = filteredForJS.filteredText;
            //this.connection.console.log(`text to evaluate "${lineToEval}" startOffset "${startOffset}"`);

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

            const evalRusult = this.EvalStatement(lineToEval,true);
            //this.connection.console.log(`valid "${evalRusult.valid}" notValidText "${evalRusult.notValidText}"`);
            if (!evalRusult.valid) {    
                this.addDiagnostic(
                    diagnostics,
                    i,
                    startOffset,
                    startOffset + lineToEval.length,
                    evalRusult.notValidText
                );
            }


        }

        return diagnostics;
    }

    public validateUCSM(text: string,langID: string): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];
    const lines = text.split('\n');
    const stack: { keyword: string; line: number }[] = [];
    let firstNonCommentLine: boolean = true;

    const openingKeywords = this.controlStructures.map(cs => cs.openingKeyword).join('|');
    const closingKeywords = this.controlStructures.map(cs => cs.closingKeyword).join('|');
    const openingRegex = new RegExp(`^(${openingKeywords})\\b`, 'i');
    const closingRegex = new RegExp(`^(${closingKeywords})\\b`, 'i');

        for (let i = 0; i < lines.length; i++) {
            const lineWithoutComments = lines[i].split(';')[0];
            const lineWithoutCommentsTrim = lineWithoutComments.trim();  
            if (!lineWithoutCommentsTrim) continue;

            if (firstNonCommentLine) {
                this.checkForEach(lineWithoutCommentsTrim, diagnostics, i, 0);
                firstNonCommentLine = false;
            }
            //this.connection.console.log(`trimStartText "${trimStartText}"`);

            const startOffset = 0;
            const lineToEval = lineWithoutCommentsTrim;
            //this.connection.console.log(`text to evaluate "${lineToEval}"`);

            const bracketCheck = this.checkBalancedBrackets(lineToEval);
            if (bracketCheck !== true) {
                this.addDiagnostic(
                    diagnostics,
                    i,
                    startOffset + bracketCheck.position,
                    startOffset + bracketCheck.position + 1,
                    bracketCheck.message
                );
                //continue //don't want to evaluate this line any more
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
                        } else {
                            const evalRusult = this.EvalStatement(condition,true);//: {valid:boolean,notValidText: string}
                            if (!evalRusult.valid) {
                            //if (!this.isValidCondition(condition)) {    
                                this.addDiagnostic(
                                    diagnostics,
                                    i,
                                    startOffset + structure.openingKeyword.length + 1,
                                    lineToEval.length - structure.requiredSuffix.length - 1 - startOffset,
                                    evalRusult.notValidText
                                    //`'${condition}' is not a valid condition. Expected a variable, object.property (with optional : prefixes or inline {variable}), or a comparison (e.g., x > 5) with optional arithmetic expressions and logical operators.`
                                );
                            }
                        }
                    }
                    }
                }
            }
            
                if (lineToEval.match(/^[A-Za-z_{}:][A-Za-z0-9_:<>{}@\.]*\s*(?:=|\:=|=[\+\-\*\/]=)/i)) {
                const assignmentMatch = lineToEval.match(/^(.+?)\s*$/i);
                if (assignmentMatch) {
                    const assignment = assignmentMatch[1].trim();
                    console.log(`condition "${assignment}"`);
                    const evalRusult = this.EvalStatement(assignment,false);//: {valid:boolean,notValidText: string}
                    if (!evalRusult.valid) {  //isValidCondition
                    this.addDiagnostic(
                        diagnostics,
                        i,
                        startOffset,
                        lineToEval.length - startOffset,
                        evalRusult.notValidText
                        //`'${assignment}' is not a valid assignment or expression.`
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
            if (structure) { // && structure.closingKeyword !== 'End For'
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

    getFunctionDataType(condPart:string): [string,dataTypeCheck,dataTypeCheck] | undefined {
        for (const Func of this.functions) {
            const functionRegex = new RegExp(`${Func.name}\\(?$`, 'gi');
            if (functionRegex.test(condPart)) {
                const inputDataType = dataTypeCheck[Func.inputType as keyof typeof dataTypeCheck];
                const returnDataType = dataTypeCheck[Func.returnType as keyof typeof dataTypeCheck];
                return [Func.name,inputDataType,returnDataType];
            }
        }
        //return false;
    }

    private EvalStatement(statement: string,mustBeComparision:boolean): EvalStatementResult {



        let mustBeAssignment = false;
        let globalWordCount = 0;


        function getWordType(part: string) : wordType | undefined {
            for (const wordT of wordTypes) {
                const pattern = new RegExp(wordT.pattern, 'i');
                if (pattern.test(part)) return wordT;
            }
        }

        // function SetCheckDataType(wordT:wordType) {
        //     switch (wordT.name) {
        //         case 'number':
        //             checkDataType = wordT.dataType;
        //         case 'booleanOrNull':
        //             checkDataType = wordT.dataType;  
        //         default:
        //             break;
        //     }
        // }

        function CompareDataType(thisType:dataTypeCheck,CompareType:dataTypeCheck) {

            if (thisType == dataTypeCheck.noCheck || CompareType == dataTypeCheck.noCheck)
                return true


            if (thisType != CompareType) {
                if (thisType == dataTypeCheck.any || CompareType == dataTypeCheck.any)
                    return true
                else if (thisType == dataTypeCheck.bool && CompareType == dataTypeCheck.number || thisType == dataTypeCheck.number && CompareType == dataTypeCheck.bool )
                    return true
                else
                return false
            }

            return true
        }

        function setDataTypeFromPattern(part:string): dataTypeCheck {
            const dataTypeDecl = part.match(/<(crncy|meas|deg|int|bool|dec|text|style|desc)>/i);
            if (dataTypeDecl) {
                switch (dataTypeDecl[0]) {
                    case '<crncy>':
                    case '<meas>':
                    case '<int>':
                    case '<dec>':
                    case '<style>':
                    case '<deg>':                
                        return dataTypeCheck.number;
                    case '<text>':
                    case '<desc>':    
                        return dataTypeCheck.text;
                    case '<bool>':    
                        return dataTypeCheck.bool;
                    default:
                        return dataTypeCheck.any;
                }
            }
            return dataTypeCheck.any;
        }

        function addWhiteSpaceWhenRequired(part:string) : string {
            let newPart = '';
            for (let index = 0; index < part.length; index++) {
                const curChar = part[index];
                const prevChar = index > 0 ? part[index-1] : '';
                const nextChar = index < part.length-1 ? part[index+1] : '';

                if (/[\+|\-|\*|\/|%|!|\^]+/.test(curChar)) {
                    if (!/\s/.test(prevChar)) {
                        newPart += ' ' ;
                    }
                    newPart += curChar;
                    if (!/\s/.test(nextChar)) {
                        newPart += ' ';
                    }
                } else {
                    if (['<'].includes(curChar)) {
                        if (!/\s/.test(prevChar)) {
                            newPart += ' ' ;
                        }
                    }
                    newPart += curChar;
                }
            }
            return newPart;
        }

        
        function getClosingBlockIndex(lineText: string,blockChar: string,startIndex: number): number  {

            //console.log(`startIndex "${startIndex}" lineText "${lineText.substring(startIndex)}"`);

            if (blockChar == `'`) return lineText.substring(startIndex).indexOf(`'`);

                let openCount = 0;
                for (let i = startIndex; i < lineText.length; i++) {
                    const char = lineText[i];
                    if (char == '(') {
                    openCount++;
                    } else if (char == ')') {
                        if (openCount === 0) return i;
                        openCount--;
                    }
                }
            return -1;
        }

        // function evalInsideBrackets(evalText:string) : [string,EvalStatementResult] {
        //     const closingIndex = getClosingBracketIndex(evalText,0);
        //     const insideBracketsText = evalText.substring(1,closingIndex-1); //get part inside brackets to evaluate
        //     evalText = evalText.substring(closingIndex+1);
        //     console.log(`insideBracketsText "${insideBracketsText}" remainingPart "${evalText}"`);
        //     return [evalText,evalPart(insideBracketsText)]; //recursive call
        // }

        const evalBlock = (evalText:string) : string | EvalStatementResult => {
            //const blocks: string[] = [];
            let currentBlock: string = '';
            //let remainBlock: string = '';

            let i = 0;
            while (i < evalText.length) {
                const char = evalText[i];

                if (char == '(' ) {
                    let blockResult;
                    let funcName: string = '';
                    let inputDataType,returnDataType : dataTypeCheck = dataTypeCheck.any;
                    const closingIndex = getClosingBlockIndex(evalText,char,i+1);
                    if (closingIndex == -1) 
                        return {valid: false,notValidText: `Unmatched opening parentheses '${char}'.`};
                    //const upToBracketsText = currentBlock.substring(0,i+1);
                    const insideBracketsText = evalText.substring(i+1,closingIndex);
                    const funcInputDataType = this.getFunctionDataType(currentBlock);
                    if (funcInputDataType != undefined) {  
                        [funcName,inputDataType,returnDataType] = funcInputDataType;
                    } 

                    console.log(`insideBracketsText "${insideBracketsText}"`);

                    blockResult = evalPart(insideBracketsText,inputDataType,returnDataType); //recursive call
                    if (typeof blockResult != "string")
                        return blockResult;

                    currentBlock = currentBlock.substring(0,currentBlock.length-funcName.length) + ' ' + blockResult + ' ';
                    i = i + insideBracketsText.length + 2;

                    console.log(`currentBlock "${currentBlock}" funcName "${funcName}"`);
                        //return {valid: false,notValidText: 'Cannot resolve data type of block.'};

  
                } else if (char == `'`) {
                    const closingIndex = getClosingBlockIndex(evalText,char,i+1);
                    console.log(`closingIndex "${closingIndex}" remain "${evalText.substring(i)}" currentBlock "${currentBlock}"`);
                    if (closingIndex == -1) 
                        return {valid: false,notValidText: `Unmatched opening string '${char}'.`};

                    const insideBracketsText = evalText.substring(i+1,closingIndex+i+1);
                    console.log(`insideBracketsText "${insideBracketsText}" remain "${evalText.substring(i)}"`);

                    const strTextValue = insideBracketsText.substring(0,5) == '<lst>' ? `'list'` : `'string'`;

                    currentBlock = currentBlock.substring(0,currentBlock.length) + ' ' + strTextValue + ' ';
                    i = i + insideBracketsText.length + 2;
                } else {
                    currentBlock += char;
                    i++;
                }
            }
            console.log(`evalBlock Returns "${currentBlock}"`);
            return currentBlock;
        }



        const evalPart = (partToEval:string,evalDataType?: dataTypeCheck, expectDataType?: dataTypeCheck) : string | EvalStatementResult => {

            function handleReturnType(returnType:dataTypeCheck) {
                const compareResult = CompareDataType(returnType,evalDataType || dataTypeCheck.noCheck);
                if (!compareResult) return {valid: false,notValidText: `Invalid data type match.`}

                switch (expectDataType) {
                    case dataTypeCheck.text:
                        return `''`      
                    // case dataTypeCheck.number:
                    // case dataTypeCheck.bool:
                    //     return '1'
                    default:
                        return '1'
                } 
            }

            //let resultSoFar: EvalStatementResult;
            let checkDataType: dataTypeCheck = dataTypeCheck.any;
            let curPart = partToEval.trim();

            const blockCheckResult = evalBlock(curPart);
            if (typeof blockCheckResult == "string") 
                curPart = blockCheckResult;
            else
                return blockCheckResult;
           

            // if (curPart[0] == '(') {
            //     [curPart,resultSoFar] = evalInsideBrackets(curPart);
            //     if (!resultSoFar.valid) return resultSoFar;
            // }

            const logicalOperatorSplit = /\s*(?:\bAnd\b|\bOr\b|&|\|)\s*/i;
            const parts = curPart.split(logicalOperatorSplit);
            const ops: wordType[] = [];

            //split into parts separated by logical operators
            for (let j = 0; j < parts.length; j++) {
                const part = addWhiteSpaceWhenRequired(parts[j]); //.replace(/[()]/g, '')

                if (part == '') 
                    return {valid: false,notValidText: 'Expression expected.'};
                
                // const firstBracketindex = part.indexOf('(');
                // if (firstBracketindex > -1) { //check for function
                //     const upToBracketsText = curPart.substring(0,firstBracketindex);
                //     const funcDateType = this.getFunctionDataType(upToBracketsText);
                //     if (funcDateType) {
                //         checkDataType = funcDateType as dataTypeCheck;
                //     }
                // } else


                checkDataType = setDataTypeFromPattern(part);

                const slitByWhiteSpace = part.split(/[\s]+(?=(?:[^']*'[^']*')*[^']*$)/).filter(str => str !== ""); //also split on datatypes
                console.log(`part "${part}"`);
                const upper = slitByWhiteSpace.length-1;
                for (let i = 0; i < slitByWhiteSpace.length; i++) {
                    const word = slitByWhiteSpace[i];
                    if (word == '') continue;


                    const wordT = getWordType(word);
                    if (!wordT) {
                        return {valid: false,notValidText: `Invalid syntax on "${word}".`};
                    }

                    if (upper == 0) {
                        // switch (wordT.dataType) {
                        //     case dataTypeCheck.text:
                        //         return `""`; //there is only one part which is a string. Return just a emply string      
                        //     case dataTypeCheck.number:
                        //     case dataTypeCheck.bool:
                        //         return '1'
                        //     default:
                        //         break;
                        // }
                        return handleReturnType(wordT.dataType);
                    }


                    const lastChar = word.charAt(word.length-1);
                    if (wordT.name == 'identifier' &&  ['.',':'].includes(lastChar))
                        return {valid: false,notValidText: 'Incomplete identifier.'};

                    console.log(`word: "${word}" upper: "${slitByWhiteSpace[upper]}" index: "${i}" upperIndex: "${upper}"`);
                    const prevWord = ops[ops.length-1];

                    ops.push(wordT);

                    if (i == upper && upper > 0) { //Last word
                        if (['dataType','comparisonOperators','assignmentOperators','equalSign','arithmeticOperators'].includes(wordT.name)) //the expression can't finish on one of these!    
                            return {valid: false,notValidText: 'Expression expected.'};
                    }


                    if (i == 0 && upper > 0) { //first word
                        if (!['identifier','number','booleanOrNull'].includes(wordT.name) && !['-','!'].includes(word))
                            return {valid: false,notValidText: 'Invalid expression.'}; //Expression must start with an identifier or number.
                        else {

                            switch (wordT.name) {
                                case 'number':
                                    //mustBeComparision = true
                                    checkDataType = wordT.dataType;
                                case 'booleanOrNull':
                                    //mustBeComparision = true
                                    checkDataType = wordT.dataType;   
                                default:
                                    break;
                            }
                            continue; //move to next word
                        }
                    } else {

                        // if (mustBeComparision && ['dataType','assignmentOperators'].includes(wordT.name))
                        //     return {valid: false,notValidText: 'Connot be a data type declaration or assignment operator.'};

                        if (mustBeAssignment && ['dataType','comparisonOperators'].includes(wordT.name))
                            return {valid: false,notValidText: 'Connot be a comparison operator.'};

                        console.log(`curMatch: "${wordT.name}" checkDataType: "${checkDataType}" wordT.dataType: "${wordT.dataType}" prevWord.dataType: "${prevWord.dataType}"`);
                        
                        if (!CompareDataType(wordT.dataType,checkDataType) && word != `'list'`)
                            return {valid: false,notValidText: 'Invalid data type.'}; //<lst>


                        if (prevWord) {
                            if (prevWord.dataType == wordT.dataType && ![dataTypeCheck.noCheck,dataTypeCheck.any].includes(prevWord.dataType))
                                return {valid: false,notValidText: 'Missing operator.'};
                        }

                        // if (wordT.name == 'comparisonOperators') {
                        //     mustBeComparision = true;
                        //     continue; //move to next word
                        // }
                        if (['assignmentOperators','dataType'].includes(wordT.name)) {
                            mustBeAssignment = true;
                            continue; //move to next word
                        }

                        //SetCheckDataType(wordT);
                        switch (wordT.name) {
                            case 'number':
                                checkDataType = wordT.dataType;
                                break;
                            case 'booleanOrNull':
                                checkDataType = wordT.dataType;
                                break;
                            case 'arithmeticOperators':
                                checkDataType = dataTypeCheck.number;
                                break;
                            default:
                                break;
                        }
                    }
                }
                
            }
            // if (mustBeComparision)
            //     return '1'; //Just return a string with a boolean value
            // if (checkDataType == dataTypeCheck.number)
            //     return '1'

            return handleReturnType(checkDataType);
            //return {valid: true,notValidText: ''};
        }


        //start top level parse here
        const firstLineOnly = statement.split(/[\r\n]+/)[0];

        const finalResult = evalPart(firstLineOnly);
        if (typeof finalResult == "string")
            return {valid: true,notValidText: ''};
        else 
            return finalResult;

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

    private checkBalancedBrackets(lineText: string): true | { message: string; position: number } {
        // ,
        // {
        //   "opening": "<",
        //   "closing": ">",
        //   "name": "angle brackets"
        // }


        for (const pair of this.closingPairs) {
            let openCount = 0;
            //console.log(`pair "${pair.name}"`);
            for (let i = 0; i < lineText.length; i++) {
                if (lineText[i] == pair.opening) {
                openCount++;
                } else if (lineText[i] == pair.closing) {
                    if (openCount === 0) {
                        //console.log(`Unmatched closing ${pair.name} '${pair.closing}'. position "${i}"`);
                        return { message: `Unmatched closing ${pair.name} '${pair.closing}'.`, position: i };
                    }
                    openCount--;
                }
            }
            if (openCount > 0) {
                let unmatchedPos = -1;
                let count = openCount;
                for (let i = lineText.length - 1; i >= 0 && count > 0; i--) {
                    if (lineText[i] == pair.opening) {
                        count--;
                        if (count === 0) unmatchedPos = i;
                    }
                }
                return { message: `Unmatched opening ${pair.name} '${pair.opening}'.`, position: unmatchedPos };
            }
        }
        return true;
    }
}