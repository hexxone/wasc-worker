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
import ACTIONS from "./Actions";
import MakeRT from "./WascRT";

import { myFetch } from "./Utils";

const getTransferableParams = (...params) =>
  params.filter(x => (
    (x instanceof ArrayBuffer) ||
    (x instanceof MessagePort) ||
    (x instanceof ImageBitmap)
  )) || [];

const wascw: Worker = self as any;

// @TODO customizable
const memory = new WebAssembly.Memory({ initial: 8192 });

var ascImports: {};
var ascInstance: WebAssembly.Instance;
var ascModule: WebAssembly.Module;
var ascExports: any;

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

wascw.addEventListener("message", (e) => {
  const { id, action, payload, getImportObject } = e.data;
  
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
        var rtExports = MakeRT(
          memory,
          exports.allocF64Array,
          exports.allocU32Array
        );

        // Add Helpers
        Object.assign(exports, { ...rtExports });

        // remembr module
        ascModule = module;
        ascInstance = instance;
        ascExports = exports;

        // return available methods as strings to main ctx
        onSuccess({
          exports: Object.keys(ascExports)
        });
      })
      .catch(onError);

  } else if (action === ACTIONS.CALL_FUNCTION_EXPORT) {
    const { func, params } = payload;
    Promise.resolve()
      .then(() => {
        // run the function with parameters
        onSuccess(ascExports[func].apply(ascExports, params));
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
          importObject: ascExports,
          params,
        }));
      })
      .catch(onError);
  }
});
