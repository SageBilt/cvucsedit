import * as fs from 'fs';
import * as vscode from 'vscode';
import * as CONSTANTS from './constants';
import {
    DynamicData,
    UCSJSSystemData,
    UCSJSSystemMethod,
    UCSJSSystemProperty
} from './interfaces';

/**
 * Turns the static Cabinet Vision API description in ucsjs_system.json, plus the live database
 * values, into an ambient `cv-api.d.ts`.
 *
 * This is what lets VS Code's own TypeScript service provide completion, hover, signature help,
 * go to definition and rename for UCS:JS, replacing the hand rolled equivalents that used to live
 * in referenceParser.ts and ucsjsLanguageHandler.ts.
 *
 * The emitted file must contain no top level import or export: that keeps it a *script*, so every
 * declaration lands in the global scope where mirrored UCS files can see it.
 */
export class DtsGenerator {
    private data: UCSJSSystemData;
    private unmappedReturnTypes = new Set<string>();

    constructor() {
        this.data = JSON.parse(fs.readFileSync(CONSTANTS.UCSJSSYSTEMJSONPATH, 'utf8')) as UCSJSSystemData;
    }

    // ------------------------------------------------------------------ type mapping

    /**
     * `returnType` in the JSON is free form prose rather than a type, e.g.
     * "System::Collections::Generic::List - array of CVAsmManaged child objects". There are only a
     * couple of dozen distinct values, so a small set of ordered rules covers all of them; anything
     * unrecognised degrades to `any` and is reported rather than silently mistyped.
     */
    private mapReturnType(raw: string | undefined): string {
        const text = (raw ?? '').trim();
        if (!text) return 'void';

        if (/CVAsmManaged/.test(text) && /\barray\b|List/i.test(text)) return 'CVAsmManaged[]';
        if (/CVShapeManaged/.test(text)) return 'CVShapeManaged | null';
        if (/CVAsmManaged/.test(text)) {
            return /\bnull\b/.test(text) ? 'CVAsmManaged | null' : 'CVAsmManaged';
        }
        if (/Object side type/i.test(text)) return 'ShapeSideType';

        const head = text.split(/[\s\-]/)[0].toLowerCase();
        switch (head) {
            case 'void': return 'void';
            case 'bool': return 'boolean';
            case 'string': return 'string';
            case 'double':
            case 'float':
            case 'long':
            case 'int': return 'number';
            case 'variant': return 'any';
        }

        this.unmappedReturnTypes.add(text);
        return 'any';
    }

    /** Property `Type` is either a Cabinet Vision VAL_* constant name or a raw C++ type. */
    private mapPropertyType(raw: string | undefined): string {
        switch ((raw ?? '').trim()) {
            case 'VAL_TEXT': return 'string';
            case 'VAL_BOOL':
            case 'bool': return 'boolean';
            case 'VAL_INTEGER':
            case 'VAL_MEASUREMENT':
            case 'VAL_DEGREES':
            case 'int': return 'number';
            default: return 'any';
        }
    }

    /**
     * The C++ style type names that appear inside `definition`, used only when `parameterDef` is
     * missing. Distinct from the `DataType` vocabulary below.
     */
    private mapDeclaredType(raw: string): string {
        switch (raw.trim().toLowerCase()) {
            case 'string': return 'string';
            case 'bool': return 'boolean';
            case 'double':
            case 'float':
            case 'int':
            case 'long':
            case 'word': return 'number';
            default: return 'any';
        }
    }

    /**
     * Recover parameters from the `definition` signature. Several entries - the `_cvMath` comparison
     * helpers in particular - document their parameters in `definition` but ship an empty
     * `parameterDef`, and emitting a no argument signature for those would reject valid calls.
     */
    private paramsFromDefinition(definition: string | undefined): { name: string; type: string }[] {
        const inner = (definition ?? '').match(/\(([^)]*)\)/)?.[1]?.trim();
        if (!inner) return [];

