// PDF-Ansicht (pdf.js). Zoom 100 % = Seite passt komplett ins Fenster (Seitenmodus)
// bzw. in die Breite (Halbe Seite / Endlos).
import { loadPdfJs } from './libs.js';
import { debounce, h } from './util.js';

const PAD = 8;
const MAX_CANVAS_PIXELS = 18e6;

export class PdfView {
  constructor({ scroller, blob, song, settings, callbacks }) {
    this.scroller = scroller;
    this.blob = blob;
    this.callbacks = callbacks;
    this.zoom = song.zoomLevel;
    this.mode = song.displayMode;
    this.page = Math.max(1, song.currentPage || 1);
    this.scrollRatio = song.scrollRatio || 0;
    this.documentTheme = settings.documentTheme;
    this.offsetStep = settings.offsetStep;
    this.smooth = settings.appTheme !== 'eink';
    this.tasks = new Set();
    this.token = 0;
    this.items = [];
    this.destroyed = false;
    this.saveScroll = debounce(() => this.onScrollSettled(), 250);
  }

  async start() {
    const pdfjs = await loadPdfJs();
    try {
      this.pdf = await pdfjs.getDocument({ data: new Uint8Array(await this.blob.arrayBuffer()) }).promise;
    } catch (error) {
      console.error(error);
      throw new Error('Die PDF konnte nicht dargestellt werden. Die Datei ist möglicherweise beschädigt.');
    }
    this.pageCount = this.pdf.numPages;
    this.page = Math.min(this.page, this.pageCount);
    this.onScroll = () => { this.renderVisible(); this.updateLabel(); this.saveScroll(); };
    this.scroller.addEventListener('scroll', this.onScroll, { passive: true });
    this.resizeObserver = new ResizeObserver(() => this.onResize());
    this.resizeObserver.observe(this.scroller);
    this.lastSize = `${this.scroller.clientWidth}x${this.scroller.clientHeight}`;
    await this.layout();
  }

  get inScrollMode() { return this.mode !== 'page'; }

  get label() {
    if (!this.pageCount) return '';
    return `Seite ${this.inScrollMode ? this.visiblePage() : this.page} / ${this.pageCount}`;
  }

  updateLabel() { this.callbacks.position?.(this.label); }

  cancelRenders() {
    this.token++;
    for (const task of this.tasks) task.cancel();
    this.tasks.clear();
  }

  async layout({ atEnd = false } = {}) {
    if (this.destroyed) return;
    this.cancelRenders();
    const token = this.token;
    this.items = [];
    this.host = h('div', { class: `pdf-doc doc-${this.documentTheme} mode-${this.mode}` });
    this.scroller.replaceChildren(this.host);
    try {
      if (this.mode === 'page') await this.layoutPage(token, atEnd);
      else await this.layoutScroll(token);
    } catch (error) {
      if (token === this.token) { console.error(error); this.callbacks.error?.('Die PDF konnte nicht dargestellt werden.'); }
    }
    this.updateLabel();
  }

  async renderCanvas(canvas, pdfPage, cssScale, token) {
    const base = pdfPage.getViewport({ scale: 1 });
    let pixelScale = cssScale * Math.min(window.devicePixelRatio || 1, 2);
    const area = base.width * base.height * pixelScale * pixelScale;
    if (area > MAX_CANVAS_PIXELS) pixelScale *= Math.sqrt(MAX_CANVAS_PIXELS / area);
    const viewport = pdfPage.getViewport({ scale: pixelScale });
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    canvas.style.width = `${base.width * cssScale}px`;
    canvas.style.height = `${base.height * cssScale}px`;
    const task = pdfPage.render({ canvasContext: canvas.getContext('2d'), viewport });
    this.tasks.add(task);
    try {
      await task.promise;
    } catch (error) {
      if (error?.name !== 'RenderingCancelledException') throw error;
    } finally {
      this.tasks.delete(task);
    }
    return token === this.token;
  }

  async layoutPage(token, atEnd) {
    const pdfPage = await this.pdf.getPage(this.page);
    if (token !== this.token) return;
    const base = pdfPage.getViewport({ scale: 1 });
    const width = this.scroller.clientWidth - PAD * 2;
    const height = this.scroller.clientHeight - PAD * 2;
    const cssScale = Math.min(width / base.width, height / base.height) * this.zoom;
    const canvas = h('canvas', { role: 'img', 'aria-label': `PDF-Seite ${this.page}` });
    this.host.append(canvas);
    await this.renderCanvas(canvas, pdfPage, cssScale, token);
    if (token === this.token) this.scroller.scrollTop = atEnd ? this.scroller.scrollHeight : 0;
  }

