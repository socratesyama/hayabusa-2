import { lang } from './i18n';
import { credit, AssetKind } from './credits';
const $ = (id: string) => document.getElementById(id)!;
const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
export type Mode = 0 | 1 | 2; // のんびり / じっくり / せんもん

export class Hud {
  private l = [$('h1'), $('h2'), $('h3'), $('h4')]; private cache = ['', '', '', ''];
  set(i: number, s: string) { if (this.cache[i] !== s) { this.cache[i] = s; this.l[i].textContent = s; } }
  /** HTML可（地球方向の回転矢印など）。内容が変わったときだけ再描画 */
  setHtml(i: number, html: string) { if (this.cache[i] !== html) { this.cache[i] = html; this.l[i].innerHTML = html; } }
  announce(s: string) { $('live').textContent = s; }
}
export class Hint {
  private el = $('hint'); private to = 0;
  show(s: string, first = false, ms = 0) { this.el.textContent = s; this.el.classList.toggle('first', first); this.el.classList.add('on'); clearTimeout(this.to); if (ms) this.to = window.setTimeout(() => this.hide(), ms); }
  hide() { this.el.classList.remove('on'); }
}
export class Card {
  private el = $('card'); open_ = false; onClose?: () => void;
  get isOpen() { return this.open_; }
  show(title: string, bodyHtml: string, creditKind?: AssetKind, extraCredit?: string) {
    const cr = [creditKind ? credit(creditKind) : '', extraCredit ?? ''].filter(Boolean).join(' / ');
    this.el.innerHTML = `<h2>${esc(title)}</h2>${bodyHtml}${cr ? `<div class="cr">${esc(cr)}</div>` : ''}`; this.el.classList.add('on'); this.open_ = true; }
  hide() { this.el.classList.remove('on', 'welcome'); this.open_ = false; this.onClose?.(); }
  get node() { return this.el; }
}
export interface ViewItem { src: string; caption: string; kind: AssetKind; credit2?: string; certainty?: string; }
export class Viewer {
  private el = $('viewer'); items: ViewItem[] = []; i = 0; isOpen = false; private restoreFocus: HTMLElement | null = null;
  open(items: ViewItem[], i = 0) { this.items = items; this.i = i; this.restoreFocus = document.activeElement as HTMLElement; this.isOpen = true; this.el.setAttribute('role', 'dialog'); this.el.setAttribute('aria-modal', 'true'); this.el.setAttribute('aria-label', '画像ビューア'); this.render(); this.el.classList.add('on'); (this.el.querySelector('.viewer-close') as HTMLButtonElement)?.focus(); }
  close() { this.el.classList.remove('on'); this.isOpen = false; this.el.removeAttribute('aria-modal'); this.restoreFocus?.focus(); this.restoreFocus = null; }
  step(d: number) { if (!this.items.length) return; this.i = (this.i + d + this.items.length) % this.items.length; this.render(); }
  private render() {
    const it = this.items[this.i];
    this.el.innerHTML = `<button class="viewer-close" type="button" aria-label="画像ビューアを閉じる">×</button><img alt="${esc(it.caption)}" src="${esc(it.src)}"><div class="cap">${esc(it.caption)}<div class="cr">${esc([credit(it.kind), it.credit2 ?? ''].filter(Boolean).join(' / '))}${this.items.length > 1 ? `　(${this.i + 1}/${this.items.length} ←→)` : ''}</div></div>`;
    this.el.querySelector('.viewer-close')?.addEventListener('click', () => this.close());
  }
  handleKey(e: KeyboardEvent) { if (!this.isOpen) return; if (e.key === 'Escape') { e.preventDefault(); this.close(); } else if (e.key === 'ArrowRight') { e.preventDefault(); this.step(1); } else if (e.key === 'ArrowLeft') { e.preventDefault(); this.step(-1); } }
}
/** P1-6: 起動時のモード選択は廃止。モードは M キー / 書庫内ボタンで切替（main.ts setMode）。 */
export const Intro = {
  el: () => $('intro'),
  line(s: string) { const e = $('intro'); let l = e.querySelector('.line') as HTMLElement; if (!l) { l = document.createElement('div'); l.className = 'line'; e.prepend(l); } l.textContent = s; },
  off() { $('intro').classList.add('off'); setTimeout(() => { $('intro').style.display = 'none'; }, 700); },
};
/** age-tier text: picks the depth for the mode (§4.10). data may provide {easy, normal, expert}; falls back to whatever exists. */
export function tierText(o: any, mode: Mode): string {
  if (!o) return '';
  const k = ['easy', 'normal', 'expert'][mode]; const alt = o[k] ?? o.normal ?? o.easy ?? o.expert; return typeof alt === 'string' ? alt : '';
}
export { esc, lang };
