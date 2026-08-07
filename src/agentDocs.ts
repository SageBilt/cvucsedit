import * as fs from 'fs';
import * as CONSTANTS from './constants';
import { UCSMSystemData, UCSMSyntaxData, ControlStructure } from './interfaces';

/**
 * Generates the agent facing documentation that ships into the mirror folder alongside
 * `cv-api.d.ts`.
 *
 * `cv-api.d.ts` already tells an AI agent (and the TypeScript service) what the UCS:JS API *is*,
 * but nothing on disk tells it how a UCS is executed, that saving pushes straight to SQL, that a
 * new file is silently ignored, or that the first and last lines of a `.ucs.js` are not code. And
 * UCS:M has no equivalent of `cv-api.d.ts` at all: every bit of that knowledge lives in
 * `Languages/data/system.json` inside the extension's install directory, which is nowhere near the
 * user's workspace. An agent asked to write UCS:M today has nothing to work from.
 *
 * The prose lives in `Languages/agent/*.md` rather than in this file, matching how the rest of the
 * static Cabinet Vision documentation is kept: editing the guidance then needs no recompile, and
 * the templates stay readable as markdown. This class only substitutes the parts that have to be
 * derived - the database name, and the reference tables built from the same JSON the language
 * server reads.
 */
export class AgentDocsGenerator {
    private system: UCSMSystemData;
    private syntax: UCSMSyntaxData;
    private control: { controlStructures: ControlStructure[] };

    constructor() {
        this.system = JSON.parse(fs.readFileSync(CONSTANTS.UCSMSYSTEMJSONPATH, 'utf8')) as UCSMSystemData;
        this.syntax = JSON.parse(fs.readFileSync(CONSTANTS.UCSMSYNTAXJSONPATH, 'utf8')) as UCSMSyntaxData;
        this.control = JSON.parse(fs.readFileSync(CONSTANTS.UCSMCONTROLSTRUCTURESJSONPATH, 'utf8'));
    }

    // ------------------------------------------------------------------ helpers

    private static template(name: string): string {
        return fs.readFileSync(CONSTANTS.agentDocPath(name), 'utf8');
    }

    /**
     * Descriptions in system.json are lifted verbatim from the CV help files and run to 1700
     * characters in places, with embedded newlines. Collapse and clip them: this is an index an
     * agent scans for a name, not a manual it reads end to end.
     */
    private static oneLine(text: string | undefined, limit = 240): string {
        const flat = (text ?? '').replace(/\s+/g, ' ').trim();
        if (!flat) {
            return '';
        }
        // Escape the table cell separator, or a description containing one splits the row.
        const clipped = flat.length > limit ? `${flat.slice(0, limit - 1).trimEnd()}…` : flat;
        return clipped.replace(/\|/g, '\\|');
    }

    /** A list of names as a wrapped run of inline code, which is far denser than a bullet list. */
    private static codeList(names: string[]): string {
        return names.map(n => `\`${n}\``).join(', ');
    }

    /**
     * Substitution is a plain string replace rather than a regex so that a replacement containing
     * `$&` or `$1` - entirely possible in prose lifted from CV's documentation - is not interpreted.
     */
    private static fill(template: string, values: { [key: string]: string }): string {
        let out = template;
        for (const [key, value] of Object.entries(values)) {
            out = out.split(`{{${key}}}`).join(value);
        }
        return out;
    }

    // ------------------------------------------------------------------ generated sections

    private valueTypes(): string {
        const rows = this.system.types.map(t =>
            `| \`${t.value}\` | ${t.name} | ${AgentDocsGenerator.oneLine(t.description, 160)} |`);
        return ['| tag | type | |', '|---|---|---|', ...rows].join('\n');
    }

    private controlStructures(): string {
        const rows = this.control.controlStructures.map(c => {
            const open = c.requiredSuffix ? `${c.openingKeyword} … ${c.requiredSuffix}` : c.openingKeyword;
            return `| \`${open}\` | \`${c.closingKeyword}\` | ${c.supportsElse ? '`Else`' : 'no `Else`'} |`;
        });
        return ['| opens | closes | |', '|---|---|---|', ...rows].join('\n');
    }

    private specialObjects(): string {
        const rows = this.system.specialObjects.map(o => {
            // The pattern says whether the suffix is a name or a standard number, which is the
            // difference between `_M:DZ` and `_CV:238` and the only thing that makes the table usable.
            const suffix = /\\d/.test(o.propertyPattern) ? '<number>' : '<name>';
            return `| \`${o.prefix}${suffix}\` | ${AgentDocsGenerator.oneLine(o.description, 160)} |`;
        });
        return ['## Special object prefixes', '', '| prefix | |', '|---|---|', ...rows].join('\n');
    }

