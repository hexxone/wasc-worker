/**
* @author hexxone / https://hexx.one
*
* @license
* Copyright (c) 2021 hexxone All rights reserved.
* Licensed under the GNU GENERAL PUBLIC LICENSE.
* See LICENSE file in the project root for full license information.
*
* @description
* AssemblyScript module Loaders
*/

import loader from '@assemblyscript/loader';

import {makeRuntime, myFetch, ACTIONS, getTransferableParams, INITIAL_MEM} from './WascRT';

import WascWorker from 'worker-loader!./Wasc';
import {WascInterface} from './WascInterface';

/**
* @ignore
* Inline loads a compiled webassembly module.
* Basically the normal WebAssembly usage,
* just with api- and "run()"-compatibility
* @param {string} path compiled module path
* @param {number} initialMem initial memory size in kb
* @param {Object} options import Objects
* @return {Promise<WascInterface>} module
*/
export function LoadInline(path: string, initialMem: number = INITIAL_MEM, options: any = {}): Promise<WascInterface> {
	let ascExports: any;
	const memory = new WebAssembly.Memory({initial: initialMem});
	const staticImports = {
		env: {
			memory,
			logf(value) {
				console.log('F64: ' + value);
			},
			logi(value) {
				console.log('U32: ' + value);
			},
			logU32Array(ptr) {
				console.log(ascExports.getU32Array(ptr));
			},
			logF64Array(ptr) {
				console.log(ascExports.getF64Array(ptr));
			},
		},
	};

	return new Promise(async (resolve) => {
		// get import object
		const {getImportObject} = options;
		const myImports = Object.assign({}, staticImports);
		if (getImportObject !== undefined) {
			Object.assign(myImports, getImportObject());
		}

		const byteModule = await myFetch(path);
		const {module, instance, exports} = loader.instantiateSync(byteModule, myImports);

		// get Exports
		const rtExports = makeRuntime(
			memory,
			exports.allocF64Array,
			exports.allocU32Array,
		);

		// Add Helpers
		Object.assign(exports, {...rtExports});
		ascExports = exports;

		/**
		* Run a function inside the worker.
		* @todo This is potentially dangerous due to eval!
		* @param {string} func stringified function to eval inside worker context
		* @param {Object} params Data to pass in
		* @return {Object} eval result
		*/
		function run(func, ...params) {
			return new Promise((res) => {
				const fun = new Function(`return ${func}`)();
				res(fun({
					module,
					instance,
					importObject: exports,
					params,
				}));
			});
		}

		// we done here
		resolve({module, instance, exports, run} as any);
	});
}


/**
* @ignore
* Creates a Worker, then loads a compiled webassembly module inside,
* then creates a Promise-interface for all functions and additionally
* wraps a "run" function inside the worker.
* @param {string} source compiled module path
* @param {Object} options import Objects
* @return {Promise<WascInterface>} module
*/
export function LoadWorker(source: string, options: any = {}): Promise<WascInterface> {
	// WRAP IN WORKER
	let currentId = 0;
	const promises = {};
	const worker = new WascWorker(options);

	worker.onmessage = (e) => {
		const {id, result, action, payload} = e.data;

		// COMPILE MODULE & RETURN EXPORTS
		if (action === ACTIONS.COMPILE_MODULE) {
			if (result === 0) {
				const {exports} = payload;

				promises[id][0]({

					// wrap the returned context/thread exports into promises
					exports: exports.reduce((acc, exp) => ({
						...acc,
						[exp]: (...params) => new Promise((...rest) => {
							promises[++currentId] = rest;
							worker.postMessage({
								id: currentId,
								action: ACTIONS.CALL_FUNCTION_EXPORT,
								payload: {
									func: exp,
									params,
								},
							}, getTransferableParams(params));
						}),
					}), {}),

					// export context/thread run function
					run: (func, ...params) => new Promise((...rest) => {
						promises[++currentId] = rest;
						worker.postMessage({
							id: currentId,
							action: ACTIONS.RUN_FUNCTION,
							payload: {
								func: func.toString(),
								params,
							},
						}, getTransferableParams(params));
					}),

				});
			} else if (result === 1) {
				promises[id][1](payload);
			}

			// CALL FUNCTION
		} else if (
			action === ACTIONS.CALL_FUNCTION_EXPORT ||
				action === ACTIONS.RUN_FUNCTION
		) {
			promises[id][result](payload);
		}

		promises[id] = null;
	};

	return new Promise((...params) => {
		promises[++currentId] = [...params];

		worker.postMessage({
			id: currentId,
			action: ACTIONS.COMPILE_MODULE,
			payload: source,
		});
	});
}


