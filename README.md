# wasc-worker

is a custom fork of:
## wasm-worker

### Please see Authors and Copyright below!

### The github Code of Conduct applies to this project. Although this should not be worth mentioning.

> Build AssemblyScript modules and use them in Workers

This repository includes a WebPack Plugin called "WascBuilderPlugin" for compiling AssemblyScript (a Typescript-variant) to WebAssembly modules. => Usage => Compiling

At the same time, it can be used to load and run the module in a [Web Worker](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Using_web_workers). => Usage => Running

This repo mainly targets browser environments, because it uses the [worker_loader](https://github.com/webpack-contrib/worker-loader). Anything else has not been tested.

## Install

You can "install" wasc-worker using this method for now:

```bash
git submodule add path/to/put/wasc-worker https://github.com/hexxone/wasc-worker
```

At a later time, there might be a node-package. But for now it is "experimental" and intended for TypeScript usage...

## Usage:

### 1. Compiling

Notice: the extension ".asc" is used for determining the compile-targets in the next step and you can't mix different ones.
E.g.: you cannot require "utils.ts" from "index.asc".
If this collides with your naming scheme, you will have to alter the settings in Step 2.

So.. suppose you have an "add.asc" file with this content:
```asc

export function add(a: i32, b: i32): i32 {
  return a + b;
}
```

For building, you simply need to include the Plugin in your `webpack.config.js` like so:

```js

const WascBuilderPlugin = require('....wasc-worker/WascBuilderPlugin');

...

plugins: [
    ...
    // AssemblyScript compiler
    new WascBuilderPlugin({
      production: false, // decides whether to optimize OR generate a .map file
      relpath: '../../../', // will compile all matched files in this folder (recursive)
      extension: 'asc', // decides which files are to be compiled
      cleanup: true // decides if the temp-dir is cleaned after compiling (debugging?)
    }),
    ...
  ]

```

Running your Webpack build should now also print something like this:
```
[WasmPlugin] Gathering Infos....
[WasmPlugin] Compile debug: add.asc
I/O Read   :     0.042 ms  n=2
I/O Write  :     1.337 ms  n=2
Parse      :   299.502 ms  n=71
Initialize :    14.957 ms  n=1
Compile    :   147.420 ms  n=1
Emit       :   121.151 ms  n=1
Validate   :     6.969 ms  n=1
Optimize   :     0.584 ms  n=1
Transform  :          n/a  n=0
[WasmPlugin] Success: add.wasm
[WasmPlugin] Cleaning...
[WasmPlugin] delete: add.wasm
[WasmPlugin] delete: add.wasm.map
[WasmPlugin] finished.
```

Now you should have an "add.wasm" module in your webpack compilation folder that exports a function "add".


### 2. Running

Assume the built example module from Step 1.

```ts
import wascModule from 'wasc-worker';

// Method 1:
wascModule('add.wasm')
  .then(module => {
    return module.exports.add(1, 2);
  })
  .then(sum => {
    console.log('1 + 2 = ' + sum);
  })
  .catch(ex => {
    // ex is a string that represents the exception
    console.error(ex);
  });

// Method 2
// run js functions inside the worker thread/context
// to access importObject for example
wascModule('add.wasm')
  .then(module => {
    return module.run(({ module, instance, importObject, params }) => {
      const { exports } = instance;
      
      const sum = exports.add(...params);
      return '1 + 2 = ' + sum;
    }, [1, 2]);
  })
  .then(result => {
    console.log(result);
  });
```

### API

Here you can see the actual interface(s).

```ts
type JsCallback = (context: {
    module: WebAssembly.Module,
    instance: WebAssembly.Instance,
    importObject: importObject,
    params: any,
  }) => any;

type WasmWorkerModule = {
  // these are the merged exports from
  exports: {
    [export: string]: (...any: Array<any>) => Promise<any>
  },
  // run a js function inside the worker and provides it the given params
  // ⚠️ Caveat: the function you pass cannot rely on its surrounding scope!
  // It is executed in an isolated context.
  // Please use the "params" parameter to provide some values to the callback
  run: (callback: JsCallback, params?: any) => Promise<any>
};

type Options = {
  // @TODO fixing worker options
};

// browser only
wascModule(url: string, options?: Options, useWorker?: true): Promise<WasmWorkerModule> 

// universal
wascModule(bufferSource: TypedArray | ArrayBuffer, options?: Options, useWorker?: true): Promise<WasmWorkerModule>
```

## Browser support

`wasc-worker` uses [fetch](https://developer.mozilla.org/it/docs/Web/API/Fetch_API), [Worker](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API) and [WebAssembly](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/WebAssembly) APIs, they are broadly supported by major browser engines but youprobably need to polyfill them to support old versions (e.g. IE).


### Content-Security-Policy

If your app has a [Content-Security-Policy](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Content-Security-Policy),
wasc-worker require `worker-src data:` and `script-src data:` in your config.


## Inspiration

This project is inspired by [greenlet](https://github.com/developit/greenlet).


## Original Change Log

This project adhered to [Semantic Versioning](http://semver.org/).  
Every old release, along with the migration instructions, is documented on the Github [Releases](https://github.com/mbasso/wasm-worker/releases) page.


## Authors
**Matteo Basso**
- [github/mbasso](https://github.com/mbasso)
- [@teo_basso](https://twitter.com/teo_basso)

## Copyright and License
Original Author:

Copyright (c) 2018, Matteo Basso.

wasm-worker source code is licensed under the [MIT License](https://github.com/mbasso/wasm-worker/blob/master/LICENSE.md).
