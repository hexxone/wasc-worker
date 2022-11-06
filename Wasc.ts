/**
 * @author Matteo Basso @https://github.com/mbasso
 * @author hexxone / https://hexx.one
 *
 * @license
 * Copyright (c) 2022 hexxone All rights reserved.
 * Licensed under the GNU GENERAL PUBLIC LICENSE.
 * See LICENSE file in the project root for full license information.
 *
 */

import { Smallog } from "../Smallog";
import { WascInterface } from "./WascInterface";
import { WascLoader } from "./WascLoader";
import { WascUtil } from "./WascUtil";

const LOGHEAD = "[WASC] ";
const NO_SUPP = ">>> WebAssembly failed! Initialization cannot continue. <<<";

import WascWorker from "worker-loader!./Wasc.worker";
// const WascWorker = () => new Worker(new URL("./Wasc.worker.js", import.meta.url));

const wasmSupport = (() => {
	try {
		if (
			typeof WebAssembly === "object" &&
			typeof WebAssembly.instantiate === "function"
		) {
			const module = new WebAssembly.Module(
				Uint8Array.of(0x0, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00)
			);
			return (
				module instanceof WebAssembly.Module &&
				new WebAssembly.Instance(module) instanceof WebAssembly.Instance
			);
		}
	} catch (e) {
		Smallog.error(NO_SUPP + "\r\nReason: " + e, LOGHEAD);
	}
	return false;
})();

/**
 * Initializes a new WebAssembly instance.
 * @param {string} source compiled .wasm module path
 * @param {number} memSize initial webassembly memory (default 4096)
 * @param {boolean} shared shared mem?
 * @param {Object} options passed to the module init
 * @param {boolean} useWorker use worker or inline
 * @return {Promise<WascInterface>} the initialized context
 * @public
 */
export function wascWorker(
	source: string,
	memSize = 4096,
	shared = false,
	options: any = {},
	useWorker = true
): Promise<WascInterface> {
	return new Promise((resolve, reject) => {
		if (!wasmSupport) {
			reject(NO_SUPP);
			return;
		}
		// decide whether to use worker-threading or inline embedding.
		const hasWrk = typeof Worker !== "undefined";
		if (useWorker && !hasWrk)
			Smallog.error(
				"WebWorkers are not supported? Using inline loading as fallback..."
			);
		const loadWrk = useWorker && hasWrk;
		Smallog.debug(
			`Loading ${source} as ${
				loadWrk ? "worker" : "inline"
			} with data=${JSON.stringify(options)}`,
			LOGHEAD
		);
		// initialize the actual module
		const doLoad = loadWrk ? loadWorker : loadInline;
		doLoad(source, memSize, shared, options)
			.then((loaded) => {
				resolve(loaded);
			})
			.catch((err) => {
				// something went south?
				Smallog.error("init error: " + err, LOGHEAD);
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
 * @param {boolean} shared shared mem?
 * @param {Object} options import Objects
 * @return {Promise<WascInterface>} module
 * @public
 */
function loadInline(
	path: string,
	memSize: number,
	shared = false,
	options?: any
): Promise<WascInterface> {
	return new Promise((resolve) => {
		// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/SharedArrayBuffer/Planned_changes
		const memory = new WebAssembly.Memory({
			initial: memSize,
			maximum: memSize,
			shared,
		});

		/**
		 * gather imports
		 * @public
		 */
		let myImports = {
			env: {
				memory,
				logf(value) {
					console.log("F64: " + value);
				},
				logi(value) {
					console.log("U32: " + value);
				},
			},
		};

		const { getImportObject } = options;
		if (getImportObject) myImports = Object.assign(myImports, getImportObject);

		// get & make module
		return WascUtil.myFetch(path)
			.then((res) => new WascLoader().instantiate(res, myImports))
			.then((inst) => {
				/**
				 * Run a function inside the worker.
				 * @warning This is potentially dangerous due to eval!
				 * @param {string} func stringified function to eval inside worker context
				 * @param {Object} params Data to pass in
				 * @return {Object} eval result
				 */
				const run = (func, ...params) => {
					return new Promise((res_) => {
						const fun_ = new Function(`return ${func}`)();
						res_(
							fun_({
								module: inst.module,
								instance: inst.instance,
								exports: inst.exports,
								params,
							})
						);
					});
				};

				// we done here
				resolve({
					shared: shared
						? new WascLoader().postInstantiate({}, {
								exports: { memory: memory },
						  } as any)
						: null,
					exports: inst.exports,
					run,
				});
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
 * @param {boolean} shared shared mem?
 * @param {Object} options import Objects
 * @return {Promise<WascInterface>} module
 * @public
 */
function loadWorker(
	source: string,
	memSize: number,
	shared = false,
	options?: any
): Promise<WascInterface> {
	return new Promise((...reslv) => {
		// create shared memory?
		const memOpts = {
			initial: memSize,
			maximum: memSize,
			shared,
		};

		// WRAP IN WORKER
		let promCnt = 0;
		const promises = {};

		const worker = new WascWorker();

		worker.onmessage = (e) => {
			// console.log('main-message', e.data);

			const { id, result, action, payload } = e.data;

			if (action === WascUtil.ACTIONS.COMPILE_MODULE) {
				// COMPILE MODULE & RESOLVE EXPORTS
				if (result === 0) {
					// SUCCESS
					const { exports, sharedMemory } = payload;

					promises[id][0]({
						// module memory
						sharedMemory,

						// wrap the returned context/thread exports into postMessage-promises
						exports: exports.reduce(
							(acc, exp) => ({
								...acc,
								[exp]: (...params) =>
									new Promise((...rest) => {
										promises[++promCnt] = rest;
										worker.postMessage(
											{
												id: promCnt,
												action: WascUtil.ACTIONS.CALL_FUNCTION_EXPORT,
												payload: {
													func: exp,
													params,
												},
											},
											WascUtil.getTransferableParams(params)
										);
									}),
							}),
							{}
						),

						// export context/thread run function
						run: (func, ...params) =>
							new Promise((...rest) => {
								promises[++promCnt] = rest;
								worker.postMessage(
									{
										id: promCnt,
										action: WascUtil.ACTIONS.RUN_FUNCTION,
										payload: {
											func: func.toString(),
											params,
										},
									},
									WascUtil.getTransferableParams(params)
								);
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
			payload: { source },
			getImportObject: options,
			memOpts: memOpts,
		});
	});
}
