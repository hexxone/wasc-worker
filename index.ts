/**
 * @author Matteo Basso @https://github.com/mbasso
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

import { ResultObject, ASUtil } from '@assemblyscript/loader';

import { LoadInline, LoadWorker } from './WascLoader';

export default function WascInit(source: string, options: any = {}, useWorker: boolean = true, keepModules: boolean = true): Promise<ResultObject & { exports: ASUtil }> {
  return new Promise(async resolve => {
    // reuse loaded module?
    const noPointName = source.replace(".", "_");
    if (keepModules && window[noPointName]) resolve(window[noPointName]);
    // initialize the actual module
    const promiseMe = (useWorker && Worker) ? LoadWorker : LoadInline;
    const result = await promiseMe(source, options);
    // keep the loaded module?
    if (keepModules) window[noPointName] = result;
    // return the freshly initialized module
    resolve(result);
  });
}
