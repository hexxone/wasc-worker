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

import loader from '@assemblyscript/loader';
import {makeRuntime, myFetch, ACTIONS, getTransferableParams, INITIAL_MEM} from './WascRT';

const wascw: Worker = self as any;
const memory = new WebAssembly.Memory({initial: INITIAL_MEM});

let ascImports: {};
let ascInstance: WebAssembly.Instance;
let ascModule: WebAssembly.Module;
let ascExports: any;

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

wascw.addEventListener('message', (e) => {
	const {id, action, payload, getImportObject} = e.data;

	const sendMessage = (result, payload) => {
		wascw.postMessage({
			id,
			action,
			result,
			payload,
		}, getTransferableParams(payload));
	};

	const onError = (ex) => sendMessage(1, '' + ex);
	const onSuccess = sendMessage.bind(null, 0);

	if (action === ACTIONS.COMPILE_MODULE) {
		Promise.resolve()
			.then(async () => {
			// get import object
				ascImports = Object.assign({}, staticImports);
				if (getImportObject !== undefined) {
					Object.assign(ascImports, getImportObject());
				}

				// make webassembly
				const byteModule = await myFetch(payload);
				const {module, instance, exports} = loader.instantiateSync(byteModule, ascImports);

				// get Runtime Exports
				const rtExports = makeRuntime(
					memory,
					exports.allocF64Array,
					exports.allocU32Array,
				);

				// Add Helpers
				Object.assign(exports, {...rtExports});

				// remembr module
				ascModule = module;
				ascInstance = instance;
				ascExports = exports;

				// return available methods as strings to main ctx
				onSuccess({
					exports: Object.keys(ascExports),
				});
			})
			.catch(onError);
	} else if (action === ACTIONS.CALL_FUNCTION_EXPORT) {
		const {func, params} = payload;

		Promise.resolve()
			.then(() => {
				// run the function with parameters
				// eslint-disable-next-line prefer-spread
				onSuccess(ascExports[func].apply(ascExports, params));
			})
			.catch(onError);
	} else if (action === ACTIONS.RUN_FUNCTION) {
		const {func, params} = payload;

		Promise.resolve()
			.then(() => {
				const fun = new Function(`return ${func}`)();
				onSuccess(fun({
					module: ascModule,
					instance: ascInstance,
					importObject: ascExports,
					params,
				}));
			})
			.catch(onError);
	}
});

