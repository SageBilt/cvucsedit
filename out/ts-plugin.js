"use strict";
function init(modules) {
    const tsModule = modules.typescript;
    function create(info) {
        // Log to TypeScript server output
        info.project.projectService.logger.info('UCSJS TS Plugin loaded');
        const proxy = Object.create(null);
        const oldLS = info.languageService;
        for (const k of Object.keys(oldLS)) {
            proxy[k] = (...args) => oldLS[k](...args);
        }
        proxy.getCompletionsAtPosition = (fileName, position, options) => {
            info.project.projectService.logger.info(`Getting completions for ${fileName}`);
            const prior = oldLS.getCompletionsAtPosition(fileName, position, options);
            if (!fileName.endsWith('.ucsjs') || !prior)
                return prior;
            const customCompletion = {
                name: 'specialMethod',
                kind: tsModule.ScriptElementKind.functionElement,
                sortText: '0',
                insertText: 'specialMethod("${1:arg}")',
                isSnippet: true
            };
            prior.entries.push(customCompletion);
            return prior;
        };
        return proxy;
    }
    function getExternalFiles(project) {
        const files = project.getFileNames().filter(f => f.endsWith('.ucsjs') || f.startsWith('cvucs:/'));
        project.projectService.logger.info(`External files: ${files.join(', ')}`);
        return files;
    }
    return { create, getExternalFiles };
}
module.exports = init;
//# sourceMappingURL=ts-plugin.js.map