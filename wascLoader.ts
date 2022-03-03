import { Module } from "assemblyscript";
import { AnyTypedArray } from "../";
import { ASUtil, WascBasic } from "./WascInterface";

/**
 * Customized TypeScript AssemblyScript loader
 */
export class WascLoader {
	// Runtime header offsets
	private ID_OFFSET = -8;
	private SIZE_OFFSET = -4;

	// Runtime ids
	private ARRAYBUFFER_ID = 0;
	private STRING_ID = 1;

	// Runtime type information
	private ARRAYBUFFERVIEW = 1 << 0;
	private ARRAY = 1 << 1;
	private STATICARRAY = 1 << 2;
	private VAL_ALIGN_OFFSET = 6;
	private VAL_SIGNED = 1 << 11;
	private VAL_FLOAT = 1 << 12;
	private VAL_MANAGED = 1 << 14;

	// Array(BufferView) layout
	private ARRAYBUFFERVIEW_BUFFER_OFFSET = 0;
	private ARRAYBUFFERVIEW_DATASTART_OFFSET = 4;
	private ARRAYBUFFERVIEW_DATALENGTH_OFFSET = 8;
	private ARRAYBUFFERVIEW_SIZE = 12;
	private ARRAY_LENGTH_OFFSET = 12;
	private ARRAY_SIZE = 16;

	private _THIS = Symbol();

	private STRING_DECODE_THRESHOLD = 32;
	private decoder = new TextDecoder("utf-16le");

	private E_NOEXPORTRUNTIME =
		"Operation requires compiling with --exportRuntime";

	/**
	 * Handle missing runtimme error
	 */
	private err_noRuntime() {
		throw Error(this.E_NOEXPORTRUNTIME);
	}

	/**
	 * Gets a string from an U32 and an U16 view on a memory.
	 * @param {ArrayBuffer} buffer
	 * @param {number} ptr
	 * @return {string}
	 */
	private getStringImpl(buffer: ArrayBuffer, ptr: number): string {
		const len = new Uint32Array(buffer)[(ptr + this.SIZE_OFFSET) >>> 2] >>> 1;
		const arr = new Uint16Array(buffer, ptr, len);
		if (len <= this.STRING_DECODE_THRESHOLD) {
			return String.fromCharCode(...arr);
		}
		return this.decoder.decode(arr);
	}

	/**
	 * Prepares the base module prior to instantiation.
	 * @param {any} imports
	 * @return {Object}
	 */
	private preInstantiate(imports: any): object {
		// console.log('[WascLoader] preInstantiate', imports);

		const extendedExports: WebAssembly.Exports = {};

		const getString = (memory: WebAssembly.Memory, ptr: number) => {
			if (!memory) return "<yet unknown>";
			return this.getStringImpl(memory.buffer, ptr);
		};

		// add common imports used by stdlib for convenience
		const env = (imports.env = imports.env || {});

		env.abort =
			env.abort ||
			function abort(msg, file, line, colm) {
				const memory: WebAssembly.Memory = extendedExports.memory || env.memory; // prefer exported, otherwise try imported
				throw Error(
					`abort: ${getString(memory, msg)} at ${getString(
						memory,
						file
					)}:${line}:${colm}`
				);
			};

		env.trace =
			env.trace ||
			function trace(msg, n, ...args) {
				const memory: WebAssembly.Memory = extendedExports.memory || env.memory;
				console.log(
					`trace: ${getString(memory, msg)}${n ? " " : ""}${args
						.slice(0, n)
						.join(", ")}`
				);
			};

		env.seed = env.seed || Date.now;
		imports.Math = imports.Math || Math;
		imports.Date = imports.Date || Date;

		return extendedExports;
	}

