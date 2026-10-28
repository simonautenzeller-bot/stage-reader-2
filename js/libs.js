// Die großen Bibliotheken werden erst geladen, wenn sie gebraucht werden (schnellerer Start).

let alphaTabPromise;
export function loadAlphaTab() {
  alphaTabPromise ??= new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = new URL('vendor/alphatab/alphaTab.min.js', document.baseURI).href;
    script.onload = () => (window.alphaTab ? resolve(window.alphaTab) : reject(new Error('alphaTab wurde nicht initialisiert.')));
    script.onerror = () => { alphaTabPromise = undefined; reject(new Error('alphaTab konnte nicht geladen werden.')); };
    document.head.append(script);
  });
  return alphaTabPromise;
}

export const alphaTabFontDirectory = () => new URL('vendor/alphatab/font/', document.baseURI).href;

let pdfPromise;
export function loadPdfJs() {
  pdfPromise ??= import('../vendor/pdfjs/pdf.min.mjs').then((pdfjs) => {
    pdfjs.GlobalWorkerOptions.workerSrc = new URL('../vendor/pdfjs/pdf.worker.min.mjs', import.meta.url).href;
    return pdfjs;
  }).catch((error) => { pdfPromise = undefined; throw error; });
  return pdfPromise;
}
