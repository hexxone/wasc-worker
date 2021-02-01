// eslint-disable-next-line
export const getWasmSource = (source) => {
  let result = source;

  if (typeof result === 'string' && typeof location !== 'undefined') {
    result = result.trim();
    if (result.indexOf('/') === 0) {
      result = location.origin + result;
    } else if (result.indexOf('http') !== 0) {
      result = location.href +
        (location.href[location.href.length - 1] === '/' ? '' : '/') +
        result;
    }
  }
  return result;
};

export function myFetch(path: string): Promise<any> {
  return new Promise(res => {
    const request = new XMLHttpRequest();
    request.open('GET', path);
    request.responseType = "arraybuffer";
    request.onload = () => res(request.response);
    request.send();
  });
}