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
* basic interface for loading a module
* @implements {ResultObject}
* @see https://www.assemblyscript.org/loader.html
*/
export class WascBasic implements ResultObject {
	/**
	* loaded WebAssembly.Module
	* @see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/WebAssembly/Module
	*/
	module: WebAssembly.Module;
	/**
	* loaded WebAssembly.Instance
	* @see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/WebAssembly/Instance
	*/
	instance: WebAssembly.Instance;
	/**
	* injected assemblyscript utility functions
	* @see https://www.assemblyscript.org/loader.html#module-instance-utility
	*/
	exports: ASUtil;
}

/**
* shared interface for loading a module
* @extends {WascBasic}
*/
export class WascInterface extends WascBasic {
	/**
	* Worker-context run function
	*/
	run: (func: typeof WascRun, ...params) => Promise<any>;
}

/**
* The call-struct for the internal run function
* @param {WascBasic} params the data passed into the run-function
*/
export function WascRun(params: WascBasic & {params:any}) {}
