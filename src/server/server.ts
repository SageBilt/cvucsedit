import { createConnection, 
        TextDocuments, 
        ProposedFeatures, 
        InitializeParams, 
        CompletionItem, 
        CompletionItemKind, 
        TextDocumentSyncKind, 
        Connection, 
        Diagnostic, 
        DiagnosticSeverity, 
        InsertTextFormat,
        TextDocumentPositionParams,
        Position,
        Range,
        HoverParams,
        Hover
       } from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import * as fs from 'fs';
import * as path from 'path';
import { SystemVariable, ControlStructure, SpecialObject, SystemData , SyntaxData , SystemFunctions, VariableTypes } from '.././interfaces';

// Define an interface for the language configuration
interface LanguageConfig {
  languageId: string;
  systemJsonPath: string;
  syntaxJsonPath: string;
  controlStructuresJsonPath: string;
  specialObjectsJsonPath: string;
}


class LanguageServer {
  private connection: Connection;
  private documents: TextDocuments<TextDocument>;
  private languageId: string;
  private keywords: string[];
  private datatypes: VariableTypes[];
  private variables: SystemVariable[];
  private functions: SystemFunctions[];
  private valueTypes: string[];
  private dimTypes: string[];
  private forEachTypes: string[];
  private controlStructures: ControlStructure[];
  private specialObjects: SpecialObject[];

  constructor(config: LanguageConfig) {
    this.connection = createConnection(ProposedFeatures.all);
    this.connection.console.log("Starting language server...");
    this.documents = new TextDocuments(TextDocument);
    this.languageId = config.languageId;

    const systemData: SystemData = JSON.parse(fs.readFileSync(config.systemJsonPath, 'utf8'));
    this.keywords = systemData.keywords || [];
    this.variables = systemData.variables || [];
    this.functions = systemData.functions || [];
    this.datatypes = systemData.types || [];

    const syntaxData: SyntaxData = JSON.parse(fs.readFileSync(config.syntaxJsonPath, 'utf8'));
    this.valueTypes = syntaxData.valueTypes || [];
    this.dimTypes = syntaxData.dimTypes || [];
    this.forEachTypes = syntaxData.forEachTypes || [];

    const controlData = JSON.parse(fs.readFileSync(config.controlStructuresJsonPath, 'utf8'));
    this.controlStructures = controlData.controlStructures || [];

    const specialObjectsData = JSON.parse(fs.readFileSync(config.specialObjectsJsonPath, 'utf8'));
    this.specialObjects = specialObjectsData.specialObjects || [];

    this.initialize();
    this.setupCompletion();
    this.setupHover();
    this.setupDocumentValidation();

    this.documents.listen(this.connection);
    this.connection.listen();
  }

  private initialize() {
    this.connection.onInitialize((params: InitializeParams) => {
      return {
        capabilities: {
          textDocumentSync: TextDocumentSyncKind.Incremental,
          completionProvider: {
            resolveProvider: true
            ,triggerCharacters: ['.', ':', '=']
          }
          ,
          hoverProvider: true
        }
      };
    });
  }

  private AddSpecialObjects(items: CompletionItem[]) {
    this.specialObjects.forEach(spObj => {
      items.push({
        label: spObj.prefix,
        kind: CompletionItemKind.Class,
        detail: `${spObj.prefix} (${spObj.description})`
      });
    });
  }

  private AddKeywords(items: CompletionItem[]) {
    this.keywords.forEach(kw => {
      items.push({
        label: kw,
        kind: CompletionItemKind.Keyword,
        detail: `${kw} (${this.languageId} keyword)`
      });
    });
  }