    private functions(): string {
        const rows = this.system.functions.map(f => {
            // `value` is a completion snippet (`ABS(${1:X})`); strip the placeholder syntax to get
            // a readable call signature.
            const signature = (f.value || `${f.name}()`).replace(/\$\{\d+:([^}]*)\}/g, '$1');
            return `| \`${signature}\` | ${AgentDocsGenerator.oneLine(f.description, 200)} |`;
        });
        return ['| | |', '|---|---|', ...rows].join('\n');
    }

    /**
     * The system parameters, grouped by the object they apply to. 680 rows in one table is not
     * usable; grouped, an agent can read just the section for the object it is working on, and the
     * groups are ordered by size so the ones that matter come first.
     */
    private systemVariables(): string {
        const groups = new Map<string, string[]>();
        for (const v of this.system.variables) {
            const applies = (v.appliesTo || '').trim() || 'Unspecified';
            const row = `| \`${v.name}\` | ${AgentDocsGenerator.oneLine(v.description)} |`;
            const existing = groups.get(applies);
            if (existing) {
                existing.push(row);
            } else {
                groups.set(applies, [row]);
            }
        }

        const out: string[] = [];
        for (const [applies, rows] of [...groups].sort((a, b) => b[1].length - a[1].length)) {
            out.push(`### ${applies}`, '', '| parameter | |', '|---|---|', ...rows.sort(), '');
        }
        return out.join('\n');
    }

    // ------------------------------------------------------------------ documents

    /**
     * The rules of the road. Named `AGENTS.md` because that is the cross tool convention; the
     * companion `CLAUDE.md` is a one line import of it rather than a copy, so there is one source
     * of truth in the folder.
     */
    public buildAgentsMd(database: string, server: string, root: string): string {
        return AgentDocsGenerator.fill(AgentDocsGenerator.template('AGENTS.template.md'), {
            DATABASE: database,
            SERVER: server,
            ROOT: root
        });
    }

    public buildClaudeMd(): string {
        return AgentDocsGenerator.template('CLAUDE.template.md');
    }

    /**
     * The block written into the *workspace root* `AGENTS.md` / `CLAUDE.md`.
     *
     * The mirror carries its own `AGENTS.md`, but whether a tool ever finds it depends on that
     * tool: nested instruction files may be discovered lazily, only at the project root, or not at
     * all. The root is the one location every tool that supports the convention actually reads, so
     * a pointer goes there and the detail stays in the mirror.
     *
     * Delimited, because unlike everything else this file generates it lands in a file the user may
     * own and edit. `mergeRootPointer` rewrites only what is between the markers.
     */
    public buildRootPointer(mirror: string): string {
        return AgentDocsGenerator.fill(AgentDocsGenerator.template('root-pointer.template.md'), {
            MIRROR: mirror
        });
    }

    /**
     * The block written into the `AGENTS.md` / `CLAUDE.md` of Cabinet Vision's debug folder.
     *
     * Nothing else in that folder says what it is. The files look like ordinary JavaScript, the
     * `function fn<Name>()` wrapper Cabinet Vision puts round each one looks like part of the
     * standard, and an agent has no way to tell that the folder is emptied on the next restart or
     * that a second copy of the same standard is mirrored elsewhere.
     */
    public buildDebugPointer(mirror: string): string {
        return AgentDocsGenerator.fill(AgentDocsGenerator.template('debug-pointer.template.md'), {
            MIRROR: mirror
        });
    }

    public static readonly BLOCK_BEGIN ='<!-- BEGIN cvucsedit - generated, edits here are lost -->';
    public static readonly BLOCK_END = '<!-- END cvucsedit -->';

    /**
     * Splice the generated block into whatever is already there: replace it if the markers are
     * present, append it if not, and return `undefined` when nothing needs to change so the caller
     * does not touch the file's mtime.
     */
    public static mergeRootPointer(existing: string | undefined, block: string): string | undefined {
        const wrapped = `${AgentDocsGenerator.BLOCK_BEGIN}\n${block.trim()}\n${AgentDocsGenerator.BLOCK_END}`;

        if (existing === undefined) {
            return `${wrapped}\n`;
        }

        const begin = existing.indexOf(AgentDocsGenerator.BLOCK_BEGIN);
        const end = existing.indexOf(AgentDocsGenerator.BLOCK_END);
        const merged = begin !== -1 && end > begin
            ? existing.slice(0, begin) + wrapped + existing.slice(end + AgentDocsGenerator.BLOCK_END.length)
            : `${existing.replace(/\s*$/, '')}\n\n${wrapped}\n`;

        return merged === existing ? undefined : merged;
    }

    /** Static, so it is copied through unchanged - the UCS:JS API itself is in `cv-api.d.ts`. */
    public buildUcsjsReference(): string {
        return AgentDocsGenerator.template('ucsjs-reference.md');
    }

    public buildUcsmReference(): string {
        return AgentDocsGenerator.fill(AgentDocsGenerator.template('ucsm-reference.template.md'), {
            VALUE_TYPES: this.valueTypes(),
            CONTROL_STRUCTURES: this.controlStructures(),
            SPECIAL_OBJECTS: this.specialObjects(),
            KEYWORDS: AgentDocsGenerator.codeList(this.system.keywords),
            FOREACH_TYPES: AgentDocsGenerator.codeList(this.syntax.forEachTypes),
            DIM_TYPES: AgentDocsGenerator.codeList(this.syntax.dimTypes),
            FUNCTIONS: this.functions(),
            OBJECT_CLASSES: AgentDocsGenerator.codeList(this.system.objectClass),
            OBJECT_TYPES: AgentDocsGenerator.codeList(this.system.objectTypes),
            SYSTEM_VARIABLES: this.systemVariables()
        });
    }
}
