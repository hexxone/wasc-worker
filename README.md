# [wasc-worker](https://github.com/hexxone/wasc-worker)

is a custom fork of:
## [wasm-worker](https://github.com/mbasso/wasm-worker)

### specifically designed for AssemblyScript & TypeScript.

#### Please see below for the original Author(s) and Copyright!

## How to build AssemblyScript modules and use them in Workers

This repository includes a WebPack Plugin called "WascBuilderPlugin" for compiling AssemblyScript (a Typescript-variant) to WebAssembly modules. => Usage => Compiling

At the same time, it can be used to load and run the module in a [Web Worker](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Using_web_workers). => Usage => Running

Main target are browser environments.


## Install

You can "install" wasc-worker using this method for now:

```bash
git submodule add path/to/put/wasc-worker https://github.com/hexxone/wasc-worker
```

At a later time, there might be a node-package.
But for now everything is "experimental"..


## Usage:

### 1. Compiling

Notice: the extension ".asc" is used for determining the compile-targets in the next step.
You cannot mix different extensions.
E.g.: you cant require "utils.ts" from "index.asc".
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
      basedir: "../../../../assembly", // will compile all matched modules in this folder (recursive)
      modules: ["CloudGen.asc"], // modules to compile
      cleanup: true // decides if the temp-dir is cleaned after compiling (debugging?)
      shared: true, // additionally compile with "shared" memory flag
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

Now you should have the "add.wasm" module in your webpack compilation folder.

The WebAssembly module should export the "add"-function, "memory" and [AssemblyScript runtime](https://www.assemblyscript.org/loader.html#module-instance-utility).


### 2. Running

Assume the built example module from Step 1.

```ts
import wascWorker from 'wasc-worker';

// Method 1:
wascWorker('add.wasm')
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
wascWorker('add.wasm')
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

Almost everything has been made type-safe and should be self-explanatory.

#### [Documentation](https://hexxone.github.io/we_utils/)


## Supported environments

`wasc-worker` uses [fetch](https://developer.mozilla.org/it/docs/Web/API/Fetch_API),
[WebWorker's](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API) and
[WebAssembly](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/WebAssembly)
APIs.

There is a fallback included for Web-Workers, but you will need an up-to-date major Browser (like Chrome/Firefox).

Node.js usage is NOT explicitly implemented & was NOT tested, so you probably have to polyfill it.


###  Content-Security-Policy

You will also need these HTTP Headers due to [Security Requirements](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/SharedArrayBuffer#security_requirements) - following 'Spectre' from 2018.
```
https: true
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

## Inspiration

The project is inspired by [wasm-worker](https://github.com/mbasso/wasm-worker).


## Original Change Log

> The github Code of Conduct applies to this project.

This project adhered to [Semantic Versioning](http://semver.org/).

Every old release, along with the migration instructions, is documented on the Github [Releases](https://github.com/mbasso/wasm-worker/releases) page.


## Authors
**Matteo Basso**
- [github/mbasso](https://github.com/mbasso)
- [@teo_basso](https://twitter.com/teo_basso)

**hexxone**
- [github/hexxone](https://github.com/hexxone)


## Copyright and License

Original Author:
Copyright (c) 2018, Matteo Basso.

wasm-worker source code is licensed under the [MIT License](https://github.com/mbasso/wasm-worker/blob/master/LICENSE.md).
