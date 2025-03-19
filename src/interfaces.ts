export interface SpecialObject {  
  prefix: string;
  propertyPattern: string;
  allowsSubProperties: boolean;
  description: string;
}

export interface VariableTypes {
    name: string;
    value: string;
    description: string;
}

export interface SystemFunctions {
    name: string;
    value: string;
    description: string;
}

export interface ConditionRules {
  comparisonOperators: string[];
  logicalOperators: string[];
  validOperands: string[];
}

// Define the shape of the control structure JSON data
export interface ControlStructure {
  openingKeyword: string;
  requiredSuffix: string | null;
  closingKeyword: string;
  supportsElse: boolean;
  customValidation?: string;
}

// Define the shape of a variable in system JSON
export interface SystemVariable {
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

// export interface SystemObjects {
//     name: string;
//     description: string;
//   }

// Define the shape of the system JSON data
export interface SystemData {
  keywords: string[];
  variables: SystemVariable[];
  functions: SystemFunctions[];
  types: VariableTypes[];
}

// Define the shape of the syntax JSON data
export interface SyntaxData {
  valueTypes: string[];
  dimTypes: string[];
  forEachTypes: string[];
}