import { createConnection, 
        TextDocuments, 
        ProposedFeatures, 
        InitializeParams, 
        TextDocumentSyncKind, 
        Connection, 
        Diagnostic, 
        DiagnosticSeverity, 
        TextDocumentPositionParams,
        CompletionItem,
        HoverParams,
        Hover,
        Position,
        Range,
        DefinitionParams,
        Location,
        ReferenceParams,
        SemanticTokensBuilder, // Add this
        SemanticTokensLegend,  // Add this
        SemanticTokensParams,  // Add this
       } from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { docClassRef, LanguageConfig, UCSJSSystemMethod, UCSJSSystemConstants } from '.././interfaces';
import { ucsmCompletion } from './ucsmCompletion';
import { ucsjsCompletion } from './ucsjsCompletion';
import { ucsmValidation } from './ucsmValidation';
import * as CONSTANTS from '.././constants';


class LanguageServer {
  private connection: Connection;
  private documents: TextDocuments<TextDocument>;
  private languageId: string;
  private ucsmComp: ucsmCompletion;
  private ucsjsComp: ucsjsCompletion;
  private ucsmValid: ucsmValidation;
  private semanticTokensLegend: SemanticTokensLegend = {
    tokenTypes: [
      'UCSJSLibrary', // Custom variable for your language
      'specialObject',  // For special objects like _M:, _CV:
    ],
    tokenModifiers: [
      'declaration',    // e.g., where a variable is defined
      'readonly',       // e.g., constants
    ]
  };


  constructor(config: LanguageConfig) {
    this.connection = createConnection(ProposedFeatures.all);
    this.connection.console.log("Starting language server...");
    this.documents = new TextDocuments(TextDocument);
    this.languageId = config.languageId;

    this.ucsmComp = new ucsmCompletion(this.languageId,this.connection);
    this.ucsjsComp = new ucsjsCompletion(this.languageId,this.connection);

    this.ucsmValid = new ucsmValidation(this.languageId,this.connection);


    this.initialize();
    this.setupCompletion();
    this.setupHover();
    this.setDefinitionProvider();
    this.setReferenceProvider();
    this.setupDocumentValidation();
    this.setupClientNotification();
    this.setupSemanticTokens(); // Add this

    this.documents.listen(this.connection);
    this.connection.listen();
  }

  private initialize() {
    this.connection.onInitialize((params: InitializeParams) => {
      const dynamicData = params.initializationOptions || {};

      this.ucsmComp.dynamicData = dynamicData;
      this.ucsjsComp.dynamicData = dynamicData;
      this.ucsmValid.dynamicData = dynamicData;
      console.log(`partDefs.length ${dynamicData.partDefs.length}`);


      return {
        capabilities: {
          textDocumentSync: TextDocumentSyncKind.Incremental,
          completionProvider: {
            //resolveProvider: true,
            triggerCharacters: ['.', ':', '=']
          }
          ,
          hoverProvider: true,
          definitionProvider: true,
          referencesProvider: true,
          semanticTokensProvider: { // Add semantic tokens capability
            legend: this.semanticTokensLegend,
            full: true, // Support full document tokenization
          }
        }
      };
    });
  }


