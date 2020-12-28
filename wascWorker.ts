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

"use strict";

import loader from "@assemblyscript/loader";
import ACTIONS from "./actions";
import MakeRT from "./wascRT";

const getTransferableParams = (...params) =>
  params.filter(x => (
    (x instanceof ArrayBuffer) ||
    (x instanceof MessagePort) ||
    (x instanceof ImageBitmap)
  )) || [];

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

const wascw: Worker = self as any;

// @TODO customizable
const memory = new WebAssembly.Memory({ initial: 32000 });

var rtExports: any;
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

var ascImports: {};
var ascInstance: WebAssembly.Instance;
var ascModule: WebAssembly.Module;
var ascExports: any;

var allExports: string[];

wascw.addEventListener("message", (e) => {
  const { id, action, payload, getImportObject } = e.data;
  console.log(e);

  const sendMessage = (result, payload) => {
    wascw.postMessage({
      id,
      action,
      result,
      payload,
    }, getTransferableParams(payload));
  };

  const onError = ex => sendMessage(1, '' + ex);
  const onSuccess = sendMessage.bind(null, 0);

  if (action === ACTIONS.COMPILE_MODULE) {
    Promise.resolve()
      .then(() => {
        // get import object
        ascImports = Object.assign({}, staticImports);
        if (getImportObject !== undefined)
          Object.assign(ascImports, getImportObject());

        // make streaming webassembly
        return loader.instantiate(myFetch(payload), ascImports);
      })
      .then(({ module, instance, exports }) => {
        // get Runtime Exports
        rtExports = MakeRT(
          memory,
          exports.allocF64Array,
          exports.allocU32Array
        );
        // remembr module
        ascModule = module;
        ascInstance = instance;
        ascExports = exports;

        // resolve available methods as strings
        allExports = Object.keys(exports);
        allExports.push(...Object.keys(rtExports));
        // return to main ctx
        onSuccess({
          exports: allExports
        });
      })
      .catch(onError);

  } else if (action === ACTIONS.CALL_FUNCTION_EXPORT) {
    const { func, params } = payload;
    Promise.resolve()
      .then(() => {
        // get saved instance
        var ctx = ascExports as any;
        // include local helpers
        Object.assign(ctx, { ...rtExports });
        // run the function with parameters
        onSuccess(ctx[func].apply(ctx, params));
      })
      .catch(onError);

  } else if (action === ACTIONS.RUN_FUNCTION) {
    const { func, params } = payload;
    Promise.resolve()
      .then(() => {
        const fun = new Function(`return ${func}`)();
        onSuccess(fun({
          module: ascModule,
          instance: ascInstance,
          importObject: allExports,
          params,
        }));
      })
      .catch(onError);
  }
});
