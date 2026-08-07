import * as path from 'path';

export const UCSMSYSTEMJSONPATH = path.join(__dirname, '../Languages/data/system.json');
export const UCSMSYNTAXJSONPATH = path.join(__dirname, '../Languages/ucsm/data/ucsm_syntax.json');
export const UCSMCONTROLSTRUCTURESJSONPATH = path.join(__dirname, '../Languages/ucsm/data/control_structures.json');

export const UCSJSSYSTEMJSONPATH = path.join(__dirname, '../Languages/ucsjs/data/ucsjs_system.json');

/**
 * Markdown sources for the documentation written into the mirror folder for AI agents. Kept as
 * files rather than string literals for the same reason the language data is: they are content,
 * not code, and editing them should not need a recompile.
 */
export const AGENTDOCSDIR = path.join(__dirname, '../Languages/agent');
export function agentDocPath(name: string): string {
    return path.join(AGENTDOCSDIR, name);
}