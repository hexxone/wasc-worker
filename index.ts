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

import {Smallog, WascLoader, WascInterface, WascUtil} from '../';

import WascWorker from 'worker-loader!./Wasc';


const LOGHEAD = '[WASC] ';
const NO_SUPP = '>>> WebAssembly failed! Initialization cannot continue. <<<';

const wasmSupport = (() => {
	try {
		if (typeof WebAssembly === 'object' && typeof WebAssembly.instantiate === 'function') {
			const module = new WebAssembly.Module(Uint8Array.of(0x0, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00));
			return (module instanceof WebAssembly.Module) && (new WebAssembly.Instance(module) instanceof WebAssembly.Instance);
		}
	} catch (e) {
		Smallog.error(NO_SUPP + '\r\nReason: ' + e, LOGHEAD);
	}
	return false;
})();

/**
* Initializes a new WebAssembly instance.
* @param {string} source compiled .wasm module path
* @param {number} memSize initial webassembly memory (default 4096)
* @param {Object} options passed to the module init
* @param {boolean} useWorker use worker or inline
* @return {Promise<WascInterface>} the initialized context
* @public
*/
export function wascWorker(source: string, memSize: number = 4096, options: any = {}, useWorker: boolean = true): Promise<WascInterface> {
	return new Promise((resolve, reject) => {
		if (!wasmSupport) {
			reject(NO_SUPP);
			return;
		}
		// decide whether to use worker-threading or inline embedding.
		const hasWrk = typeof (Worker) !== 'undefined';
		if (useWorker && !hasWrk) Smallog.error('WebWorkers are not supported? Using inline loading as fallback...');
		const loadWrk = (useWorker && hasWrk);
		Smallog.debug(`Loading ${source} as ${loadWrk ? 'worker' : 'inline'} with data=${JSON.stringify(options)}`, LOGHEAD);
		// initialize the actual module
		const doLoad = loadWrk ? loadWorker : loadInline;
		doLoad(source, memSize, options).then((loaded) => {
			resolve(loaded);
		}).catch((err) => {
			// something went south?
			Smallog.error('init error: ' + err, LOGHEAD);
			reject(err);
		});
	});
}


/**
* @ignore
* Inline loads a compiled webassembly module.
* Basically the normal WebAssembly usage,
* just with api- and "run()"-compatibility
* @param {string} path compiled module path
* @param {number} memSize initial memory pages *(64KiB)
* @param {Object} options import Objects
* @return {Promise<WascInterface>} module
* @public
*/
function loadInline(path: string, memSize: number, options?: any): Promise<WascInterface> {
	return new Promise(async (resolve) => {
		// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/SharedArrayBuffer/Planned_changes
		const coid = window['crossOriginIsolated'] === true;
		const memory = new WebAssembly.Memory({
			initial: memSize,
			maximum: memSize,
			shared: coid,
		});

		/**
		 * gather imports
		 * @public
		 */
		let myImports = {
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
		const {getImportObject} = options;
		if (getImportObject) myImports = Object.assign(myImports, getImportObject);

		// get & make module
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
			sharedMemory: coid ? memory : null,
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
* @param {number} memSize initial memory pages
* @param {Object} options import Objects
* @return {Promise<WascInterface>} module
* @public
*/
function loadWorker(source: string, memSize: number, options?: any): Promise<WascInterface> {
	return new Promise((...reslv) => {
		// create shared memory?
		const coid = window['crossOriginIsolated'] === true;
		const memOpts = {
			initial: memSize,
			maximum: memSize,
			shared: coid,
		};

		// WRAP IN WORKER
		let promCnt = 0;
		const promises = {};

		const worker = new WascWorker();

		worker.onmessage = (e) => {
			// console.log('main-message', e.data);

			const {id, result, action, payload} = e.data;

			if (action === WascUtil.ACTIONS.COMPILE_MODULE) {
				// COMPILE MODULE & RESOLVE EXPORTS
				if (result === 0) {
					// SUCCESS
					const {exports, sharedMemory} = payload;

					promises[id][0]({
						// module memory
						sharedMemory,

						// wrap the returned context/thread exports into postMessage-promises
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
			payload: {source},
			getImportObject: options,
			memOpts,
		});
	});
}


export * from './WascInterface';
export * from './WascUtil';
export * from './WascLoader';
