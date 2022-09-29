/**
 * @author hexxone / https://hexx.one
 *
 * @license
 * Copyright (c) 2022 hexxone All rights reserved.
 * Licensed under the GNU GENERAL PUBLIC LICENSE.
 * See LICENSE file in the project root for full license information.
 * @ignore
 */

const fs = require("fs");
const path = require("path");

const asc = require("assemblyscript/cli/asc");
const validate = require("schema-utils");
const { RawSource } = require("webpack-sources");
const { Compilation } = require("webpack");

const pluginName = "WasmPlugin";
const outPath = path.resolve(__dirname, "build");

/**
 * schema for options object
 * @see {WascBuilderPlugin}
 */
const wascSchema = {
	type: "object",
	properties: {
		production: {
			type: "boolean",
		},
		relpath: {
			type: "string",
		},
		extension: {
			type: "string",
		},
		cleanup: {
			type: "boolean",
		},
		shared: {
			type: "boolean",
		},
	},
};

/**
 * This is a webpack plugin
 */
class WascBuilderPlugin {
	options = {};

	/**
	 * Intializes the plugin in the webpack build process
	 * @param {wascSchema} options
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
		compiler.hooks.thisCompilation.tap(pluginName, (compilation) =>
			compilation.hooks.processAssets.tap(
				{
					name: pluginName,
					stage: Compilation.PROCESS_ASSETS_STAGE_ADDITIONAL,
				},
				async (assets) => {
					if (addedOnce) return;
					addedOnce = true;
					console.log("[" + pluginName + "] Gathering Infos....");

					// add static files from folder
					const rPath = path.resolve(__dirname, this.options.relpath);

					const sFiles = this.getAllFiles(rPath, "");

					// Parallel compiling
					await Promise.all(
						sFiles.map((sFile) => {
							// finally return Promise of module compilation
							return new Promise(async (resolve) => {
								// only compile if wasm name match regex
								const sName = sFile.replace(/^.*[\\\/]/, "");
								if (
									!sName.endsWith(
										"." + this.options.extension
									)
								) {
									resolve(false);
									return;
								}

								// change new file ext to ".wasm"
								let newName = sName.replace(/\.[^/.]+$/, "");
								if (!newName.endsWith(".wasm"))
									newName += ".wasm";

								await this.doCompile(
									rPath + sFile,
									newName,
									compilation
								);

								if (this.options.shared === true) {
									let shName = newName.replace(
										".wasm",
										".shared.wasm"
									);
									await this.doCompile(
										rPath + sFile,
										shName,
										compilation,
										true
									);
								}

								resolve();
							});
						})
					);

					// finalize
					if (this.options.cleanup) await this.cleanUp();

					console.info("[" + pluginName + "] finished.");
				}
			)
		);
	}

	/**
	 * @ignore
	 * list files recursively
	 * @param {strring} baseDir start directory
	 * @param {string} subDir sub directory
	 * @param {array} arrayOfFiles result files
	 * @return {array} arrayOfFiles
	 */
	getAllFiles(baseDir, subDir, arrayOfFiles) {
		const sub = baseDir + "/" + subDir;
		const files = fs.readdirSync(sub);
		arrayOfFiles = arrayOfFiles || [];
		files.forEach((file) => {
			const fle = subDir + "/" + file;
			if (fs.statSync(sub + "/" + file).isDirectory()) {
				arrayOfFiles = this.getAllFiles(baseDir, fle, arrayOfFiles);
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
	 * @return {Promise<void>} prom
	 */
	doCompile(src, trgt, compilation, shared) {
		return new Promise((resolve) => {
			this.compileWasm(src, trgt, this.options.production, shared).then(
				async ({ normal, map }) => {
					// emit files into compilation
					if (normal)
						await compilation.emitAsset(
							trgt,
							new RawSource(normal)
						);
					if (map)
						await compilation.emitAsset(
							trgt + ".map",
							new RawSource(map)
						);

					console.info("[" + pluginName + "] Success: " + trgt);
					resolve();
				}
			);
		});
	}

	/**
	 * @ignore
	 * compile assemblyscript (typescript) module to wasm and return binary
	 * @param {string} inputPath module to compile
	 * @param {strring} newName target name
	 * @param {boolean} production create symbols/map ?
	 * @param {boolean} sharedMem compile as shared mem module
	 * @param {string} sharedMax maximum memory
	 * @return {Promise} finished binary(s)
	 */
	compileWasm(inputPath, newName, production, sharedMem, sharedMax = "4096") {
		return new Promise((resolve) => {
			try {
				inputPath = inputPath.replaceAll("\\", "/");

				const newOut = path
					.resolve(outPath, newName)
					.replaceAll("\\", "/");

				const compileParams = [
					inputPath,
					"--extension",
					this.options.extension,
					"--binaryFile",
					newOut,
					"--textFile",
					newOut + ".wat",
					"--measure",
					"--runtime",
					"incremental",
					"--exportRuntime",
					sharedMem ? "--sharedMemory" : "",
					sharedMem ? "--maximumMemory" : "",
					sharedMem ? sharedMax : "",
					"--importMemory",
					"--enable",
					"threads",
					production ? "-Ospeed" : "--sourceMap",
				].filter((e) => e != "");

				console.info(
					`[${pluginName}] Compile ${compileParams.join(" ")}`
				);

				asc.main(compileParams, (err) => {
					// let output = execSync('npm run asbuild', { cwd: __dirname });
					if (err) throw err;
					// none? -> read and resolve optimized.wasm string
					resolve(
						production
							? {
									normal: fs.readFileSync(newOut),
							  }
							: {
									normal: fs.readFileSync(newOut),
									map: fs.readFileSync(newOut + ".map"),
							  }
					);
				});
			} catch (ex) {
				console.warn("[" + pluginName + "] Compile Error!");
				console.error(ex);
			}
		});
	}

	/**
	 * delete all files in the output dir
	 * @return {Promise} async finished event
	 */
	cleanUp() {
		console.info("[" + pluginName + "] Cleaning...");
		return new Promise((resolve) => {
			fs.readdir(outPath, (err, files) => {
				if (err) throw err;
				Promise.all(
					files.map((file) => {
						return new Promise((res) => {
							fs.unlink(path.join(outPath, file), (err) => {
								if (err) throw err;
								console.info(
									"[" + pluginName + "] delete: " + file
								);
								res();
							});
						});
					})
				).then(resolve);
			});
		});
	}
}

module.exports = WascBuilderPlugin;