  private getMethodParamType(methods:UCSJSSystemMethod[], linePrefix: string, fullLine: string,cursorPosition: Position): {paramType:string,insideStr:boolean} | undefined {

    const lineParamCount = this.ucsmValid.getParamCount(fullLine);
     //this.connection.console.log(`paramCount "${lineParamCount}"`);
          
      // Iterate through all UCSMSyntaxMethods to find a match
      for (const methodDef of methods) {
        const methodName = methodDef.name;
        

        const methodRegex = new RegExp(`\\b${methodName}\\s*\\(([^)^\\.]*)$`);
        const match = linePrefix.match(methodRegex);
        //this.connection.console.log(`fullLine "${fullLine}"`);

        if (!match) continue; // Skip if this method doesn’t match
        const methodParamCount = this.ucsmValid.getParamCount(methodDef.value);
        if (methodParamCount != lineParamCount) continue; // Skip if this method if different number of parameters

        //this.connection.console.log(`match "${match[1]}"`);
        const argsSoFar = match[1]; // Content inside parentheses up to cursor
        const methodStart = linePrefix.lastIndexOf(match[0]); // Start of method call
        const argsStart = methodStart + methodName.length + 1; // Position after '('

        // Split arguments by comma, handling strings and nested content
        let paramIndex = 0;
        let currentPos = argsStart;
        let inString = false;
        let quoteChar = '';
        let paramCount = 0;

        for (let i = 0; i < argsSoFar.length; i++) {
            const char = argsSoFar[i];
            const absolutePos = argsStart + i;

            if (inString) {
              //this.connection.console.log('{'+char+'}');
              if (char === quoteChar && argsSoFar[i - 1] !== '\\') {
                  inString = false; // End of string
              }
            } else {
              if (char === '"' || char === "'") {
                  inString = true;
                  quoteChar = char;
              } else if (char === ',' && absolutePos < cursorPosition.character) {
                //this.connection.console.log(`argsSoFar "${argsSoFar[i - 1]}"`);
                  paramCount++; // Move to next parameter
              }
            }

            //this.connection.console.log(`Remaining "${linePrefix.substring(absolutePos)}" absolutePos "${absolutePos}" character "${cursorPosition.character}"`);
            if (absolutePos === cursorPosition.character - 1) {
            paramIndex = paramCount;
            break;
            }
        }

        
        // Check if cursor is within the method call and parameters are still open
        const isInside = paramIndex >= 0 && cursorPosition.character >= argsStart && !argsSoFar.match(/\)$/);
        //this.connection.console.log(`paramIndex "${paramIndex}" argsStart "${argsStart}" character "${cursorPosition.character}"`);
        //this.connection.console.log(`isInside "${isInside}" paramIndex "${paramIndex}" argsStart "${argsStart}"`);

        if (isInside) {
            // Determine the DataType based on paramIndex
            const dataType =
            paramIndex < methodDef.parameterDef.length
                ? methodDef.parameterDef[paramIndex].DataType
                : undefined; 
            if (dataType)
              return {paramType:dataType,insideStr:inString} ;
        }
      }

  }  

  private getCursorPosition(position: Position) : Position {
    return { line: position.line, character: position.character };
  }

  private getLineTextToCursor(document: TextDocument,position: Position,cursorPosition: Position) : string[] {
    const startOfLine: Position = { line: position.line, character: 0 };
    const rangeToCursor: Range = { start: startOfLine, end: cursorPosition };
    const endPostion: Position = { line: position.line, character: Number.MAX_SAFE_INTEGER };
    const rangeToEnd: Range = { start: startOfLine, end: endPostion };
    const linePrefix = document.getText(rangeToCursor);
    const fullLine = document.getText(rangeToEnd);
    return [linePrefix,fullLine];
  }

  setupCompletion() {
    this.connection.onCompletion((params: TextDocumentPositionParams) => {
      let items: CompletionItem[] = [];
  

      const document= this.documents.get(params.textDocument.uri) ;
      if (!document) return []; // Return empty array if document isn’t found
      const position = params.position; // Cursor position
      const cursorPosition: Position = this.getCursorPosition(position);


      // const startOfLine: Position = { line: position.line, character: 0 };
      
      // const rangeToCursor: Range = { start: startOfLine, end: cursorPosition };

      // const endPostion: Position = { line: position.line, character: Number.MAX_SAFE_INTEGER };
      // const rangeToEnd: Range = { start: startOfLine, end: endPostion };

  
      // // Get the text from the start of the line to the cursor
      // const linePrefix = document.getText(rangeToCursor);
      // const fullLine = document.getText(rangeToEnd);
      const [word,wordRange,prefixWord] = this.getWordAtPosition(document, position);
      const [linePrefix,fullLine] = this.getLineTextToCursor(document,position,cursorPosition);
      console.log(`linePrefix"${linePrefix}" word"${word}" prefixWord "${prefixWord}"`);

      let FilterObjProps: boolean = false;
      const showDataType = this.languageId == 'javascript' 
                                      ? this.getMethodParamType(this.ucsjsComp.ucsjsMethods,linePrefix, fullLine, cursorPosition )
                                      : {paramType:'All',insideStr:false};

   
      if (showDataType) {
        this.connection.console.log(`method parameter data type "${showDataType.paramType}" inStr "${showDataType.insideStr}"`);

        if (showDataType.paramType == 'materials' || prefixWord == 'MATID' && !word) {
          this.ucsmComp.AddMaterials(items,showDataType.insideStr);
          return items;
        } else if (this.languageId == 'ucsm' && prefixWord == 'CONSTID') {
          this.ucsmComp.AddConstructions(items,'',false);
          return items;
        } else if (showDataType.paramType == 'ucsmSyntax' || this.languageId == 'ucsm') {


          /*Check show only properties for special objects like _M: and _CV: */
          for (const spObj of this.ucsmComp.specialObjects) {
              const wordRegex = new RegExp(`${spObj.prefix}[^\\s]*$`, 'i');
              //if (linePrefix.endsWith(spObj.prefix)) {
              if (wordRegex.test(linePrefix)) {
                this.ucsmComp.AddVariables(items,spObj.prefix);
                if (spObj.prefix =='_M:') this.ucsmComp.AddMaterialParams(items);
                if (spObj.prefix =='_CS:') this.ucsmComp.AddConstructionParams(items);
                if (spObj.prefix =='_MS:') this.ucsmComp.AddScheduleParams(items);
                FilterObjProps = true;
                break;
              } 
          }

      
          if (!FilterObjProps && !showDataType.insideStr){
              this.ucsmComp.AddFunction(items);
              this.ucsmComp.AddVariables(items);
              if (this.languageId == 'ucsm') { 
                this.ucsmComp.AddKeywords(items); //Only add keywords in ucsm
              }
              this,this.ucsmComp.AddPartDefs(items);
              this.ucsmComp.AddSpecialObjects(items);
              this.ucsmComp.AddDatTypes(items);
              this.ucsmComp.Addsymbols(items);
              this.ucsmComp.AddObjectClass(items);
              this.ucsmComp.AddObjectType(items);
          }
        } else {
          const split = showDataType.paramType.split('.');


          if (split.length == 2) {
            if (split[0] == 'constants') { //For example 'constants.parameterTypes'
              const key = split[1] as keyof UCSJSSystemConstants;
              this.ucsjsComp.AddConstants(items,this.ucsjsComp.ucsjsConstants[key],split[1]); 
            } 
          } else {
            //this.connection.console.log(`Javascript method parameter data type "${showDataType}"`);
            if (showDataType.paramType == 'any')
              this.ucsjsComp.AddObjects(items);
            //else if (showDataType == 'string')
            //  this.ucsjsComp.AddAllConstants(items); 
          }
        }
      } else if (this.languageId == 'javascript') {

        if (this.ucsjsComp.isObject(items,linePrefix)) 
           return items;
        if (this.ucsjsComp.isLibraryClassInstances(items,linePrefix))
          return items;


        this.ucsjsComp.AddMethods(items);
        this.ucsjsComp.AddAllConstants(items); 
        this.ucsjsComp.AddObjects(items);
        this.ucsjsComp.AddFunctions(items);
        this.ucsjsComp.AddLibraryClassInstances(items);
      }



      return items;
    });


    // this.connection.onCompletionResolve((item) => {
    //   //if (item.)
    //   return item;
    // });
  }

  // private getWordRangeAtPosition(document: TextDocument, position: Position): Range | undefined {
  //   const text = document.getText();
  //   const offset = document.offsetAt(position);
  //   const wordRegex = /\w+:?/g;

  //   let match;
  //   while ((match = wordRegex.exec(text)) !== null) {
  //     const startOffset = match.index;
  //     const endOffset = startOffset + match[0].length;
  //     //console.log(`match "${match}" startOffset "${startOffset}" endOffset "${endOffset}"`);
  //     if (startOffset <= offset && offset <= endOffset) {
  //       return {
  //         start: document.positionAt(startOffset),
  //         end: document.positionAt(endOffset)
  //       };
  //     }
  //   }
  //   return undefined;
  // }

  private getWordAtPosition(document: TextDocument,cursorPosition: Position) : [string,Range,string] | [undefined,undefined,string] {
    const startOfLine: Position = { line: cursorPosition.line, character: 0 };
    //const rangeToCursor: Range = { start: startOfLine, end: cursorPosition };
    const endPostion: Position = { line: cursorPosition.line, character: Number.MAX_SAFE_INTEGER };
    const rangeToEnd: Range = { start: startOfLine, end: endPostion };
    //const linePrefix = document.getText(rangeToCursor);
    const fullLine = document.getText(rangeToEnd);

    const offset = document.offsetAt(cursorPosition);
    const cursorChar = cursorPosition.character;
    console.log(`fullLine "${fullLine}"`);

    const wordRegex = this.languageId == 'ucsm' ? /<?[A-Za-z0-9_{}@]+[:>]?/g : /\w+/g;
    const wordDelim = this.languageId == 'ucsm' ? ['.',':','=',':=','(',`('`] : ['.','(',`('`];

    let match;
    let prevMatch = '';
    let prevStartOffset = 0;
    let prevEndOffset = 0;
    while ((match = wordRegex.exec(fullLine)) !== null) {
      const startOffset = match.index;
      const endOffset = startOffset + match[0].length;
      console.log(`match "${match}" startOffset "${startOffset}" endOffset "${endOffset}" offset "${offset}" prevMatch "${prevMatch}"`);
      if (startOffset <= cursorChar && cursorChar <= endOffset) {
        const startOfWord: Position = { line: cursorPosition.line, character: startOffset };
        const endOfWord: Position = { line: cursorPosition.line, character: endOffset };
        const wordRange = Range.create(startOfWord,endOfWord);
        const lastCharOfPrevMatch = prevMatch[prevMatch.length-1];
        const prevChar = this.languageId == 'ucsm' && lastCharOfPrevMatch == ':' ? fullLine[prevEndOffset-1] : fullLine[prevEndOffset];
        const delimText = fullLine.substring(prevEndOffset,startOffset).replaceAll(' ','');
        const prefixWord = wordDelim.includes(delimText) || this.languageId == 'ucsm' && lastCharOfPrevMatch == ':' ? prevMatch : ''; //prevEndOffset == startOffset-1 && propDelim.includes(prevChar) 
        //const prefixWord = this.languageId == 'ucsm' && prevChar == ':' ? prefixWordMatch+':' : prefixWordMatch;
        console.log(`prevChar "${fullLine[prevEndOffset]}" lastCharOfPrevMatch "${lastCharOfPrevMatch}" delimText "${delimText}"`);
        return [match[0],wordRange,prefixWord];
      }
      prevMatch = match[0];
      //prevStartOffset = startOffset;
      prevEndOffset = endOffset;
    }

    return [undefined,undefined,prevMatch];
  }

  setupHover() {
      this.connection.onHover((params: HoverParams): Hover | undefined => {
        const document = this.documents.get(params.textDocument.uri);
        if (!document) return undefined;
    
        const position = params.position;

        //const newWorkRange = this.getLineText(document, position);
        //const wordRange = this.getWordRangeAtPosition(document, position); // Helper to get word under cursor
        //if (!wordRange) return undefined;

        const [word,wordRange,prefixWord] = this.getWordAtPosition(document, position);//
        if (!word && !wordRange) return undefined; 
        // const word = document.getText(wordRange).toUpperCase();
        // if (!word) return undefined;
        console.log(`Hover text "${word}" prefixWord "${prefixWord}"`);

        const cursorPosition: Position = this.getCursorPosition(position);
        const [linePrefix,fullLine] = this.getLineTextToCursor(document,position,cursorPosition);

        const showDataType = this.languageId == 'javascript' 
                                        ? this.getMethodParamType(this.ucsjsComp.ucsjsMethods,linePrefix, fullLine, cursorPosition )
                                        : {paramType:'All',insideStr:false};
    
        if (showDataType) {
          this.connection.console.log(`Hover parameter "${word}" -> data type "${showDataType.paramType}"`);
  
          if (showDataType.paramType == 'materials' || prefixWord == 'MATID' && !isNaN(Number(word))) {
            return this.ucsmComp.getHoverMaterialFromID(word);
          } else if (this.languageId == 'ucsm' && prefixWord == 'CONSTID') {
            return this.ucsmComp.getHoverConstructionFromID(word);
          } else if (showDataType.paramType == 'ucsmSyntax' || this.languageId == 'ucsm') {
            const ucsmhover = this.ucsmComp.getHoverWord(word.toUpperCase(), wordRange, prefixWord.toUpperCase());
            if (ucsmhover) return ucsmhover;  
          } 
        } else                     
          return this.ucsjsComp.getHoverWord(word, wordRange, prefixWord);

      });
  }

  private findSymbolAtPosition(doc: TextDocument, pos: Position): string | null {
    const line = doc.getText({ start: { line: pos.line, character: 0 }, end: { line: pos.line + 1, character: 0 } });
    const offset = doc.offsetAt(pos);
    //const wordRegex = /^\s*(?<![If|While]\s+)[A-Za-z_{}:][A-Za-z0-9_{}@\\.:]*?(?:<(crncy|meas|deg|int|bool|dec|text|style|desc)?>)?\s*:?=\s*/i;
    const wordRegex = /\w+/g;
    let match;
    //console.log(`Line "${line}" character "${pos.character}"`);
    while ((match = wordRegex.exec(line)) !== null) {
      if (match.index <= pos.character && pos.character <= match.index + match[0].length) {
        return match[0];
  
      }
    }
    return null;
  }

  setDefinitionProvider() {
    this.connection.onDefinition((params: DefinitionParams): Location | null => {
      const uri = params.textDocument.uri;
      const position = params.position;
    
      // Get the document text (assumes you’re tracking open documents)
      const document = this.documents.get(uri);
      if (!document) return null;
    
      // Identify the symbol at the position
      const [symbol,wordRange,prefixWord] = this.getWordAtPosition(document, position);
      //const symbol = this.findSymbolAtPosition(document, position);
      if (!symbol) return null;

      console.log(`symbol "${symbol}" prefixWord "${prefixWord}"`);
      const definition = this.languageId == 'ucsm' ? this.ucsmComp.getReferences(symbol)[0] : this.ucsjsComp.getDefinition(symbol, prefixWord);
      if (!definition) return null;
    
     //console.log(`uri "${definition.uri}" uri "${params.textDocument.uri}"`);
      // console.log(`StartLine "${definition.range.start.line}" StartChar "${definition.range.start.character}"`); 
      // console.log(`EndLine "${definition.range.end.line}" EndChar "${definition.range.end.character}"`);  
      //Return the location
      return {
        uri: definition.uri,
        range: definition.range
      };
    });
  }

  setReferenceProvider() {
    this.connection.onReferences((params: ReferenceParams) : Location[] | null => {
      const uri = params.textDocument.uri;
      const position = params.position;
    
      // Get the document text (assumes you’re tracking open documents)
      const document = this.documents.get(uri);
      if (!document) return null;
    
      // Identify the symbol at the position
      const [symbol,wordRange,prefixWord] = this.getWordAtPosition(document, position);
      //const symbol = this.findSymbolAtPosition(document, position);
      if (!symbol) return null;

      //console.log(`symbol "${symbol}" prefixWord "${prefixWord}"`);
      if (this.languageId == 'ucsm') {
        return this.ucsmComp.getReferences(symbol);
      } else {
        const jsRefs =  this.ucsjsComp.getReferences(symbol,prefixWord,uri);
        if (jsRefs) 
          return jsRefs;
      }

    return null;
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

  private validateTextDocument(document: TextDocument) {
    let diagnostics: Diagnostic[] = [];
    const text = document.getText();

    if (this.languageId == 'javascript') 
      diagnostics = this.ucsmValid.validateUCSJS(text,this.languageId);
    else {
      this.ucsmComp.updateSymbolTable(document);
      diagnostics = this.ucsmValid.validateUCSM(text,this.languageId);
    }

    //console.log(diagnostics);
    const normalizedUri = decodeURIComponent(document.uri);
    this.connection.sendDiagnostics({ uri: normalizedUri, diagnostics });
  }

  private setupClientNotification() {
    this.connection.onNotification('updateJSLibraryReferences', (params: docClassRef[]) => {

      this.ucsjsComp.classLibraries = params;
      console.log(`Received data updated references for libraries`);
    })
  }

  private tokenTypeIndex(type: string): number {
    return this.semanticTokensLegend.tokenTypes.indexOf(type);
  }

  private setupSemanticTokens() {
    this.connection.languages.semanticTokens.on((params: SemanticTokensParams) => {
      const document = this.documents.get(params.textDocument.uri);
      if (!document) return { data: [] };

      const builder = new SemanticTokensBuilder();
      if (this.languageId == 'javascript') {
        const text = document.getText();
        const lines = text.split('\n');
        let inMultiLineComment = false;

        // Tokenize each line
        for (let line = 0; line < lines.length; line++) {
          //const lineText = lines[line];

          const filteredLine = this.ucsmValid.getUCSJSLineWithoutComment(lines[line],inMultiLineComment);
          if (filteredLine === false) continue
          const lineText = filteredLine.newLine;
          inMultiLineComment = filteredLine.inMultiLineComment;
          //let trimStart = filteredLine.start;

          this.ucsjsComp.classLibraries.forEach(jsLib => {
            let match;
            const customKeywordRegex = new RegExp(`\\b(${jsLib.name})\\b`,'g');
            //console.log(jsLib.name);
            while ((match = customKeywordRegex.exec(lineText)) !== null) {
            builder.push(line,match.index, match[0].length,this.tokenTypeIndex('UCSJSLibrary'),0);
            }
          });
          // Example tokenization logic (customize this based on your language)
          //this.tokenizeLine(lineText, line, builder);
        }
      }

      return builder.build();
    });
  }

  
}

//console.log("🌍 Language server is starting...");


const languageId = process.argv[2]; // Get language ID from command-line argument
if (!languageId) {
  console.error("No language ID provided. Usage: node server.js <languageId>");
  process.exit(1);
}

const configs: { [key: string]: LanguageConfig } = {
  ucsm: {
    languageId: 'ucsm',
    systemJsonPath: CONSTANTS.UCSMSYSTEMJSONPATH,
    syntaxJsonPath: CONSTANTS.UCSMSYNTAXJSONPATH,
    controlStructuresJsonPath: CONSTANTS.UCSMCONTROLSTRUCTURESJSONPATH,
  },
  javascript: {
    languageId: 'javascript',
    systemJsonPath: CONSTANTS.UCSMSYSTEMJSONPATH,
    syntaxJsonPath: CONSTANTS.UCSMSYNTAXJSONPATH,
    controlStructuresJsonPath: CONSTANTS.UCSMCONTROLSTRUCTURESJSONPATH,
  },
};

const config = configs[languageId];
if (!config) {
  console.error(`Unsupported language ID: ${languageId}`);
  process.exit(1);
}

new LanguageServer(config);