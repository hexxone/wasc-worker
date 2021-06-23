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
const memory = new WebAssembly.Memory({initial: 4096}); // @TODO customize

let ascImports: {};
let ascInstance: WebAssembly.Instance;
let ascModule: WebAssembly.Module;
let ascExports: any;

/**
 * @public
 */
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

wascw.addEventListener('message', (e) => {
	const {id, action, payload, getImportObject} = e.data;

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
		Promise.resolve()
			.then(async () => {
			// get import object
				ascImports = Object.assign({}, staticImports);
				if (typeof getImportObject == 'function') {
					Object.assign(ascImports, getImportObject());
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
		const {func, params} = payload;

		Promise.resolve().then(() => {
			// run the function with parameters
			// eslint-disable-next-line prefer-spread
			onSuccess(ascExports[func].apply(ascExports, params));
		}).catch(onError);
	} else if (action === WascUtil.ACTIONS.RUN_FUNCTION) {
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

