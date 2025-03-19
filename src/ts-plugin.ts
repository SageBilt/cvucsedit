import * as ts from 'typescript/lib/tsserverlibrary';

function init(modules: { typescript: typeof ts }) {
  const tsModule = modules.typescript;

  function create(info: ts.server.PluginCreateInfo) {
    // Log to TypeScript server output
    info.project.projectService.logger.info('UCSJS TS Plugin loaded');

    const proxy = Object.create(null);
    const oldLS = info.languageService;

    for (const k of Object.keys(oldLS)) {
      proxy[k] = (...args: any[]) => (oldLS as any)[k](...args);
    }

    proxy.getCompletionsAtPosition = (
      fileName: string,
      position: number,
      options: ts.GetCompletionsAtPositionOptions | undefined
    ) => {
      info.project.projectService.logger.info(`Getting completions for ${fileName}`);
      const prior = oldLS.getCompletionsAtPosition(fileName, position, options);
      if (!fileName.endsWith('.ucsjs') || !prior) return prior;

      const customCompletion: ts.CompletionEntry = {
        name: 'specialMethod',
        kind: tsModule.ScriptElementKind.functionElement,
        sortText: '0',
        insertText: 'specialMethod("${1:arg}")',
        isSnippet: true as const
      };
      prior.entries.push(customCompletion);
      return prior;
    };

    return proxy;
  }

  function getExternalFiles(project: ts.server.Project): string[] {
    const files = project.getFileNames().filter(f => f.endsWith('.ucsjs') || f.startsWith('cvucs:/'));
    project.projectService.logger.info(`External files: ${files.join(', ')}`);
    return files;
  }

  return { create, getExternalFiles };
}

export = init;