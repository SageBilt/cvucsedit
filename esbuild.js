/**
 * Bundles the extension for packaging.
 *
 * Unbundled, the VSIX shipped 2400 files, 2351 of them `node_modules`: `mssql` pulls `tedious`,
 * which has a top-level `require("@azure/identity")`, which drags in MSAL and Key Vault - about
 * 1400 files of Azure AD authentication this extension never uses, since the SQL credentials are
 * a hard-coded Cabinet Vision account. None of that can be removed with `.vscodeignore`, because
 * the requires are static and real: excluding them breaks `mssql` at runtime. Bundling collapses
 * the reachable code into two files instead.
 *
 * There are **two** entry points because there are two processes: the extension host, and the
 * language server that `client.ts` spawns as a child node process (once per language id).
 *
 * Both land directly in `dist/`, at the same depth `out/` had. That is not cosmetic - `constants.ts`
 * resolves the `Languages/` data files through `path.join(__dirname, '../Languages/...')`, and
 * esbuild rewrites `__dirname` to the *bundle's* directory rather than the original source file's.
 * A server bundle in `dist/server/` would look for `dist/Languages/` and find nothing.
 */
const esbuild = require('esbuild');

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

/**
 * Reports esbuild failures in the form the `esbuild-watch` problem matcher in `.vscode/tasks.json`
 * parses, so a bundling error during F5 lands in the Problems panel like a tsc error would.
 */
const problemMatcherPlugin = {
    name: 'problem-matcher',
    setup(build) {
        build.onStart(() => console.log('[watch] build started'));
        build.onEnd((result) => {
            result.errors.forEach(({ text, location }) => {
                console.error(`✘ [ERROR] ${text}`);
                if (location) {
                    console.error(`    ${location.file}:${location.line}:${location.column}:`);
                }
            });
            console.log('[watch] build finished');
        });
    },
};

/** @type {import('esbuild').BuildOptions} */
const shared = {
    bundle: true,
    format: 'cjs',
    platform: 'node',
    // VS Code 1.98 runs on Electron's Node 20.
    target: 'node20',
    // Supplied by the host at runtime; it is not on disk and must never be bundled.
    external: ['vscode'],
    minify: production,
    sourcemap: !production,
    sourcesContent: false,
    logLevel: 'warning',
    plugins: [problemMatcherPlugin],
};

async function main() {
    const contexts = await Promise.all([
        esbuild.context({ ...shared, entryPoints: ['src/extension.ts'], outfile: 'dist/extension.js' }),
        // Runs in its own process and must not reach `vscode`; see src/server/.
        esbuild.context({ ...shared, entryPoints: ['src/server/server.ts'], outfile: 'dist/server.js' }),
    ]);

    if (watch) {
        await Promise.all(contexts.map((ctx) => ctx.watch()));
    } else {
        await Promise.all(contexts.map((ctx) => ctx.rebuild()));
        await Promise.all(contexts.map((ctx) => ctx.dispose()));
    }
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