	/**
	 * Prepares the final module once instantiation is complete.
	 * @param {any} extendedExports
	 * @param {WebAssembly.Instance} instance
	 * @return {ASUtil}
	 * @public
	 */
	public postInstantiate(
		extendedExports: any,
		instance: WebAssembly.Instance
	): ASUtil {
		const exports = instance.exports;

		const memory = exports.memory as WebAssembly.Memory;
		const table = exports.table as WebAssembly.Table;

		// =========================================================
		// 						HELPER FUNCTIONS
		// =========================================================

		const __new = (exports.__new || this.err_noRuntime) as ASUtil["__new"];
		const __collect = (exports.__collect ||
			this.err_noRuntime) as ASUtil["__collect"];
		const __pin = (exports.__pin || this.err_noRuntime) as any;
		const __unpin = (exports.__unpin || this.err_noRuntime) as any;
		const __rtti_base = exports.__rtti_base as any;

		const getRttiCount = __rtti_base
			? function (arr) {
					return arr[__rtti_base >>> 2];
			  }
			: this.err_noRuntime;

		/**
		 * Gets the runtime type info for the given id.
		 * @param {number} id internal Type ID
		 * @return {number}
		 */
		const getInfo = (id: number): number => {
			const U32 = new Uint32Array(memory.buffer);
			const count = getRttiCount(U32);
			if ((id >>>= 0) >= count) throw Error(`invalid id: ${id}`);
			return U32[((__rtti_base + 4) >>> 2) + id * 2];
		};

		/**
		 * Gets and validate runtime type info for the given id for array like objects
		 * @param {number} id
		 * @return {number}
		 */
		const getArrayInfo = (id: number): number => {
			const info = getInfo(id);
			if (!(info & (this.ARRAYBUFFERVIEW | this.ARRAY | this.STATICARRAY)))
				throw Error(`not an array: ${id}, flags=${info}`);
			return info;
		};

		/**
		 * Gets the runtime base id for the given id.
		 * @param {number} id
		 * @return {number}
		 */
		const getBase = (id: number): number => {
			const U32 = new Uint32Array(memory.buffer);
			const count = getRttiCount(U32);
			if ((id >>>= 0) >= count) throw Error(`invalid id: ${id}`);
			return U32[((__rtti_base + 4) >>> 2) + id * 2 + 1];
		};

		/**
		 * Gets the runtime alignment of a collection's values.
		 * @param {number} info i
		 * @return {number} lul
		 */
		const getValueAlign = (info: number): number => {
			return 31 - Math.clz32((info >>> this.VAL_ALIGN_OFFSET) & 31); // -1 if none
		};

		/**
		 * Returns the appropiate array view implementation for the data
		 * @param {number} alignLog2
		 * @param {number} signed
		 * @param {number} float
		 * @return {any} lul
		 */
		const getView = (
			alignLog2: number,
			signed: number,
			float: number
		): typeof AnyTypedArray => {
			const buffer = memory.buffer;
			if (float) {
				switch (alignLog2) {
					case 2:
						return new Float32Array(buffer);
					case 3:
						return new Float64Array(buffer);
				}
			} else {
				switch (alignLog2) {
					case 0:
						return new (signed ? Int8Array : Uint8Array)(buffer);
					case 1:
						return new (signed ? Int16Array : Uint16Array)(buffer);
					case 2:
						return new (signed ? Int32Array : Uint32Array)(buffer);
					case 3:
						return new (signed ? BigInt64Array : BigUint64Array)(buffer);
				}
			}
			throw Error(`unsupported align: ${alignLog2}`);
		};

		/**
		 * Copies a typed array's values from the module's memory.
		 * @param {any} Type constructor
		 * @param {number} alignLog2
		 * @param {number} ptr
		 * @return {Array}
		 */
		const getTypedArray = (
			Type: any,
			alignLog2: number,
			ptr: number
		): Array<any> => {
			return new Type(getTypedArrayView(Type, alignLog2, ptr));
		};

		/**
		 * Gets a live view on a typed array's values in the module's memory.
		 * @param {any} Type constructor
		 * @param {number} alignLog2
		 * @param {number} ptr
		 * @return {ArrayView}
		 */
		const getTypedArrayView = (
			Type: any,
			alignLog2: number,
			ptr: number
		): any => {
			const buffer = memory.buffer;
			const U32 = new Uint32Array(buffer);
			const bufPtr = U32[(ptr + this.ARRAYBUFFERVIEW_DATASTART_OFFSET) >>> 2];
			return new Type(
				buffer,
				bufPtr,
				U32[(bufPtr + this.SIZE_OFFSET) >>> 2] >>> alignLog2
			);
		};

		/**
		 * Attach a set of get TypedArray and View functions to the exports.
		 * @param {Object} ctor
		 * @param {string} name
		 * @param {number} align
		 */
		const attachTypedArrayFunctions = (
			ctor: object,
			name: string,
			align: number
		) => {
			extendedExports[`__get${name}`] = getTypedArray.bind(null, ctor, align);
			extendedExports[`__get${name}View`] = getTypedArrayView.bind(
				null,
				ctor,
				align
			);
		};

		// =========================================================
		// 						REAL FUNCTIONS
		// =========================================================

		const __newString: ASUtil["__newString"] = (str) => {
			if (str == null) return 0;
			const length = str.length;
			const ptr = __new(length << 1, this.STRING_ID);
			const U16 = new Uint16Array(memory.buffer);
			for (let i = 0, p = ptr >>> 1; i < length; ++i)
				U16[p + i] = str.charCodeAt(i);
			return ptr;
		};

		const __getString: ASUtil["__getString"] = (ptr) => {
			if (!ptr) return null;
			const buffer = memory.buffer;
			const id = new Uint32Array(buffer)[(ptr + this.ID_OFFSET) >>> 2];
			if (id !== this.STRING_ID) throw Error(`not a string: ${ptr}`);
			return this.getStringImpl(buffer, ptr);
		};

		const __newArray = (id, values): ASUtil["__newArray"] => {
			const info = getArrayInfo(id);
			const align = getValueAlign(info);
			const length = values.length;
			const buf = __new(
				length << align,
				info & this.STATICARRAY ? id : this.ARRAYBUFFER_ID
			);
			let result;
			if (info & this.STATICARRAY) {
				result = buf;
			} else {
				__pin(buf);
				const arr = __new(
					info & this.ARRAY ? this.ARRAY_SIZE : this.ARRAYBUFFERVIEW_SIZE,
					id
				);
				__unpin(buf);
				const U32 = new Uint32Array(memory.buffer);
				U32[(arr + this.ARRAYBUFFERVIEW_BUFFER_OFFSET) >>> 2] = buf;
				U32[(arr + this.ARRAYBUFFERVIEW_DATASTART_OFFSET) >>> 2] = buf;
				U32[(arr + this.ARRAYBUFFERVIEW_DATALENGTH_OFFSET) >>> 2] =
					length << align;
				if (info & this.ARRAY)
					U32[(arr + this.ARRAY_LENGTH_OFFSET) >>> 2] = length;
				result = arr;
			}
			const view = getView(
				align,
				info & this.VAL_SIGNED,
				info & this.VAL_FLOAT
			);
			if (info & this.VAL_MANAGED) {
				for (let i = 0; i < length; ++i) {
					const value = values[i];
					view[(buf >>> align) + i] = value;
				}
			} else {
				view.set(values, buf >>> align);
			}
			return result;
		};

		const __getArrayView: ASUtil["__getArrayView"] = (arr) => {
			const U32 = new Uint32Array(memory.buffer);
			const id = U32[(arr + this.ID_OFFSET) >>> 2];
			const info = getArrayInfo(id);
			const align = getValueAlign(info);
			let buf =
				info & this.STATICARRAY
					? arr
					: U32[(arr + this.ARRAYBUFFERVIEW_DATASTART_OFFSET) >>> 2];
			const length =
				info & this.ARRAY
					? U32[(arr + this.ARRAY_LENGTH_OFFSET) >>> 2]
					: U32[(buf + this.SIZE_OFFSET) >>> 2] >>> align;
			return getView(
				align,
				info & this.VAL_SIGNED,
				info & this.VAL_FLOAT
			).subarray((buf >>>= align), buf + length);
		};

		const __getArray: ASUtil["__getArray"] = (arr) => {
			const input = __getArrayView(arr);
			const len = input.length;
			const out = new Array(len);
			for (let i = 0; i < len; i++) out[i] = input[i];
			return out;
		};

		const __getArrayBuffer: ASUtil["__getArrayBuffer"] = (ptr) => {
			const buffer = memory.buffer;
			const length = new Uint32Array(buffer)[(ptr + this.SIZE_OFFSET) >>> 2];
			return buffer.slice(ptr, ptr + length);
		};

		const __instanceof: ASUtil["__instanceof"] = (ptr, baseId) => {
			const U32 = new Uint32Array(memory.buffer);
			let id = U32[(ptr + this.ID_OFFSET) >>> 2];
			if (id <= getRttiCount(U32)) {
				do {
					if (id == baseId) return true;
					id = getBase(id);
				} while (id);
			}
			return false;
		};

		extendedExports.__new = __new;
		extendedExports.__pin = __pin;
		extendedExports.__unpin = __unpin;
		extendedExports.__collect = __collect;
		extendedExports.__newString = __newString;
		extendedExports.__getString = __getString;
		extendedExports.__newArray = __newArray;
		extendedExports.__getArrayView = __getArrayView;
		extendedExports.__getArray = __getArray;
		extendedExports.__getArrayBuffer = __getArrayBuffer;
		extendedExports.__instanceof = __instanceof;

		[
			Int8Array,
			Uint8Array,
			Uint8ClampedArray,
			Int16Array,
			Uint16Array,
			Int32Array,
			Uint32Array,
			Float32Array,
			Float64Array,
		].forEach((ctor) => {
			attachTypedArrayFunctions(
				ctor,
				ctor.name,
				31 - Math.clz32(ctor.BYTES_PER_ELEMENT)
			);
		});

		if (typeof BigUint64Array !== "undefined") {
			[BigUint64Array, BigInt64Array].forEach((ctor) => {
				attachTypedArrayFunctions(ctor, ctor.name.slice(3), 3);
			});
		}

		// Pull basic exports to extendedExports so code in preInstantiate can use them
		extendedExports.memory = extendedExports.memory || memory;
		extendedExports.table = extendedExports.table || table;

		// Demangle exports and provide the usual utility on the prototype
		return this.demangle(exports, extendedExports);
	}

