/**
* @author hexxone / https://hexx.one
*
* @license
* Copyright (c) 2021 hexxone All rights reserved.
* Licensed under the GNU GENERAL PUBLIC LICENSE.
* See LICENSE file in the project root for full license information.
*
* @description
* Web-AssemblyScript Worker
*/

'use strict';

import {WascLoader} from './WascLoader';
import {WascUtil} from './WascUtil';

const wascw: Worker = self as any;

/** For shared workers:
* Cross-Origin-Opener-Policy: same-origin
* Cross-Origin-Embedder-Policy: require-corp
*/
let ascImports: WebAssembly.Imports;
let ascInstance: WebAssembly.Instance;
let ascModule: WebAssembly.Module;
let ascExports: any;

/**
* @public
*/
const staticImports = {
	env: {
		logf(value) {
			console.log('F64: ' + value);
		},
		logi(value) {
			console.log('U32: ' + value);
		},
	},
};

wascw.addEventListener('message', (e) => {
	const {id, action, payload, getImportObject, memory} = e.data;

	/**
	* @param {number} result worker success = 0 | error = 1
	* @param {Object} payload worker result | error msg
	* @public
	*/
	const sendMessage = (result: number, payload: any) => {
		wascw.postMessage({
			id,
			action,
			result,
			payload,
		}, WascUtil.getTransferableParams(payload));
	};

	const onError = (ex) => sendMessage(1, ex);
	const onSuccess = (res) => sendMessage(0, res);

	if (action === WascUtil.ACTIONS.COMPILE_MODULE) {
		// get & compile the module, then export functions
		Promise.resolve()
			.then(async () => {
				// assume we get the memory passed to the worker
				ascImports = Object.assign({env: {memory}}, staticImports);
				// apply additional import object
				if (getImportObject instanceof Object) {
					ascImports = Object.assign(ascImports, getImportObject);
				}

				// make webassembly
				const byteModule = await WascUtil.myFetch(payload);
				const inst = new WascLoader().instantiateSync(byteModule, ascImports);

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
				});
			})
			.catch(onError);
	} else if (action === WascUtil.ACTIONS.CALL_FUNCTION_EXPORT) {
		// run an exported function with parameters
		const {func, params} = payload;
		// eslint-disable-next-line prefer-spread
		Promise.resolve().then(() => onSuccess(ascExports[func].apply(ascExports, params))).catch(onError);
	} else if (action === WascUtil.ACTIONS.RUN_FUNCTION) {
		// run a custom function with parameters
		const {func, params} = payload;
		Promise.resolve()
			.then(() => {
				const fun = new Function(`return ${func}`)();
				/**
			* @public
			*/
				onSuccess(fun({
					module: ascModule,
					instance: ascInstance,
					exports: ascExports,
					params,
				}));
			})
			.catch(onError);
	}
});

