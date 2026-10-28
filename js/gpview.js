// Guitar-Pro-Ansicht (alphaTab). Gerendert wird immer nur ein „Seitenbereich“ ab einem Starttakt;
// beim Vorwärtsblättern beginnt die nächste Seite mit dem Takt, der vorher unten rechts zuletzt sichtbar war.
import { BarPager, fitSystems } from './logic.js';
import { alphaTabFontDirectory, loadAlphaTab } from './libs.js';
import { h } from './util.js';

const HIDDEN_ELEMENTS = ['ScoreTitle', 'ScoreSubTitle', 'ScoreArtist', 'ScoreAlbum', 'ScoreWords', 'ScoreMusic', 'ScoreWordsAndMusic', 'ScoreCopyright'];
const RENDER_TIMEOUT_MS = 20000;

export class GpView {
  constructor({ scroller, blob, song, theme, callbacks }) {
    this.scroller = scroller;
    this.blob = blob;
    this.callbacks = callbacks;
    this.zoom = song.zoomLevel;
    this.notationMode = song.notationMode;
    this.barsPerRow = song.barsPerRow || 0;
    this.trackIds = song.selectedTrackIds;
    this.startHint = song.startBar ?? 0;
    this.dark = theme === 'dark';
    this.busy = false;
    this.queued = false;
    this.lastCount = 0;
    this.fit = null;
    this.destroyed = false;
  }

  async start() {
    const at = (this.alphaTab = await loadAlphaTab());
    this.host = h('div', { class: 'gp-host' });
    this.clip = h('div', { class: 'gp-clip' }, this.host);
    this.scroller.replaceChildren(this.clip);

    const bytes = new Uint8Array(await this.blob.arrayBuffer());
    try {
      this.score = at.importer.ScoreLoader.loadScoreFromBytes(bytes, new at.Settings());
    } catch (error) {
      console.error(error);
      throw new Error('Die Guitar-Pro-Datei konnte nicht gelesen werden. Sie ist vermutlich beschädigt oder unvollständig – bitte erneut exportieren bzw. übertragen und neu importieren.');
    }
    this.total = this.score.masterBars.length;
    this.pager = new BarPager(this.total, this.startHint);
    this.tracks = this.score.tracks.map((track, index) => ({ index, name: track.name?.trim() || `Spur ${index + 1}` }));
    this.callbacks.tracks?.(this.tracks);
    if (!Array.isArray(this.trackIds) || !this.trackIds.some((id) => id < this.tracks.length)) this.trackIds = [0];
    this.trackIds = this.trackIds.filter((id) => id < this.tracks.length);

    this.resizeObserver = new ResizeObserver(() => this.onResize());
    this.resizeObserver.observe(this.scroller);
    this.lastSize = `${this.scroller.clientWidth}x${this.scroller.clientHeight}`;
    await this.showFrom(this.pager.start);
  }

  get selectedTracks() {
    return this.score.tracks.filter((track) => this.trackIds.includes(track.index));
  }

  applyNotation() {
    for (const track of this.selectedTracks) {
      for (const staff of track.staves) {
        staff.showStandardNotation = this.notationMode !== 'tabs';
        staff.showTablature = this.notationMode !== 'standard';
      }
    }
  }

  makeSettings(start, count) {
    const at = this.alphaTab;
    const settings = new at.Settings();
    settings.core.fontDirectory = alphaTabFontDirectory();
    settings.core.useWorkers = false;
    settings.core.enableLazyLoading = false;
    settings.player.enablePlayer = false;
    settings.player.enableCursor = false;
    const display = settings.display;
    display.layoutMode = at.LayoutMode.Page;
    display.justifyLastSystem = false;
    display.padding = [16, 10];
    display.startBar = start + 1;
    display.barCount = count;
    display.barsPerRow = this.barsPerRow || -1;
    display.scale = this.zoom;
    settings.notation.rhythmMode = this.notationMode === 'tabs' ? at.TabRhythmMode.ShowWithBars : at.TabRhythmMode.Automatic;
    for (const name of HIDDEN_ELEMENTS) settings.notation.elements.set(at.NotationElement[name], false);
    const ink = this.dark ? [240, 240, 240, 255] : [0, 0, 0, 255];
    for (const key of ['staffLineColor', 'barSeparatorColor', 'barNumberColor', 'mainGlyphColor', 'secondaryGlyphColor', 'scoreInfoColor']) {
      display.resources[key] = new at.model.Color(...ink);
    }
    return settings;
  }

