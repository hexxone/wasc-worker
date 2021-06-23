/**
* @author Matteo Basso @https://github.com/mbasso
* @author hexxone / https://hexx.one
*
* @license
* Copyright (c) 2021 hexxone All rights reserved.
* Licensed under the GNU GENERAL PUBLIC LICENSE.
* See LICENSE file in the project root for full license information.
*
*/

import {WascLoader} from './WascLoader';
import WascWorker from 'worker-loader!./Wasc';

import {Smallog} from '../Smallog';

import {WascInterface} from './WascInterface';
import {WascUtil} from './WascUtil';

/**
* Initializes a new WebAssembly instance.
* @param {string} source compiled .wasm module path
* @param {number} initialMem initial webassembly memory (default 4096)
* @param {Object} options passed to the module init
* @param {boolean} useWorker use worker or inline
* @return {Promise<WascInterface>} the initialized context
* @public
*/
export function wascWorker(source: string, initialMem = 4096, options: any = {}, useWorker: boolean = true): Promise<WascInterface> {
	return new Promise((resolve) => {
		// decide whether to use worker-threading or inline embedding.
		const loadWrk =(useWorker && typeof(Worker) !== 'undefined');
		Smallog.debug(`Loading ${source} as ${loadWrk ? 'worker' : 'inline'} with data=${JSON.stringify(options)}`, '[WASC] ');
		// initialize the actual module
		const doLoad = loadWrk ? loadWorker : loadInline;
		doLoad(source, initialMem, options).then((loaded) => {
			resolve(loaded);
		}).catch((err) => {
			// something went south?
			Smallog.error('init error: ' + err, '[WASC] ');
		});
	});
}


/**
* @ignore
* Inline loads a compiled webassembly module.
* Basically the normal WebAssembly usage,
* just with api- and "run()"-compatibility
* @param {string} path compiled module path
* @param {number} initialMem initial memory size in kb
* @param {Object} options import Objects
* @return {Promise<WascInterface>} module
* @public
*/
function loadInline(path: string, initialMem: number, options: any): Promise<WascInterface> {
	return new Promise(async (resolve) => {
	// let ascExports: any;
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
			},
		};

		// get import object
		const {getImportObject} = options;
		const myImports = Object.assign({}, staticImports);
		if (getImportObject !== undefined) {
			Object.assign(myImports, getImportObject());
		}

		const byteModule = await WascUtil.myFetch(path);
		const inst = new WascLoader().instantiateSync(byteModule, myImports);

		/**
		* Run a function inside the worker.
		* @warning This is potentially dangerous due to eval!
		* @param {string} func stringified function to eval inside worker context
		* @param {Object} params Data to pass in
		* @return {Object} eval result
		*/
		const run = (func, ...params) => {
			return new Promise((res) => {
				const fun = new Function(`return ${func}`)();
				res(fun({
					module: inst.module,
					instance: inst.instance,
					exports: inst.exports,
					params,
				}));
			});
		};

		// we done here
		resolve({
			exports: inst.exports,
			run,
		});
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
* @public
*/
function loadWorker(source: string, options): Promise<WascInterface> {
	return new Promise((...reslv) => {
		// WRAP IN WORKER
		let promCnt = 0;
		const promises = {};

		const worker = new WascWorker(options);

		worker.onmessage = (e) => {
			const {id, result, action, payload} = e.data;

			if (action === WascUtil.ACTIONS.COMPILE_MODULE) {
				// COMPILE MODULE & RESOLVE EXPORTS
				if (result === 0) {
					// SUCCESS
					const {exports} = payload;

					promises[id][0]({

						// wrap the returned context/thread exports into promises
						exports: exports.reduce((acc, exp) => ({
							...acc,
							[exp]: (...params) => new Promise((...rest) => {
								promises[++promCnt] = rest;
								worker.postMessage({
									id: promCnt,
									action: WascUtil.ACTIONS.CALL_FUNCTION_EXPORT,
									payload: {
										func: exp,
										params,
									},
								}, WascUtil.getTransferableParams(params));
							}),
						}), {}),

						// export context/thread run function
						run: (func, ...params) => new Promise((...rest) => {
							promises[++promCnt] = rest;
							worker.postMessage({
								id: promCnt,
								action: WascUtil.ACTIONS.RUN_FUNCTION,
								payload: {
									func: func.toString(),
									params,
								},
							}, WascUtil.getTransferableParams(params));
						}),

					});
				} else if (result === 1) {
					// ERROR
					promises[id][1](payload);
				}

			// CALL FUNCTION
			} else if (
				action === WascUtil.ACTIONS.CALL_FUNCTION_EXPORT ||
				action === WascUtil.ACTIONS.RUN_FUNCTION
			) {
				promises[id][result](payload);
			}

			promises[id] = null;
		};

		promises[++promCnt] = reslv;

		worker.postMessage({
			id: promCnt,
			action: WascUtil.ACTIONS.COMPILE_MODULE,
			payload: source,
		});
	});
}


export * from './WascInterface';
export * from './WascUtil';