  async layoutScroll(token) {
    const width = this.scroller.clientWidth - PAD * 2;
    const pages = [];
    for (let number = 1; number <= this.pageCount; number++) {
      const pdfPage = await this.pdf.getPage(number);
      if (token !== this.token) return;
      const base = pdfPage.getViewport({ scale: 1 });
      const cssScale = (width / base.width) * this.zoom;
      const canvas = h('canvas', { role: 'img', 'aria-label': `PDF-Seite ${number}` });
      canvas.style.width = `${base.width * cssScale}px`;
      canvas.style.height = `${base.height * cssScale}px`;
      const holder = h('div', { class: 'pdf-page' }, canvas);
      this.host.append(holder);
      pages.push({ number, pdfPage, canvas, holder, cssScale, rendered: false });
    }
    this.items = pages;
    const max = this.scroller.scrollHeight - this.scroller.clientHeight;
    this.scroller.scrollTop = Math.max(0, max * this.scrollRatio);
    this.renderVisible();
  }

  /** Rendert nur Seiten im sichtbaren Bereich plus einen Bildschirm Vorlauf in beide Richtungen. */
  renderVisible() {
    if (!this.inScrollMode) return;
    const height = this.scroller.clientHeight;
    const from = this.scroller.scrollTop - height;
    const to = this.scroller.scrollTop + height * 2;
    const token = this.token;
    for (const item of this.items) {
      const top = item.holder.offsetTop;
      if (item.rendered || top + item.holder.offsetHeight < from || top > to) continue;
      item.rendered = true;
      void this.renderCanvas(item.canvas, item.pdfPage, item.cssScale, token).catch((error) => console.error(error));
    }
  }

  visiblePage() {
    const top = this.scroller.scrollTop + this.scroller.clientHeight * 0.25;
    let current = 1;
    for (const item of this.items) if (item.holder.offsetTop <= top) current = item.number;
    return current;
  }

  onScrollSettled() {
    if (!this.inScrollMode) return;
    const max = this.scroller.scrollHeight - this.scroller.clientHeight;
    this.scrollRatio = max > 0 ? this.scroller.scrollTop / max : 0;
    this.callbacks.save?.({ scrollRatio: this.scrollRatio, currentPage: this.visiblePage() });
  }

  scrollByPixels(pixels) {
    this.scroller.scrollBy({ top: pixels, behavior: this.smooth ? 'smooth' : 'auto' });
  }

  next() {
    const { scroller } = this;
    const height = scroller.clientHeight;
    if (this.mode === 'page') {
      if (scroller.scrollTop + height < scroller.scrollHeight - 4) { this.scrollByPixels(height * 0.92); return; }
      if (this.page >= this.pageCount) return;
      this.page++;
      this.callbacks.save?.({ currentPage: this.page });
      void this.layout();
      return;
    }
    this.scrollByPixels(height * (this.mode === 'offset' ? this.offsetStep / 100 : 0.75));
  }

  prev() {
    const { scroller } = this;
    const height = scroller.clientHeight;
    if (this.mode === 'page') {
      if (scroller.scrollTop > 4) { this.scrollByPixels(-height * 0.92); return; }
      if (this.page <= 1) return;
      this.page--;
      this.callbacks.save?.({ currentPage: this.page });
      void this.layout({ atEnd: true });
      return;
    }
    this.scrollByPixels(-height * (this.mode === 'offset' ? this.offsetStep / 100 : 0.75));
  }

  setZoom(zoom) { this.zoom = zoom; void this.layout(); }

  setMode(mode) {
    if (this.inScrollMode) this.onScrollSettled();
    if (mode !== 'page' && this.mode === 'page') this.scrollRatio = this.pageCount > 1 ? (this.page - 1) / (this.pageCount - 1) : 0;
    if (mode === 'page' && this.inScrollMode) this.page = this.visiblePage();
    this.mode = mode;
    this.callbacks.save?.({ displayMode: mode, currentPage: this.page });
    void this.layout();
  }

  onResize() {
    const size = `${this.scroller.clientWidth}x${this.scroller.clientHeight}`;
    if (size === this.lastSize) return;
    this.lastSize = size;
    clearTimeout(this.resizeTimer);
    this.resizeTimer = setTimeout(() => void this.layout(), 350);
  }

  destroy() {
    this.destroyed = true;
    this.cancelRenders();
    clearTimeout(this.resizeTimer);
    this.saveScroll.cancel();
    this.resizeObserver?.disconnect();
    this.scroller.removeEventListener('scroll', this.onScroll);
    void this.pdf?.destroy();
  }
}