  /**
   * Jeder Seitenaufbau bekommt ein frisches alphaTab-Objekt: Wiederholtes Rendern im selben Objekt
   * hängt neue Teilbilder an die alten an und überlagert so zwei Seiten.
   */
  render(start, count) {
    this.api?.destroy();
    this.host.replaceChildren();
    this.applyNotation();
    const api = (this.api = new this.alphaTab.AlphaTabApi(this.host, this.makeSettings(start, count)));
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Das Rendern der Noten hat zu lange gedauert.')), RENDER_TIMEOUT_MS);
      api.error.on((error) => { clearTimeout(timer); reject(new Error(String(error?.message ?? error))); });
      api.postRenderFinished.on(() => {
        const lookup = api.renderer.boundsLookup;
        if (!lookup?.staffSystems?.length) return;
        clearTimeout(timer);
        resolve(lookup);
      });
      api.renderScore(this.score, this.selectedTracks.map((track) => track.index));
    });
  }

  static systemsOf(lookup) {
    return lookup.staffSystems.map((system) => ({
      top: system.realBounds.y,
      bottom: system.realBounds.y + system.realBounds.h,
      firstBar: system.bars[0].index,
      lastBar: system.bars[system.bars.length - 1].index,
    }));
  }

  /** Rendert ab `start`, misst, welche Zeilen passen, und schneidet alles darunter ab. */
  async showFrom(start) {
    if (this.destroyed) return;
    if (this.busy) { this.queued = start; return; }
    this.busy = true;
    try {
      const height = this.scroller.clientHeight;
      const remaining = this.total - start;
      let count = Math.min(remaining, Math.max(8, this.lastCount * 2));
      for (let attempt = 0; attempt < 8; attempt++) {
        const lookup = await this.render(start, count);
        if (this.destroyed) return;
        const fit = fitSystems(GpView.systemsOf(lookup), height - 4);
        if (!fit) throw new Error('Die Noten konnten nicht angeordnet werden.');
        if (fit.complete && count < remaining) { count = Math.min(remaining, count * 2); continue; }
        this.fit = fit;
        this.lastCount = fit.lastBar - fit.firstBar + 1;
        this.clip.style.height = `${Math.max(1, Math.floor(fit.bottom) - 1)}px`;
        break;
      }
      this.callbacks.position?.(`Takt ${this.fit.firstBar + 1}–${this.fit.lastBar + 1} / ${this.total}`);
      this.callbacks.save?.({ startBar: this.pager.start });
    } catch (error) {
      console.error(error);
      this.callbacks.error?.(error.message);
    } finally {
      this.busy = false;
      if (this.queued !== false && !this.destroyed) {
        const next = this.queued;
        this.queued = false;
        void this.showFrom(next);
      }
    }
  }

  next() {
    if (this.busy || !this.fit) return;
    const start = this.pager.forward(this.fit);
    if (start === null) { this.callbacks.position?.(`Ende · Takt ${this.fit.firstBar + 1}–${this.fit.lastBar + 1} / ${this.total}`); return; }
    void this.showFrom(start);
  }

  prev() {
    if (this.busy) return;
    const start = this.pager.back(this.fit);
    if (start === null) return;
    void this.showFrom(start);
  }

  relayout() {
    this.pager.relayout();
    this.lastCount = 0;
    void this.showFrom(this.pager.start);
  }

  setZoom(zoom) { this.zoom = zoom; this.relayout(); }
  setNotation(mode) { this.notationMode = mode; this.relayout(); }
  setBarsPerRow(count) { this.barsPerRow = count; this.relayout(); }

  setTracks(ids) {
    if (!ids.length) return;
    this.trackIds = [...ids].sort((a, b) => a - b);
    this.callbacks.save?.({ selectedTrackIds: this.trackIds });
    this.relayout();
  }

  onResize() {
    const size = `${this.scroller.clientWidth}x${this.scroller.clientHeight}`;
    if (size === this.lastSize) return;
    this.lastSize = size;
    clearTimeout(this.resizeTimer);
    this.resizeTimer = setTimeout(() => this.relayout(), 350);
  }

  get label() {
    return this.fit ? `Takt ${this.fit.firstBar + 1}–${this.fit.lastBar + 1} / ${this.total}` : '';
  }

  destroy() {
    this.destroyed = true;
    clearTimeout(this.resizeTimer);
    this.resizeObserver?.disconnect();
    try { this.api?.destroy(); } catch (error) { console.error(error); }
  }
}
