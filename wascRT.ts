/**
 * 
 * @author D.Thiele @https://hexx.one
 *
 * @license
 * Copyright (c) 2020 D.Thiele All rights reserved.  
 * Licensed under the GNU GENERAL PUBLIC LICENSE.
 * See LICENSE file in the project root for full license information.
 * 
 * @description
 * 
 */

// TODO customizable ??
export const INITIAL_MEM = 4096;

export function MakeRuntime(memory: WebAssembly.Memory, allocF64, allocU32) {

    var mem, F64, U32;
    const cached = new WeakMap();

    function refreshMemory() {
        if (mem !== memory.buffer) {
            mem = memory.buffer;
            U32 = new Uint32Array(mem);
            F64 = new Float64Array(mem);
        }
    }

    function newF64Array(typedArray) {
        var ptr;
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

    function getF64Array(ptr) {
        refreshMemory();
        ptr >>>= 2;

        const offset = (U32[ptr] >>> 2) + 2;
        const len = U32[ptr + 1];

        return F64.subarray(offset, offset + len);
    }

    function newU32Array(typedArray) {
        var ptr;
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

// Small reusable fetch function, should work for local & web server files
export function myFetch(path: string, resType: string = "arraybuffer", owMime?: string): Promise<any> {
    return new Promise(res => {
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

export enum ACTIONS {
    COMPILE_MODULE = 0,
    CALL_FUNCTION_EXPORT = 1,
    RUN_FUNCTION = 2
}

export function getTransferableParams(...params) {
    return params.filter(x => (
        (x instanceof ArrayBuffer) ||
        (x instanceof MessagePort) ||
        (x instanceof ImageBitmap)
    )) || [];
}