        return inner.split(',').map((part, index) => {
            const tokens = part.trim().split(/\s+/).filter(Boolean);
            const declared = tokens.length > 1 ? tokens[0] : '';
            const info = this.paramInfo(part, index);
            return { name: info.name, type: this.mapDeclaredType(declared) };
        }).filter(p => p.name.length > 0);
    }

    /** `parameterDef[].DataType` is a closed vocabulary of 14 values. */
    private mapParamType(raw: string | undefined): string {
        const text = (raw ?? '').trim();
        if (text.startsWith('constants.')) {
            return text.slice('constants.'.length);
        }
        switch (text) {
            case 'string': return 'string';
            case 'double':
            case 'int': return 'number';
            case 'bool': return 'boolean';
            case 'CVShapeManaged': return 'CVShapeManaged';
            case 'materials': return 'MaterialName';
            // A UCS:M expression inside a JavaScript string. Still a string to TypeScript; the
            // language server is what supplies UCS:M completion and validation inside it.
            case 'ucsmSyntax': return 'string';
            default: return 'any';
        }
    }

    // ------------------------------------------------------------------ helpers

    /** `parentObject` is a string[] for methods but occasionally a bare string for properties. */
    private parents(entry: { parentObject?: string[] | string }): string[] {
        const parent = entry.parentObject;
        if (!parent) return [];
        return Array.isArray(parent) ? parent : [parent];
    }

    private jsDoc(indent: string, parts: (string | undefined)[]): string {
        const lines = parts
            .filter((part): part is string => !!part && part.trim().length > 0)
            .join('\n')
            .replace(/\*\//g, '*⁄')
            .split('\n');
        if (!lines.length) return '';
        return `${indent}/**\n` + lines.map(l => `${indent} * ${l}`).join('\n') + `\n${indent} */\n`;
    }

    /**
     * `ParamName` carries the C++ style declaration plus, sometimes, an optionality marker:
     *   "string message"                        -> message
     *   "string description[optional]"          -> description, optional
     *   "bool case (optional, default = false)" -> case, optional
     * The identifier is the second token, not the last: the first token is the type, and anything
     * after it is an annotation.
     */
    private paramInfo(raw: string, index: number): { name: string; optional: boolean } {
        const text = (raw ?? '').trim();
        const optional = /\[optional\]|\(\s*optional/i.test(text);

        const declaration = text
            .replace(/\[optional\]/ig, '')
            .replace(/\([^)]*\)?/g, '')
            .trim();

        const tokens = declaration.split(/\s+/).filter(Boolean);
        const word = tokens.length > 1 ? tokens[1] : (tokens[0] ?? '');

        let name = word.replace(/[^A-Za-z0-9_$]/g, '');
        if (!name || /^[0-9]/.test(name)) {
            name = `arg${index + 1}`;
        }
        if (DtsGenerator.RESERVED.has(name)) {
            name = `${name}Arg`;
        }
        return { name, optional };
    }

    private static readonly RESERVED = new Set([
        'break', 'case', 'catch', 'class', 'const', 'continue', 'debugger', 'default', 'delete',
        'do', 'else', 'enum', 'export', 'extends', 'false', 'finally', 'for', 'function', 'if',
        'import', 'in', 'instanceof', 'new', 'null', 'return', 'super', 'switch', 'this', 'throw',
        'true', 'try', 'typeof', 'var', 'void', 'while', 'with', 'yield', 'let', 'static'
    ]);

    /**
     * The shared prefix of a constant group - `VAL_`, `OBJ_`, `PARMOD_` - or undefined when the
     * group has none (`ShapeSideType` spans ASM_SIDE_, DOOR_SIDE_ and TOP_SIDE_).
     *
     * Used as the *parameter name* for arguments of that group, because VS Code builds the
     * completion snippet by calling `appendPlaceholder` with the parameter name verbatim. Naming
     * the parameter after the prefix is the only way to reproduce the `${2:PARMOD_}` hint the old
     * hand written `method.value` snippets carried.
     */
    private constantPrefix(group: string): string | undefined {
        const names = (this.data.constants as unknown as { [g: string]: string[] })[group];
        if (!Array.isArray(names) || names.length < 2) return undefined;

        let prefix = names[0];
        for (const name of names) {
            while (prefix.length && !name.startsWith(prefix)) prefix = prefix.slice(0, -1);
        }
        // Only a prefix that lands on an underscore boundary is a usable hint; half a word is worse
        // than none.
        const cut = prefix.lastIndexOf('_');
        return cut > 0 ? prefix.slice(0, cut + 1) : undefined;
    }

    private parameters(method: UCSJSSystemMethod): { name: string; type: string; optional: boolean }[] {
        const defs = method.parameterDef ?? [];
        if (!defs.length) {
            return this.paramsFromDefinition(method.definition).map(p => ({ ...p, optional: false }));
        }

        const used = new Set<string>();
        let seenOptional = false;
        return defs.map((param, index) => {
            const info = this.paramInfo(param.ParamName ?? '', index);
            const group = (param.DataType ?? '').startsWith('constants.')
                ? (param.DataType ?? '').slice('constants.'.length)
                : undefined;

            let name = (group && this.constantPrefix(group)) || info.name;
            while (used.has(name)) name = `${name}_`;
            used.add(name);

            // A required parameter may not follow an optional one, so once one is optional the
            // rest are too.
            seenOptional = seenOptional || info.optional;
            return { name, type: this.mapParamType(param.DataType), optional: seenOptional };
        });
    }

    /**
     * One or two overloads per method.
     *
     * `javascript.suggest.completeFunctionCalls` builds its snippet from the *first* overload and
     * deliberately omits every optional parameter, so on its own it would never offer the trailing
     * Cabinet Vision constant that the old hand written snippets always did (`, VAL_[optional]`,
     * `, PARSTYLE_`, `, 'description[optional]'` and so on). Emitting an all required overload first
     * puts those arguments back in the inserted snippet; the real signature that follows still
     * accepts the shorter calls, so nothing that used to compile stops compiling.
     */
    private signatures(method: UCSJSSystemMethod): string[] {
        const params = this.parameters(method);
        const returns = this.mapReturnType(method.returnType);
        const render = (allRequired: boolean) => `${method.name}(${params
            .map(p => `${p.name}${!allRequired && p.optional ? '?' : ''}: ${p.type}`)
            .join(', ')}): ${returns};`;

        return params.some(p => p.optional) ? [render(true), render(false)] : [render(false)];
    }

    private memberDoc(entry: UCSJSSystemMethod | UCSJSSystemProperty): (string | undefined)[] {
        const method = entry as UCSJSSystemMethod;
        // @param names have to match the emitted signature or the doc silently detaches.
        const named = method.parameterDef?.length ? this.parameters(method) : [];
        return [
            entry.description,
            method.definition ? `\n\`${method.definition}\`` : undefined,
            ...(method.parameterDef ?? []).map((p, i) => `@param ${named[i]?.name ?? `arg${i + 1}`} ${p.ParamValue ?? ''}`),
            method.example ? `\n@example\n${method.example}` : undefined
        ];
    }

    private members(
        methods: UCSJSSystemMethod[],
        properties: UCSJSSystemProperty[],
        indent: string,
        readonlyProps: boolean
    ): string {
        const out: string[] = [];
        for (const prop of properties) {
            out.push(this.jsDoc(indent, [prop.description]) +
                `${indent}${readonlyProps ? 'readonly ' : ''}${prop.name}: ${this.mapPropertyType(prop.Type)};`);
        }
        for (const method of methods) {
            // The doc is repeated on each overload so signature help carries it whichever one the
            // argument count selects.
            const doc = this.jsDoc(indent, this.memberDoc(method));
            for (const signature of this.signatures(method)) {
                out.push(doc + `${indent}${signature}`);
            }
        }
        return out.join('\n');
    }

    /** Members of a named Cabinet Vision object type such as CVAsmManaged or CVShapeManaged. */
    private forObjectType(objectType: string) {
        return {
            methods: this.data.methods.filter(m => m.objectType === objectType),
            properties: this.data.properties.filter(p => p.objectType === objectType)
        };
    }

    /** Members hanging off a global such as `_this`, `_cvMath`. Entries with an objectType belong there instead. */
    private forParent(parent: string) {
        return {
            methods: this.data.methods.filter(m => !m.objectType && this.parents(m).includes(parent)),
            properties: this.data.properties.filter(p => !p.objectType && this.parents(p).includes(parent))
        };
    }

    private unionOf(names: (string | undefined)[]): string {
        const unique = [...new Set(names.filter((n): n is string => !!n && n.trim().length > 0))].sort();
        if (!unique.length) return 'string';
        return unique.map(n => `'${n.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`).join(' | ');
    }

    // ------------------------------------------------------------------ emit

    public build(dynamicData: DynamicData): string {
        this.unmappedReturnTypes.clear();
        const out: string[] = [];

        out.push('// Cabinet Vision UCS:JS API surface.');
        out.push('// GENERATED by the Cabinet Vision UCS Editor extension - do not edit, your changes will be lost.');
        out.push('// Regenerated on activation and whenever a UCS list is refreshed.');
        out.push('');
        out.push('// No import or export below: this file must stay a script so that everything it');
        out.push('// declares is visible as a global to every mirrored UCS.');
        out.push('');

        // --- constant groups -------------------------------------------------
        out.push('// ---------------------------------------------------------------- constants');
        out.push('');
        const constants = this.data.constants as unknown as { [group: string]: string[] };
        for (const [group, names] of Object.entries(constants)) {
            if (!Array.isArray(names)) continue;
            // Branded so a parameter declared as this group only accepts members of it, while the
            // constants themselves stay usable as plain numbers.
            out.push(`type ${group} = number & { readonly __cvConstant: '${group}' };`);
            for (const name of names) {
                out.push(`declare const ${name}: ${group};`);
            }
            out.push('');
        }

        // --- database driven values ------------------------------------------
        out.push('// ---------------------------------------------------------------- database values');
        out.push('');
        out.push('/** Material names read from this Cabinet Vision database. */');
        out.push(`type MaterialName = ${this.unionOf(dynamicData.materials?.map(m => m.name))};`);
        out.push('/** Construction names read from this Cabinet Vision database. */');
        out.push(`type ConstructionName = ${this.unionOf(dynamicData.constructions?.map(c => c.name))};`);
        out.push('/** Schedule names read from this Cabinet Vision database. */');
        out.push(`type ScheduleName = ${this.unionOf(dynamicData.schedules?.map(s => s.name))};`);
        out.push('/** Door names read from this Cabinet Vision database. */');
        out.push(`type DoorName = ${this.unionOf(dynamicData.doors?.map(d => d.name))};`);
        out.push('/** Connection names read from this Cabinet Vision database. */');
        out.push(`type ConnectionName = ${this.unionOf(dynamicData.connections?.map(c => c.name))};`);
        out.push('');

        // --- object types ----------------------------------------------------
        out.push('// ---------------------------------------------------------------- object types');
        out.push('');
        const shape = this.forObjectType('CVShapeManaged');
        out.push('/** A shape attached to an assembly or part. */');
        out.push('interface CVShapeManaged {');
        out.push(this.members(shape.methods, shape.properties, '    ', false));
        out.push('}');
        out.push('');

        // _this and _cab are both CVAsmManaged, and the JSON describes their members once against
        // both parents, so collect against either.
        const asmMethods = this.data.methods.filter(m =>
            !m.objectType && (this.parents(m).includes('_this') || this.parents(m).includes('_cab')));
        const asmProperties = this.data.properties.filter(p =>
            !p.objectType && (this.parents(p).includes('_this') || this.parents(p).includes('_cab')));

        out.push('/** An assembly, part or other object in the Cabinet Vision model. */');
        out.push('interface CVAsmManaged {');
        out.push(this.members(asmMethods, asmProperties, '    ', false));
        out.push('}');
        out.push('');

        // --- globals ---------------------------------------------------------
        out.push('// ---------------------------------------------------------------- globals');
        out.push('');
        for (const object of this.data.objects) {
            // The JSON uses a lowercase `type` key here while everything else uses `Type`.
            const declaredType = (object as { type?: string; Type?: string }).type
                ?? (object as { Type?: string }).Type;

            if (declaredType === 'CVAsmManaged') {
                const doc = object.name === '_cab'
                    ? 'The cabinet or assembly that owns the object this UCS is running against.'
                    : 'The object this UCS is running against.';
                out.push(`/** ${doc} */`);
                out.push(`declare const ${object.name}: CVAsmManaged;`);
                out.push('');
                continue;
            }

            const own = this.forParent(object.name);
            out.push(`declare const ${object.name}: {`);
            out.push(this.members(own.methods, own.properties, '    ', true));
            out.push('};');
            out.push('');
        }

        for (const fn of this.data.functions) {
            out.push(this.jsDoc('', [fn.description, fn.definition ? `\n\`${fn.definition}\`` : undefined,
                fn.example ? `\n@example\n${fn.example}` : undefined]).trimEnd());
            out.push(`declare function ${fn.name}(value: number): number;`);
            out.push('');
        }

        if (this.unmappedReturnTypes.size) {
            console.warn(
                'cv-api.d.ts: unrecognised returnType values fell back to any:',
                [...this.unmappedReturnTypes]
            );
        }

        return out.join('\r\n');
    }

    public buildJsConfig(): string {
        const checkJs = vscode.workspace.getConfiguration('cvucsedit').get('CheckJs', false);
        return JSON.stringify({
            _comment: 'GENERATED by the Cabinet Vision UCS Editor extension - do not edit.',
            compilerOptions: {
                target: 'ES2017',
                // No DOM: the Cabinet Vision script engine is not a browser, so window, document and
                // alert must not appear in completions.
                lib: ['ES2017'],
                // Only set because the trailing `export {};` sentinel makes each UCS a module.
                module: 'ES2020',
                moduleResolution: 'bundler',
                checkJs,
                noEmit: true,
                maxNodeModuleJsDepth: 0
            },
            include: ['**/*.js', 'cv-api.d.ts']
        }, null, 2);
    }
}
