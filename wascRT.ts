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

export default function MakeRT(memory: WebAssembly.Memory, allocF64, allocU32) {

    var mem, F64, U32;
    var cached = new WeakMap();

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