	/**
	 * @param {Object} src
	 * @return {boolean} evalueate if param instanceof Fetch-Response
	 */
	private isResponse(src: object): boolean {
		return typeof Response !== "undefined" && src instanceof Response;
	}

	/**
	 * @param {Object} src
	 * @return {boolean} param instanceof WebAssembly.Module
	 */
	private isModule(src: object): boolean {
		return src instanceof WebAssembly.Module;
	}

	/**
	 * Demangles an AssemblyScript module's exports to a friendly object structure.
	 * @param {Object} exports
	 * @param {Object} extendedExports
	 * @return {ASUtil} processed exports
	 */
	private demangle(exports: object, extendedExports: object = {}): ASUtil {
		const setArgumentsLength = exports["__argumentsLength"]
			? (length) => {
					exports["__argumentsLength"].value = length;
			  }
			: exports["__setArgumentsLength"] ||
			  exports["__setargc"] ||
			  (() => {
					/* nop */
			  });

		for (const internalName in exports) {
			if (!Object.prototype.hasOwnProperty.call(exports, internalName))
				continue;
			const elem = exports[internalName];
			const parts = internalName.split(".");
			let curr = extendedExports;
			while (parts.length > 1) {
				const part = parts.shift();
				if (!Object.prototype.hasOwnProperty.call(curr, part)) curr[part] = {};
				curr = curr[part];
			}
			let name = parts[0];
			const hash = name.indexOf("#");
			if (hash >= 0) {
				const className = name.substring(0, hash);
				const classElem = curr[className];
				if (typeof classElem === "undefined" || !classElem.prototype) {
					const ctor = function (...args) {
						return ctor.wrap(ctor.prototype.constructor(0, ...args));
					};
					ctor.prototype = {
						valueOf() {
							return this[this._THIS];
						},
					};
					ctor.wrap = function (thisValue) {
						return Object.create(ctor.prototype, {
							[this._THIS]: { value: thisValue, writable: false },
						});
					};
					if (classElem) {
						Object.getOwnPropertyNames(classElem).forEach((name) =>
							Object.defineProperty(
								ctor,
								name,
								Object.getOwnPropertyDescriptor(classElem, name)
							)
						);
					}
					curr[className] = ctor;
				}
				name = name.substring(hash + 1);
				curr = curr[className].prototype;
				if (/^(get|set):/.test(name)) {
					if (
						!Object.prototype.hasOwnProperty.call(
							curr,
							(name = name.substring(4))
						)
					) {
						const getter = exports[internalName.replace("set:", "get:")];
						const setter = exports[internalName.replace("get:", "set:")];
						Object.defineProperty(curr, name, {
							get() {
								return getter(this[this._THIS]);
							},
							set(value) {
								setter(this[this._THIS], value);
							},
							enumerable: true,
						});
					}
				} else {
					if (name === "constructor") {
						(
							(curr[name] = (...args) => {
								setArgumentsLength(args.length);
								return elem(...args);
							}) as any
						).original = elem;
					} else {
						// instance method
						(
							(curr[name] = function (...args) {
								// !
								setArgumentsLength(args.length);
								return elem(this[this._THIS], ...args);
							}) as any
						).original = elem;
					}
				}
			} else {
				if (/^(get|set):/.test(name)) {
					if (
						!Object.prototype.hasOwnProperty.call(
							curr,
							(name = name.substring(4))
						)
					) {
						Object.defineProperty(curr, name, {
							get: exports[internalName.replace("set:", "get:")],
							set: exports[internalName.replace("get:", "set:")],
							enumerable: true,
						});
					}
				} else if (typeof elem === "function" && elem !== setArgumentsLength) {
					(
						(curr[name] = (...args) => {
							setArgumentsLength(args.length);
							return elem(...args);
						}) as any
					).original = elem;
				} else {
					curr[name] = elem;
				}
			}
		}
		return extendedExports as any;
	}