  private AddVariables(items: CompletionItem[],parentObject? : string) {
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

  private AddFunction(items: CompletionItem[]) {
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

  private AddDatTypes(items: CompletionItem[]) {
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

  private getWordRangeAtPosition(document: TextDocument, position: Position): Range | undefined {
    const text = document.getText();
    const offset = document.offsetAt(position);
    const wordRegex = /\w+:?/g;

    let match;
    while ((match = wordRegex.exec(text)) !== null) {
      const startOffset = match.index;
      const endOffset = startOffset + match[0].length;
      if (startOffset <= offset && offset <= endOffset) {
        return {
          start: document.positionAt(startOffset),
          end: document.positionAt(endOffset)
        };
      }
    }
    return undefined;
  }

  private setupCompletion() {
    this.connection.onCompletion((params: TextDocumentPositionParams) => {
      let FilterObjProps: boolean = false;

      const document= this.documents.get(params.textDocument.uri) ;
      if (!document) return []; // Return empty array if document isn’t found
      const position = params.position; // Cursor position

      const startOfLine: Position = { line: position.line, character: 0 };
      const cursorPosition: Position = { line: position.line, character: position.character };
      const range: Range = { start: startOfLine, end: cursorPosition };
  
      // Get the text from the start of the line to the cursor
      const linePrefix = document.getText(range);


      const items: CompletionItem[] = [];

      /*Check show only properties for special objects like _M: and _CV: */
      

      for (const spObj of this.specialObjects) {
        const wordRegex = new RegExp(`${spObj.prefix}[^\\s]*$`, 'i');
        //if (linePrefix.endsWith(spObj.prefix)) {
        if (wordRegex.test(linePrefix)) {
          this.AddVariables(items,spObj.prefix);
          FilterObjProps = true;
          break;
        } 
      }


      if (!FilterObjProps){
        this.AddFunction(items);
        this.AddVariables(items);
        this.AddKeywords(items);
        this.AddSpecialObjects(items);
        this.AddDatTypes(items);
      }

      return items;
    });
   

    this.connection.onCompletionResolve((item) => {
      // const variable = this.variables.find(v => v.name === item.label);
      // const Func = this.functions.find(v => v.name === item.label);
      // if (variable && item.kind === CompletionItemKind.Variable) {
      //   item.detail = `${variable.name} (${variable.type} variable)`;
      //   item.documentation = {
      //     kind: 'markdown',
      //     value: `**${variable.name}**\n\n${variable.description}\n\n- **Type**: ${variable.type}\n- **Valid Range**: ${variable.validRange}\n- **Applies To**: ${variable.appliesTo}\n- **Values**: ${variable.values}\n- **Visibility**: ${variable.visibility}`
      //   };
      // } else if (Func && item.kind === CompletionItemKind.Function) {
      //   //item.insertText = new SnippetString(Func.value); // Use the snippet syntax from your data
      //   //item.insertTextFormat = InsertTextFormat.Snippet;
      //   item.documentation = {
      //     kind: 'markdown',
      //     value: `**${Func.name}**\n\n${Func.description}`
      //   }
      // } else if (item.kind === CompletionItemKind.Keyword) {
      //   item.documentation = `Keyword: ${item.label}.`;
      // }
      return item;
    });
  }

  private setupHover() {
    this.connection.onHover((params: HoverParams): Hover | undefined => {
      const document = this.documents.get(params.textDocument.uri);
      if (!document) return undefined;

      const position = params.position;
      const wordRange = this.getWordRangeAtPosition(document, position); // Helper to get word under cursor
      if (!wordRange) return undefined;


      const word = document.getText(wordRange).toUpperCase();
      console.log(`Hover text "${word}"`);

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
    });
  }

  private setupDocumentValidation() {
    this.documents.onDidChangeContent((change) => {
      this.validateTextDocument(change.document);
    });
    this.documents.onDidOpen((event) => {
      this.validateTextDocument(event.document);
    });
  }

  private addDiagnostic(diagnostics: Diagnostic[], line: number, startChar: number, endChar: number, message: string, severity: DiagnosticSeverity = DiagnosticSeverity.Error) {
    diagnostics.push({
      severity,
      range: { start: { line, character: startChar }, end: { line, character: endChar } },
      message,
      source: this.languageId
    });
  }

  private validateTextDocument(document: TextDocument): void {
    const diagnostics: Diagnostic[] = [];
    const text = document.getText();
    const lines = text.split('\n');
    const stack: { keyword: string; line: number }[] = [];

    const openingKeywords = this.controlStructures.map(cs => cs.openingKeyword).join('|');
    const closingKeywords = this.controlStructures.map(cs => cs.closingKeyword).join('|');
    const openingRegex = new RegExp(`^(${openingKeywords})\\b`, 'i');
    const closingRegex = new RegExp(`^(${closingKeywords})\\b`, 'i');

    for (let i = 0; i < lines.length; i++) {
      const lineWithoutComments = lines[i].split(';')[0].trim();
      if (!lineWithoutComments) continue;

      const bracketCheck = this.checkBalancedBrackets(lineWithoutComments);
      if (bracketCheck !== true) {
        this.addDiagnostic(
          diagnostics,
          i,
          bracketCheck.position,
          bracketCheck.position + 1,
          bracketCheck.message
        );
      }

      const openingMatch = lineWithoutComments.match(openingRegex);
      if (openingMatch) {
        const keyword = openingMatch[1].toLowerCase();
        const structure = this.controlStructures.find(cs => cs.openingKeyword.toLowerCase() === keyword)!;
        stack.push({ keyword, line: i });

        if (structure.requiredSuffix) {
          const suffixRegex = new RegExp(`${structure.requiredSuffix}\\s*$`, 'i');
          if (!lineWithoutComments.match(suffixRegex)) {
            this.addDiagnostic(
              diagnostics,
              i,
              0,
              lines[i].length,
              `'${structure.openingKeyword}' statement must end with '${structure.requiredSuffix}'.`
            );
          } else {
            const conditionMatch = lineWithoutComments.match(new RegExp(`^${structure.openingKeyword}\\s+(.+?)\\s+${structure.requiredSuffix}\\s*$`, 'i'));
            if (!conditionMatch) {
              this.addDiagnostic(
                diagnostics,
                i,
                0,
                lines[i].length,
                `'${structure.openingKeyword}' statement must have a condition before '${structure.requiredSuffix}'.`
              );
            } else {
              const condition = conditionMatch[1].trim();
              if (!condition) {
                this.addDiagnostic(
                  diagnostics,
                  i,
                  structure.openingKeyword.length + 1,
                  lineWithoutComments.length - structure.requiredSuffix.length - 1,
                  `Condition in '${structure.openingKeyword}' statement cannot be empty.`
                );
              } else if (!this.isValidCondition(condition)) {
                this.addDiagnostic(
                  diagnostics,
                  i,
                  structure.openingKeyword.length + 1,
                  lineWithoutComments.length - structure.requiredSuffix.length - 1,
                  `'${condition}' is not a valid condition. Expected a variable, object.property (with optional : prefixes or inline {variable}), or a comparison (e.g., x > 5) with optional arithmetic expressions and logical operators.`
                );
              }
            }
          }
        }

        if (structure.customValidation === 'forEachValidation') {
          const match = lineWithoutComments.match(/^For\s+Each\s+([A-Za-z|_?][A-Za-z0-9|_?]*(?:\s*(?:\||\bOR\b)\s*[A-Za-z|_?][A-Za-z0-9|_?]*)*)\s+([A-Za-z][A-Za-z0-9]*)/i);
          if (!match) {
            this.addDiagnostic(
              diagnostics,
              i,
              0,
              lines[i].length,
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
                lineWithoutComments.indexOf(type),
                lineWithoutComments.indexOf(type) + type.length,
                `'${type}' is not a valid For Each type. Expected one of: ${this.forEachTypes.join(', ')}`
              );
            }
          }
        }
      } else if (lineWithoutComments.match(/^[A-Za-z_:][A-Za-z0-9_:]*\s*(?:=|\:=|=[\+\-\*\/]=)/i)) {
        const assignmentMatch = lineWithoutComments.match(/^(.+?)\s*$/i);
        if (assignmentMatch) {
          const assignment = assignmentMatch[1].trim();
          if (!this.isValidCondition(assignment)) {
            this.addDiagnostic(
              diagnostics,
              i,
              0,
              lines[i].length,
              `'${assignment}' is not a valid assignment or expression.`
            );
          }
        }
      } else if (closingRegex.test(lineWithoutComments)) {
        const closingMatch = lineWithoutComments.match(closingRegex)!;
        const closingKeyword = closingMatch[1].toLowerCase();
        const structure = this.controlStructures.find(cs => cs.closingKeyword.toLowerCase() === closingKeyword)!;

        if (!stack.length) {
          this.addDiagnostic(
            diagnostics,
            i,
            0,
            lines[i].length,
            `'${structure.closingKeyword}' without matching opening statement.`
          );
        } else {
          const last = stack.pop()!;
          if (structure.openingKeyword.toLowerCase() !== last.keyword) {
            this.addDiagnostic(
              diagnostics,
              i,
              0,
              lines[i].length,
              `'${structure.closingKeyword}' does not match the last opening statement '${last.keyword}'.`
            );
          }
        }
      } else if (lineWithoutComments.match(/^Else\s*$/i)) {
        const ifStructure = this.controlStructures.find(cs => cs.supportsElse && cs.openingKeyword.toLowerCase() === 'if');
        if (!ifStructure || !stack.length || stack[stack.length - 1].keyword !== 'if') {
          this.addDiagnostic(
            diagnostics,
            i,
            0,
            lines[i].length,
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

    const normalizedUri = decodeURIComponent(document.uri);
    this.connection.sendDiagnostics({ uri: normalizedUri, diagnostics });
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

console.log("🌍 Language server is starting...");
// const ucsmLangServer = new LanguageServer({
//   languageId: 'ucsm',
//   systemJsonPath: path.join(__dirname, '../../Languages/data/system.json'),
//   syntaxJsonPath: path.join(__dirname, '../../Languages/ucsm/data/ucsm_syntax.json'),
//   controlStructuresJsonPath: path.join(__dirname, '../../Languages/ucsm/data/control_structures.json'),
//   specialObjectsJsonPath: path.join(__dirname, '../../Languages/ucsm/data/special_objects.json')
// });

// const ucsjsLangServer = new LanguageServer({
//   languageId: 'javascript',
//   systemJsonPath: path.join(__dirname, '../../Languages/data/system.json'),
//   syntaxJsonPath: path.join(__dirname, '../../Languages/ucsm/data/ucsm_syntax.json'),
//   controlStructuresJsonPath: path.join(__dirname, '../../Languages/ucsm/data/control_structures.json'),
//   specialObjectsJsonPath: path.join(__dirname, '../../Languages/ucsm/data/special_objects.json')
// });


const languageId = process.argv[2]; // Get language ID from command-line argument
if (!languageId) {
  console.error("No language ID provided. Usage: node server.js <languageId>");
  process.exit(1);
}

const configs: { [key: string]: LanguageConfig } = {
  ucsm: {
    languageId: 'ucsm',
    systemJsonPath: path.join(__dirname, '../../Languages/data/system.json'),
    syntaxJsonPath: path.join(__dirname, '../../Languages/ucsm/data/ucsm_syntax.json'),
    controlStructuresJsonPath: path.join(__dirname, '../../Languages/ucsm/data/control_structures.json'),
    specialObjectsJsonPath: path.join(__dirname, '../../Languages/ucsm/data/special_objects.json'),
  },
  javascript: {
    languageId: 'javascript',
    systemJsonPath: path.join(__dirname, '../../Languages/data/system.json'),
    syntaxJsonPath: path.join(__dirname, '../../Languages/ucsm/data/ucsm_syntax.json'),
    controlStructuresJsonPath: path.join(__dirname, '../../Languages/ucsm/data/control_structures.json'),
    specialObjectsJsonPath: path.join(__dirname, '../../Languages/ucsm/data/special_objects.json'),
  },
};

const config = configs[languageId];
if (!config) {
  console.error(`Unsupported language ID: ${languageId}`);
  process.exit(1);
}

new LanguageServer(config);