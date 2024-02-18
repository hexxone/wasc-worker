/**
 *
 * @author hexxone / https://hexx.one
 *
 * @license
 * Copyright (c) 2024 hexxone All rights reserved.
 * Licensed under the GNU GENERAL PUBLIC LICENSE.
 * See LICENSE file in the project root for full license information.
 * @ignore
 */

/**
 * Worker <-> Maincontext communication
 */
enum ACTIONS {
    COMPILE_MODULE = 0,
    CALL_FUNCTION_EXPORT = 1,
    RUN_FUNCTION = 2
}

/**
 * Filter out transferrable parameters for passing into WebWorkers
 * @public
 * @param {Object} params The given Items to filter
 * @returns {Object} WebWorker-passable items
 */
function getTransferableParams(...params: any): any {
    return (
        params.filter((x) => {
            return (
                x instanceof ArrayBuffer
                || x instanceof MessagePort
                || x instanceof ImageBitmap
            );
        }) || []
    );
}

/**
 * Small reusable fetch function, should work for local & web server files
 * @public
 * @param {string} path file to request
 * @param {string} resType type of data to request (default = arraybuffer)
 * @param {string} owMime force-override mime-type (optional)
 * @returns {Object} XMLHttpRequest.response (converted to resType)
 */
function myFetch(
    path: string,
    resType = 'arraybuffer',
    owMime?: string
): Promise<any> {
    return new Promise((res) => {
        const request = new XMLHttpRequest();

        request.open('GET', path);
        if (owMime) {
            request.overrideMimeType(owMime);
        }
        request.responseType = resType as any;
        request.onload = () => {
            if (request.status !== 200) {
                console.error(request);
            }
            res(request.response);
        };
        request.send();
    });
}

export const WascUtil = {
    ACTIONS,
    getTransferableParams,
    myFetch
};
