/**
* @author hexxone / https://hexx.one
*
* @license
* Copyright (c) 2021 hexxone All rights reserved.
* Licensed under the GNU GENERAL PUBLIC LICENSE.
* See LICENSE file in the project root for full license information.
*/


/**
 * Utility mixed in by the loader.
 * @public
 */
export interface ASUtil {
	memory?: WebAssembly.Memory;
	table?: WebAssembly.Table;

	/** Explicit start function, if requested. */
	_start(): void;

	/** Copies a string's value from the module's memory. */
	__getString(ptr: number): string;
	/** Copies an ArrayBuffer's value from the module's memory. */
	__getArrayBuffer(ptr: number): ArrayBuffer;

	/** Copies an array's values from the module's memory. Infers the array type from RTTI. */
	__getArray(ptr: number): number[];
	/** Copies an Int8Array's values from the module's memory. */
	__getInt8Array(ptr: number): Int8Array;
	/** Copies an Uint8Array's values from the module's memory. */
	__getUint8Array(ptr: number): Uint8Array;
	/** Copies an Uint8ClampedArray's values from the module's memory. */
	__getUint8ClampedArray(ptr: number): Uint8ClampedArray;
	/** Copies an Int16Array's values from the module's memory. */
	__getInt16Array(ptr: number): Int16Array;
	/** Copies an Uint16Array's values from the module's memory. */
	__getUint16Array(ptr: number): Uint16Array;
	/** Copies an Int32Array's values from the module's memory. */
	__getInt32Array(ptr: number): Int32Array;
	/** Copies an Uint32Array's values from the module's memory. */
	__getUint32Array(ptr: number): Uint32Array;
	/** Copies an Int32Array's values from the module's memory. */
	__getInt64Array?(ptr: number): BigInt64Array;
	/** Copies an Uint32Array's values from the module's memory. */
	__getUint64Array?(ptr: number): BigUint64Array;
	/** Copies a Float32Array's values from the module's memory. */
	__getFloat32Array(ptr: number): Float32Array;
	/** Copies a Float64Array's values from the module's memory. */
	__getFloat64Array(ptr: number): Float64Array;

	/** Gets a live view on an array's values in the module's memory. Infers the array type from RTTI. */
	__getArrayView(ptr: number): Uint32Array | Float32Array | Float64Array | Uint8Array | Int8Array | Uint16Array | Int16Array | Int32Array | BigUint64Array | BigInt64Array;
	/** Gets a live view on an Int8Array's values in the module's memory. */
	__getInt8ArrayView(ptr: number): Int8Array;
	/** Gets a live view on an Uint8Array's values in the module's memory. */
	__getUint8ArrayView(ptr: number): Uint8Array;
	/** Gets a live view on an Uint8ClampedArray's values in the module's memory. */
	__getUint8ClampedArrayView(ptr: number): Uint8ClampedArray;
	/** Gets a live view on an Int16Array's values in the module's memory. */
	__getInt16ArrayView(ptr: number): Int16Array;
	/** Gets a live view on an Uint16Array's values in the module's memory. */
	__getUint16ArrayView(ptr: number): Uint16Array;
	/** Gets a live view on an Int32Array's values in the module's memory. */
	__getInt32ArrayView(ptr: number): Int32Array;
	/** Gets a live view on an Uint32Array's values in the module's memory. */
	__getUint32ArrayView(ptr: number): Uint32Array;
	/** Gets a live view on an Int32Array's values in the module's memory. */
	__getInt64ArrayView?(ptr: number): BigInt64Array;
	/** Gets a live view on an Uint32Array's values in the module's memory. */
	__getUint64ArrayView?(ptr: number): BigUint64Array;
	/** Gets a live view on a Float32Array's values in the module's memory. */
	__getFloat32ArrayView(ptr: number): Float32Array;
	/** Gets a live view on a Float64Array's values in the module's memory. */
	__getFloat64ArrayView(ptr: number): Float64Array;

	/** Allocates an instance of the class represented by the specified id. */
	__new(size: number, id: number): number;
	/** Allocates a new string in the module's memory and returns a reference (pointer) to it. */
	__newString(str: string): number;
	/** Allocates a new array in the module's memory and returns a reference (pointer) to it. */
	__newArray(id: number, values: ArrayLike<number>): number;
	/** Retains a reference to a managed object externally, making sure that it doesn't become collected prematurely. Returns the pointer. */
	__retain(ptr: number): number;
	/** Releases a previously retained reference to a managed object, allowing the runtime to collect it once its reference count reaches zero. */
	__release(ptr: number): void;
	/** Forcefully resets the heap to its initial offset, effectively clearing dynamic memory. Stub runtime only. */
	__reset?(): void;
	/** Tests whether a managed object is an instance of the class represented by the specified base id. */
	__instanceof(ptr: number, baseId: number): boolean;
	/** Forces a cycle collection. Only relevant if objects potentially forming reference cycles are used. */
	__collect(): void;
  }


/**
* parameters for the inline run-function
* @see {WascInterface}
* @public
*/
export interface WascBasic {
	/**
	* loaded WebAssembly.Module
	* @see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/WebAssembly/Module
	* @public
	*/
	module: WebAssembly.Module;

	/**
	* loaded WebAssembly.Instance
	* @see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/WebAssembly/Instance
	* @public
	*/
	instance: WebAssembly.Instance;

	/**
	* injected assemblyscript utility functions
	* @see {ASUtil}
	* @public
	*/
	exports: ASUtil;
}

/**
* shared interface for loading a module
* @see {WascLoader}
* @public
*/
export interface WascInterface {
	/**
	* injected assemblyscript utility functions
	* @see {ASUtil}
	* @public
	*/
	exports: ASUtil;

	/**
	* Worker-context run function
	* @public
	*/
	run: (func: (params: WascBasic & {params:any}) => void, ...params) => Promise<any>;
}
