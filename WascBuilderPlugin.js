/**
 * @author hexxone / https://hexx.one
 *
 * @license
 * Copyright (c) 2024 hexxone All rights reserved.
 * Licensed under the GNU GENERAL PUBLIC LICENSE.
 * See LICENSE file in the project root for full license information.
 * @ignore
 */
/* eslint-disable no-undef */
/* eslint-disable @typescript-eslint/no-var-requires */

const fs = require('fs');
const path = require('path');

const asc = import('assemblyscript/dist/asc.js');
const validate = require('schema-utils');
const { RawSource } = require('webpack-sources');
const { Compilation } = require('webpack');
// const { error } = require('console');

const pluginName = 'WasmPlugin';
// const outPath = path.resolve(__dirname, 'build');

/**
 * schema for options object
 * @see {WascBuilderPlugin}
 */
const wascSchema = {
    type: 'object',
    properties: {
        production: {
            type: 'boolean'
        },
        basedir: {
            type: 'string'
        },
        modules: {
            type: 'array'
        },
        cleanup: {
            type: 'boolean'
        },
        shared: {
            type: 'boolean'
        }
    }
};

/**
 * This is a webpack plugin for compiling AssemblyScript to Wasm on build.
 */
class WascBuilderPlugin {

    options = {};

    /**
     * Intializes the plugin in the webpack build process
     * @param {wascSchema} options config
     */
    constructor(options = {}) {
        validate.validate(wascSchema, options);
        this.options = options;
    }

    /**
     * @ignore
     * Hook into the compilation process,
     * find all target files by a regex
     * then compile and add them to the webpack compiled files.
     * @param {Webpack.compiler} compiler object from webpack
     * @returns {void}
     */
    apply(compiler) {
        let addedOnce = false;

        // Specify the event hook to attach to
        compiler.hooks.thisCompilation.tap(pluginName, (compilation) => {
            return compilation.hooks.processAssets.tap(
                {
                    name: pluginName,
                    stage: Compilation.PROCESS_ASSETS_STAGE_ADDITIONAL
                },
                async (_assets) => {
                    if (addedOnce) {
                        return;
                    }
                    addedOnce = true;
                    console.log(`[${pluginName}] Gathering infos....`);

                    // get static files from folder
                    // eslint-disable-next-line no-undef
                    const basedir = path.resolve(
                        __dirname,
                        this.options.basedir
                    );
                    const baseFiles = this.getAllFiles(basedir);

                    console.log(`[${pluginName}] Base directory: '${basedir}'`);

                    // filter files for module names.
                    const moduleNames = this.options.modules ?? [];
                    const moduleFiles = baseFiles.filter((sf) => {
                        return moduleNames.some((mn) => {
                            return sf.substring(1) === mn;
                        });
                    });

                    if (moduleFiles.length === 0) {
                        console.warn(
                            `[${pluginName}] Module file list empty. Check your webpack config. Nothing to compile...`
                        );

                        return;
                    }

                    // Parallel compiling
                    await Promise.all(
                        moduleFiles.map((moduleFile) => {
                            // finally return Promise of module compilation
                            // eslint-disable-next-line no-async-promise-executor
                            return new Promise(async (resolve) => {
                                const sName = moduleFile.replace(
                                    /^.*[\\/]/,
                                    ''
                                );

                                // change new file ext to ".wasm"
                                let newName = sName.replace(/\.[^/.]+$/, '');

                                if (!newName.endsWith('.wasm')) {
                                    newName += '.wasm';
                                }

                                console.log(
                                    `[${pluginName}] Compiling normally: '${moduleFile}'.`
                                );
                                await this.doCompile(
                                    basedir + moduleFile,
                                    newName,
                                    compilation
                                );

                                if (this.options.shared === true) {
                                    console.log(
                                        `[${pluginName}] Compiling with shared memory: '${moduleFile}'.`
                                    );
                                    const shName = newName.replace(
                                        '.wasm',
                                        '.shared.wasm'
                                    );

                                    await this.doCompile(
                                        basedir + moduleFile,
                                        shName,
                                        compilation,
                                        true
                                    );
                                }

                                resolve();
                            });
                        })
                    );

                    console.info(`[${pluginName}] finished.`);
                }
            );
        });
    }

