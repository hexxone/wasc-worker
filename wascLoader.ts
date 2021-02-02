/**
 * @author D.Thiele @https://hexx.one
 *
 * @license
 * Copyright (c) 2020 D.Thiele All rights reserved.  
 * Licensed under the GNU GENERAL PUBLIC LICENSE.
 * See LICENSE file in the project root for full license information.  
 * 
 * @description
 * AssemblyScript module Loaders
 */

import loader, { ASUtil, ResultObject } from "@assemblyscript/loader";

// reused in worker, hence seperate file.
import { MakeRuntime, myFetch, ACTIONS, getTransferableParams, INITIAL_MEM } from "./WascRT";

import WascWorker from 'worker-loader!./WascWorker';

export function LoadInline(path: string, options: any = {}):
    Promise<ResultObject & { exports: ASUtil }> {

    var ascExports: any;
    const memory = new WebAssembly.Memory({ initial: INITIAL_MEM });
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
            }
        }
    };

    return new Promise(async resolve => {

        // get import object
        const { getImportObject } = options;
        var myImports = Object.assign({}, staticImports);
        if (getImportObject !== undefined)
            Object.assign(myImports, getImportObject());

        const byteModule = await myFetch(path);
        const { module, instance, exports } = loader.instantiateSync(byteModule, myImports);

        // get Exports
        const rtExports = MakeRuntime(
            memory,
            exports.allocF64Array,
            exports.allocU32Array
        );

        // Add Helpers
        Object.assign(exports, { ...rtExports });
        ascExports = exports;

        function run(func, ...params) {
            return new Promise(res => {
                const fun = new Function(`return ${func}`)();
                res(fun({
                    module,
                    instance,
                    importObject: exports,
                    params,
                }));
            })
        }

        // we done here
        resolve({ module, instance, exports, run } as any);
    });
}


export function LoadWorker(source: string, options: any = {}, useWorker: boolean = true): Promise<ResultObject & { exports: ASUtil }> {

    // WRAP IN WORKER
    let currentId = 0;
    const promises = {};
    const worker = new WascWorker(options);

    worker.onmessage = (e) => {
        const { id, result, action, payload } = e.data;

        // COMPILE MODULE & RETURN EXPORTS
        if (action === ACTIONS.COMPILE_MODULE) {
            if (result === 0) {
                const { exports } = payload;

                promises[id][0]({

                    // wrap the returned context/thread exports into promises
                    exports: exports.reduce((acc, exp) => ({
                        ...acc,
                        [exp]: (...params) => new Promise((...rest) => {

                            promises[++currentId] = rest;
                            worker.postMessage({
                                id: currentId,
                                action: ACTIONS.CALL_FUNCTION_EXPORT,
                                payload: {
                                    func: exp,
                                    params,
                                },
                            }, getTransferableParams(params));
                        }),
                    }), {}),

                    // export context/thread run function
                    run: (func, ...params) => new Promise((...rest) => {

                        promises[++currentId] = rest;
                        worker.postMessage({
                            id: currentId,
                            action: ACTIONS.RUN_FUNCTION,
                            payload: {
                                func: func.toString(),
                                params,
                            },
                        }, getTransferableParams(params));
                    }),

                });
            } else if (result === 1) {
                promises[id][1](payload);
            }

            // CALL FUNCTION
        } else if (
            action === ACTIONS.CALL_FUNCTION_EXPORT ||
            action === ACTIONS.RUN_FUNCTION
        ) {
            promises[id][result](payload);
        }

        promises[id] = null;
    };

    return new Promise((...params) => {

        promises[++currentId] = [...params];

        worker.postMessage({
            id: currentId,
            action: ACTIONS.COMPILE_MODULE,
            // TODO
            payload: source,
        });
    });
}