/**
 * @author hexxone / https://hexx.one
 *
 * @license
 * Copyright (c) 2021 hexxone All rights reserved.
 * Licensed under the GNU GENERAL PUBLIC LICENSE.
 * See LICENSE file in the project root for full license information.
 */

import {ResultObject, ASUtil} from '@assemblyscript/loader';

/**
 * The shared interface for loading a module
 */
export class WascInterface implements ResultObject {
    module: WebAssembly.Module;
    instance: WebAssembly.Instance;
    exports: ASUtil;
    run: (func, ...params) => Promise<any>;
}
