
/**
*
* @author hexxone / https://hexx.one
*
* @license
* Copyright (c) 2021 hexxone All rights reserved.
* Licensed under the GNU GENERAL PUBLIC LICENSE.
* See LICENSE file in the project root for full license information.
* @ignore
*/

/**
* Small reusable fetch function, should work for local & web server files
* @public
* @param {string} path file to request
* @param {string} resType type of data to request (default = arraybuffer)
* @param {string} owMime force-override mime-type (optional)
* @return {Object} XMLHttpRequest.response (converted to resType)
*/
export function myFetch(path: string, resType: string = 'arraybuffer', owMime?: string): Promise<any> {
	return new Promise((res) => {
		const request = new XMLHttpRequest();
		request.open('GET', path);
		if (owMime) request.overrideMimeType(owMime);
		request.responseType = resType as any;
		request.onload = () => {
			if (request.status != 200) console.error(request);
			res(request.response);
		};
		request.send();
	});
}

/**
* Worker <-> Maincontext communication
* @public
*/
/* eslint-disable no-unused-vars */
export enum ACTIONS {
	COMPILE_MODULE = 0,
	CALL_FUNCTION_EXPORT = 1,
	RUN_FUNCTION = 2
}

/**
* Filter out transferrable parameters for passing into WebWorkers
* @public
* @param {Object} params The given Items to filter
* @return {Object} WebWorker-passable items
*/
export function getTransferableParams(...params: any): any {
	return params.filter((x) => (
		(x instanceof ArrayBuffer) ||
		(x instanceof MessagePort) ||
		(x instanceof ImageBitmap)
	)) || [];
}


