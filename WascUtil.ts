/**
 *
 * @author hexxone / https://hexx.one
 *
 * @license
 * Copyright (c) 2026 hexxone All rights reserved.
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
async function myFetch(
    path: string,
    resType: XMLHttpRequestResponseType | 'response' = 'arraybuffer',
    owMime?: string
): Promise<any> {
    const headers = new Headers();

    if (owMime) {
        headers.set('Accept', owMime);
    }

    const response = await fetch(path, {
        headers
    });

    if (!response.ok) {
        console.error(`myFetch failed: ${response.status} ${response.statusText}`, path);
    }

    if (resType === 'response') {
        return response;
    }

    switch (resType) {
        case 'arraybuffer': return response.arrayBuffer();
        case 'blob': return response.blob();
        case 'json': return response.json();
        case 'text': return response.text();
        default: return response.arrayBuffer();
    }
}

export const WascUtil = {
    ACTIONS,
    getTransferableParams,
    myFetch
};
