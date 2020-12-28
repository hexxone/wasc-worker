// DONT USE WORKER?

import loader, { ASUtil, ResultObject } from "@assemblyscript/loader";
import MakeRT from "./wascRT";

function myFetch(path: string) {
    return new Promise(res => {
        const request = new XMLHttpRequest();
        request.open('GET', path);
        request.responseType = 'arraybuffer';
        request.send();

        request.onload = function () {
            var bytes = request.response;
            res(bytes);
        };
    });
}

export default function Load(path: string, options: any = {}):
    Promise<ResultObject & { exports: ASUtil }> {

    // @TODO customizable
    var rtExports: any;
    const memory = new WebAssembly.Memory({ initial: 32000 });
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
                console.log(rtExports.getU32Array(ptr));
            },
            logF64Array(ptr) {
                console.log(rtExports.getF64Array(ptr));
            }
        }
    };

    return new Promise((resolve) => {

        // get import object
        const { getImportObject } = options;
        var myImports = Object.assign({}, staticImports);
        if (getImportObject !== undefined)
            Object.assign(myImports, getImportObject());

        loader.instantiate(myFetch(path), myImports).then(
            ({ module, instance, exports }) => {
                // get Exports
                rtExports = MakeRT(
                    memory,
                    exports.allocF64Array,
                    exports.allocU32Array
                );

                // Add Helpers
                Object.assign(exports, { ...rtExports });
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
            }
        );
    });
}