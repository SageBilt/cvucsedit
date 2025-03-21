// Define an interface for the language configuration
export interface LanguageConfig {
  languageId: string;
  systemJsonPath: string;
  syntaxJsonPath: string;
  controlStructuresJsonPath: string;
}

export interface UCSMSpecialObject {  
  prefix: string;
  propertyPattern: string;
  allowsSubProperties: boolean;
  description: string;
}

export interface UCSMVariableTypes {
    name: string;
    value: string;
    description: string;
}

export interface UCSMSystemFunctions {
    name: string;
    value: string;
    description: string;
}

export interface ConditionRules {
  comparisonOperators: string[];
  logicalOperators: string[];
  validOperands: string[];
}

export interface ControlStructure {
  openingKeyword: string;
  requiredSuffix: string | null;
  closingKeyword: string;
  supportsElse: boolean;
  customValidation?: string;
}
export interface UCSMSystemVariable {
  name: string;
  description: string;
  type: string;
  validRange: string;
  appliesTo: string;
  values: string;
  visibility: string;
  Remarks: string;
  parentObject: string;
}
export interface UCSMSystemData {
  keywords: string[];
  variables: UCSMSystemVariable[];
  functions: UCSMSystemFunctions[];
  types: UCSMVariableTypes[];
  specialObjects: UCSMSpecialObject[];
}

export interface UCSMSyntaxData {
  valueTypes: string[];
  dimTypes: string[];
  forEachTypes: string[];
}

/*----------------- UCS JS -------------------*/

export interface UCSJSSystemFunction {
    name: string;
    definition: string;
    value: string;
    description: string;
    example: string;
}

export interface UCSJSSystemPropertie {
    name: string;
    parentObject: string[],
    value: string;
    description: string;
    Type: string;
}

export interface UCSJSParameterDef {
    ParamName: string;
    ParamValue: string;
    DataType: string;
}
export interface UCSJSSystemMethod {
    name: string;
    parentObject: string[],
    definition: string;
    value: string;
    description: string;
    example: string;
    returnType: string;
    parameterDef: UCSJSParameterDef[];
}

export interface UCSJSSystemConstants {
    AssemblyTypes: string[];
    parameterModTypes: string[];
    parameterModStyles: string[];
    databaseIDTypes: string[];
    parameterTypes: string[];
    objectClass: string[];
    objectTypes: string[];
    assemblyEndTypes: string[];
}

export interface UCSJSSystemData {
    objects: string[];
    constants: UCSJSSystemConstants;
    properties: UCSJSSystemPropertie[];
    functions: UCSJSSystemFunction[];
    methods: UCSJSSystemMethod[];
  }