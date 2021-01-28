
import { ResultObject, ASUtil } from '@assemblyscript/loader';

import WascWorker from 'worker-loader!./WascWorker';

import { getWasmSource } from './Utils';
import ACTIONS from './Actions';
import Load from './WascLoader';

const getTransferableParams = (params = []) =>
  params.filter(x => (
    (x instanceof ArrayBuffer) ||
    (x instanceof MessagePort) ||
    (x instanceof ImageBitmap)
  ));

export default function wascModule(source, options: any = {}, useWorker: boolean = true):
  Promise<ResultObject & { exports: ASUtil }> {

  // WRAP IN WORKER
  if (useWorker) {

    let currentId = 0;
    const promises = {};
    const worker = new WascWorker(options);

    worker.onmessage = (e) => {
      const { id, result, action, payload } = e.data;

      // COMPILE MODULE & RETURN EXPORTS
      if (action === ACTIONS.COMPILE_MODULE) {
        if (result === 0) {
          const { exports } = payload;

          promises[id][0]({

            // wrap the returned context/thread exports into promises
            exports: exports.reduce((acc, exp) => ({
              ...acc,
              [exp]: (...params) => new Promise((...rest) => {

                promises[++currentId] = rest;
                worker.postMessage({
                  id: currentId,
                  action: ACTIONS.CALL_FUNCTION_EXPORT,
                  payload: {
                    func: exp,
                    params,
                  },
                }, getTransferableParams(params));
              }),
            }), {}),

            // export context/thread run function
            run: (func, ...params) => new Promise((...rest) => {

              promises[++currentId] = rest;
              worker.postMessage({
                id: currentId,
                action: ACTIONS.RUN_FUNCTION,
                payload: {
                  func: func.toString(),
                  params,
                },
              }, getTransferableParams(params));
            }),
          });
        } else if (result === 1) {
          promises[id][1](payload);
        }

        // CALL FUNCTION
      } else if (
        action === ACTIONS.CALL_FUNCTION_EXPORT ||
        action === ACTIONS.RUN_FUNCTION
      ) {
        promises[id][result](payload);
      }

      promises[id] = null;
    };

    return new Promise((...params) => {

      promises[++currentId] = [...params];

      worker.postMessage({
        id: currentId,
        action: ACTIONS.COMPILE_MODULE,
        payload: getWasmSource(source),
      });
    });
  }

  // NO WORKER
  else return Load(source, options);
}
