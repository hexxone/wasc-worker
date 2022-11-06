/**
 * @author hexxone / https://hexx.one
 *
 * @license
 * Copyright (c) 2022 hexxone All rights reserved.
 * Licensed under the GNU GENERAL PUBLIC LICENSE.
 * See LICENSE file in the project root for full license information.
 *
 * @description
 * Web-AssemblyScript Worker
 */

"use strict";

import { WascLoader } from "./WascLoader";
import { WascUtil } from "./WascUtil";

const wascw = self as any;

/** For shared workers:
 * Cross-Origin-Opener-Policy: same-origin
 * Cross-Origin-Embedder-Policy: require-corp
 * @public
 */
let ascImports: WebAssembly.Imports;

let ascInstance: WebAssembly.Instance;
let ascModule: WebAssembly.Module;
let ascExports: any;

wascw.addEventListener("message", (e) => {
	// console.log('wasc-message', e.data);

	const { id, action, payload, getImportObject, memOpts } = e.data;

	/**
	 * @param {number} result worker success = 0 | error = 1
	 * @param {Object} data worker result | error msg
	 * @public
	 */
	const sendMessage = (result: number, data: any) => {
		wascw.postMessage(
			{
				id,
				action,
				result,
				payload: data,
			},
			WascUtil.getTransferableParams(data)
		);
	};

	const onError = (ex) => sendMessage(1, ex);
	const onSuccess = (res) => sendMessage(0, res);

	const { source, func, params } = payload;

	switch (action) {
		// get & compile the module, then export functions
		case WascUtil.ACTIONS.COMPILE_MODULE:
			Promise.resolve()
				.then(async () => {
					// use shared memory, or create our own
					const memory = new WebAssembly.Memory(memOpts);
					/**
					 * @public
					 */
					ascImports = {
						env: {
							memory,
							logf: (value) => {
								console.log("F64: " + value);
							},
							logi: (value) => {
								console.log("U32: " + value);
							},
						},
					};

					// apply additional import object
					if (getImportObject instanceof Object) {
						ascImports = Object.assign(ascImports, getImportObject);
					}

					// make webassembly
					const byteModule = await WascUtil.myFetch(source);
					const inst = await new WascLoader().instantiate(
						byteModule,
						ascImports
					);

					// remembr module
					ascModule = inst.module;
					ascInstance = inst.instance;
					ascExports = inst.exports;

					/**
					 * return available methods as strings to main ctx
					 * @public
					 */
					onSuccess({
						exports: Object.keys(ascExports),
						sharedMemory: memOpts.shared ? memory : null,
					});
				})
				.catch(onError);
			break;

		// run an exported function with parameters
		case WascUtil.ACTIONS.CALL_FUNCTION_EXPORT:
			// eslint-disable-next-line prefer-spread
			Promise.resolve()
				.then(() => onSuccess(ascExports[func].apply(ascExports, params)))
				.catch(onError);
			break;

		// run a custom function with parameters
		case WascUtil.ACTIONS.RUN_FUNCTION:
			Promise.resolve()
				.then(() => {
					const fun = new Function(`return ${func}`)();
					/**
					 * @public
					 */
					onSuccess(
						fun({
							module: ascModule,
							instance: ascInstance,
							exports: ascExports,
							params,
						})
					);
				})
				.catch(onError);
			break;

		// protocol error
		default:
			console.error("[wasc-worker] Unknown action: " + JSON.stringify(e.data));
			break;
	}
});
