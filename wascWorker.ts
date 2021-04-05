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

import {WascInterface} from './WascInterface';
import {LoadInline, LoadWorker} from './WascLoader';

/**
 * Initializes a new WebAssembly instance.
 * @param {string} source compiled .wasm module path
 * @param {Object} options passed to the module init
 * @param {boolean} useWorker use worker or inline
 * @return {Promise<WascInterface>} the initialized context
 */
export default function WascWorker(source: string, options: any = {}, useWorker: boolean = true): Promise<WascInterface> {
	return new Promise(async (resolve) => {
		// initialize the actual module
		const promiseMe = (useWorker && Worker) ? LoadWorker : LoadInline;
		const result = await promiseMe(source, options);

		// return the freshly initialized module
		resolve(result);
	});
}