    /**
     * @ignore
     * list files recursively
     * @param {strring} basedir start directory
     * @param {string} subDir sub directory
     * @param {array} arrayOfFiles result files
     * @returns {string[]} arrayOfFiles
     */
    getAllFiles(basedir, subDir = '', arrayOfFiles = []) {
        const sub = `${basedir}/${subDir}`;
        const files = fs.readdirSync(sub);

        files.forEach((file) => {
            const fle = `${subDir}/${file}`;

            if (fs.statSync(`${sub}/${file}`).isDirectory()) {
                arrayOfFiles = this.getAllFiles(basedir, fle, arrayOfFiles);
            } else {
                arrayOfFiles.push(fle);
            }
        });

        return arrayOfFiles;
    }

    /**
     * Internal compiler shorthand
     * @param {string} src source compile
     * @param {string} trgt target file
     * @param {WebPack.Compilation} compilation ctx
     * @param {boolean} shared memory
     * @returns {Promise<void>} prom
     */
    doCompile(src, trgt, compilation, shared) {
        return new Promise((resolve) => {
            this.compileWasm(
                src,
                trgt,
                this.options.production,
                this.options.cleanup,
                shared
            ).then(async ({ normal, map }) => {
                // emit files into compilation
                if (normal) {
                    await compilation.emitAsset(trgt, new RawSource(normal));
                }
                if (map) {
                    await compilation.emitAsset(
                        `${trgt}.map`,
                        new RawSource(map)
                    );
                }

                console.info(`[${pluginName}] Success: ${trgt}`);

                resolve();
            });
        });
    }

    /**
     * @ignore
     * compile assemblyscript (typescript) module to wasm and return binary
     * @param {string} inputFilePath module to compile
     * @param {strring} outFile target name
     * @param {boolean} production create symbols/map ?
     * @param {boolean} cleanup cleanup after compile ?
     * @param {boolean} sharedMem compile as shared mem module
     * @param {string} sharedMax maximum memory
     * @returns {Promise} finished binary(s)
     */
    compileWasm(
        inputFilePath,
        outFile,
        production,
        cleanup,
        sharedMem,
        sharedMax = '4096'
    ) {
        // inputPath = inputPath.replaceAll("\\", "/");

        const inDir = path.dirname(inputFilePath);
        const inFile = path.basename(inputFilePath);

        const compileParams = [
            inFile,
            '--baseDir',
            inDir,
            '--outFile',
            outFile,
            '--textFile',
            `"${outFile}.wat"`,
            '--stats',
            '--runtime',
            'incremental',
            '--exportRuntime',
            sharedMem ? '--sharedMemory' : '',
            sharedMem ? '--maximumMemory' : '',
            sharedMem ? sharedMax : '',
            '--importMemory',
            '--enable',
            'threads',
            production ? '-Ospeed' : '--sourceMap'
        ].filter((e) => {
            return e !== '';
        });

        console.info(
            `[${pluginName}] Compile Params: ${compileParams.join(' ')}`
        );

        return asc
            .then((ascompiler) => {
                return ascompiler.main(compileParams);
            })
            .then(async (compResult) => {
                if (compResult.error) {
                    const eMsg = `[${pluginName}] Compile Error: ${compResult.error.message}: \r\n${compResult.stderr}`;

                    console.error(eMsg);
                    throw new Error(eMsg);
                }
                // none? -> read and resolve optimized.wasm string
                console.log(
                    `[${pluginName}] Compilation stats:\r\n${compResult.stats.toString()}`
                );

                const outFilePath = path.resolve(inDir, outFile);

                const resultData = production
                    ? {
                        normal: fs.readFileSync(outFilePath)
                    }
                    : {
                        normal: fs.readFileSync(outFilePath),
                        map: fs.readFileSync(`${outFilePath}.map`)
                    };

                if (this.options.cleanup) {
                    await this.cleanup(outFilePath);
                    if (!production) {
                        await this.cleanup(`${outFilePath}.map`);
                    }
                }

                return resultData;
            })
            .catch((err) => {
                const eMsg = `[${pluginName}] Compile Error:\r\n${err}`;

                console.error(eMsg);
                throw new Error(eMsg);
            });
    }

    cleanup(file) {
        console.info(`[${pluginName}] Cleaning '${file}'...`);

        return new Promise((resolve, reject) => {
            fs.unlink(file, (err) => {
                if (err) {
                    console.info(
                        `[${pluginName}] Delete Error: ${file}: '${err}`
                    );
                    reject(err);

                    return;
                }
                console.info(`[${pluginName}] Deleted: ${file}`);
                resolve();
            });
        });
    }

}

module.exports = WascBuilderPlugin;