	/**
	 * Asynchronously instantiates an AssemblyScript module from anything that can be instantiated.
	 * @param {Response | WebAssembly.Module | BufferSource} source
	 * @param {WebAssembly.Imports} imports (optional)
	 * @return {Promise<WascBasic>}
	 * @public
	 */
	public async instantiate(
		source: any,
		imports: WebAssembly.Imports = {}
	): Promise<WascBasic> {
		if (this.isResponse((source = await source)))
			return this.instantiateStreaming(source, imports);

		const module: Module = this.isModule(source)
			? source
			: await WebAssembly.compile(source);
		const extended = this.preInstantiate(imports);
		const instance = await WebAssembly.instantiate(module, imports);
		const exports = this.postInstantiate(extended, instance);
		return { module, instance, exports };
	}

	/**
	 * Synchronously instantiates an AssemblyScript module from a WebAssembly.Module or binary buffer.
	 * @param {Module | BufferSource} source
	 * @param {WebAssembly.Imports} imports (optional)
	 * @return {WascBasic}
	 * @public
	 */
	public instantiateSync(
		source: any,
		imports: WebAssembly.Imports = {}
	): WascBasic {
		const module = this.isModule(source)
			? source
			: new WebAssembly.Module(source);
		const extended = this.preInstantiate(imports);
		const instance = new WebAssembly.Instance(module, imports);
		const exports = this.postInstantiate(extended, instance);
		return { module, instance, exports };
	}

	/**
	 * Asynchronously instantiates an AssemblyScript module from a response, i.e. as obtained by `fetch`.
	 * @param {Response} source
	 * @param {WebAssembly.Imports} imports (optional)
	 * @return {Promise<WascBasic>}
	 * @public
	 */
	public async instantiateStreaming(
		source: Response,
		imports: WebAssembly.Imports = {}
	): Promise<WascBasic> {
		if (!WebAssembly.instantiateStreaming) {
			return this.instantiate(
				this.isResponse((source = await source))
					? (source as Response).arrayBuffer()
					: source,
				imports
			);
		}
		const extended = this.preInstantiate(imports);
		const result = await WebAssembly.instantiateStreaming(source, imports);
		const exports = this.postInstantiate(extended, result.instance);
		return { ...result, exports };
	}
}
