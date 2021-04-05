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

// TODO customize this according to needs
export const INITIAL_MEM = 4096;

/**
* @ignore
* Creates the required internal runtime functions
* @param {WebAssembly.Memory} memory initial WebAssembly memory
* @param {Function} allocF64
* @param {Function} allocU32
* @return {Object} Runtime
*/
export function makeRuntime(memory: WebAssembly.Memory, allocF64, allocU32) {
	let mem; let F64; let U32;
	const cached = new WeakMap();

	/**
	* Refreshes the local memory-representation.
	* This is usually required, after new memory was allocated in WebAssembly
	*/
	function refreshMemory() {
		if (mem !== memory.buffer) {
			mem = memory.buffer;
			U32 = new Uint32Array(mem);
			F64 = new Float64Array(mem);
		}
	}

	/**
	* Allocates a new Float64Array with given data in WebAssembly
	* @param {Array} typedArray Data to pass in
	* @return {Object} allocated array pointer
	*/
	function newF64Array(typedArray) {
		let ptr;
		if (!cached.has(typedArray)) {
			ptr = allocF64(typedArray.length);
			refreshMemory();
			cached.set(typedArray, ptr);
		} else {
			refreshMemory();
			ptr = cached.get(typedArray);
		}
		const dataStart = (U32[ptr >>> 2] >>> 2) + 2;
		F64.set(typedArray, dataStart >>> 1);
		return ptr;
	}

	/**
	* Copies and returns the float64array at given pointer
	* @param {Object} ptr allocated array pointer
	* @return {Float64Array} data
	*/
	function getF64Array(ptr) {
		refreshMemory();
		ptr >>>= 2;

		const offset = (U32[ptr] >>> 2) + 2;
		const len = U32[ptr + 1];

		return F64.subarray(offset, offset + len);
	}

	/**
	* Create a new Uint32Array in WebAssembly
	* @param {Array} typedArray Data to pass in
	* @return {Object} allocated array pointer
	*/
	function newU32Array(typedArray) {
		let ptr;
		if (!cached.has(typedArray)) {
			ptr = allocU32(typedArray.length);
			refreshMemory();
			cached.set(typedArray, ptr);
		} else {
			refreshMemory();
			ptr = cached.get(typedArray);
		}
		const dataStart = (U32[ptr >>> 2] >>> 2) + 2;
		U32.set(typedArray, dataStart);
		return ptr;
	}

	/**
	* Copies and returns the uint32array at given pointer
	* @param {Object} ptr allocated array pointer
	* @return {Uint32Array} data
	*/
	function getU32Array(ptr) {
		refreshMemory();
		ptr >>>= 2;

		const offset = (U32[ptr] >>> 2) + 2;
		const len = U32[ptr + 1];

		return U32.subarray(offset, offset + len);
	}

	return {
		newF64Array,
		getF64Array,
		newU32Array,
		getU32Array,
	};
}

/**
* Small reusable fetch function, should work for local & web server files
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
*/
/* eslint-disable no-unused-vars */
export enum ACTIONS {
	COMPILE_MODULE = 0,
	CALL_FUNCTION_EXPORT = 1,
	RUN_FUNCTION = 2
}

/**
* Filter out parameters for passing them into WebWorkers
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


