// P1-1 時間スライダー — 画面下部に常設。リュウグウ滞在期間（2018-06-27〜2019-11-13）を
// ドラッグで移動する。input[type=range] は日数解像度で足りないため自前のポインターUI。
// ホイールによる時間移動は廃止し、時刻調整はこのスライダーに一本化する。
import { MISSION_T0, MISSION_T1, fmtJST } from './time';

export interface SliderMarker { id: string; ms: number; label: string; }

export class TimeSlider {
  el: HTMLDivElement;
  private track: HTMLDivElement;
  private handle: HTMLDivElement;
  private markWrap: HTMLDivElement;
  private label: HTMLDivElement;
  private dragging = false;
  private enabled = true;
  private ms = MISSION_T0;
  /** 外部（イベント移動・時計）からの刻み。ドラッグ中は反映しない */
  private markers: SliderMarker[] = [];
  onSet: (ms: number) => void = () => 0;
  onMarkerClick: (id: string) => void = () => 0;

  constructor() {
    this.el = document.createElement('div');
    this.el.id = 'tslider';
    this.el.setAttribute('role', 'slider');
    this.el.setAttribute('aria-label', 'リュウグウ滞在期間の時間スライダー（2018-06-27〜2019-11-13）');
    this.el.setAttribute('aria-valuemin', String(MISSION_T0));
    this.el.setAttribute('aria-valuemax', String(MISSION_T1));
    this.el.setAttribute('aria-valuetext', fmtJST(this.ms));
    this.el.tabIndex = 0;
    this.el.innerHTML = `<div class="ts-track"></div><div class="ts-marks"></div><div class="ts-fill"></div><div class="ts-handle"></div><div class="ts-label"></div>`;
    document.body.appendChild(this.el);
    this.track = this.el.querySelector('.ts-track')!;
    this.markWrap = this.el.querySelector('.ts-marks')!;
    this.handle = this.el.querySelector('.ts-handle')!;
    const fill = this.el.querySelector('.ts-fill') as HTMLDivElement;
    this.label = this.el.querySelector('.ts-label')!;
    const setFromX = (clientX: number, fine: boolean) => {
      const r = this.track.getBoundingClientRect();
      const f = Math.max(0, Math.min(1, (clientX - r.left) / r.width));
      const snap = fine ? 3600e3 : 86400e3; // 通常1日スナップ / Shiftで1時間
      this.ms = Math.round((MISSION_T0 + f * (MISSION_T1 - MISSION_T0)) / snap) * snap;
      this.ms = Math.max(MISSION_T0, Math.min(MISSION_T1, this.ms));
      this.onSet(this.ms);
    };
    this.el.addEventListener('pointerdown', e => {
      if (!this.enabled) return;
      this.dragging = true; this.el.setPointerCapture(e.pointerId);
      this.el.classList.add('drag');
      setFromX(e.clientX, e.shiftKey);
    });
    this.el.addEventListener('pointermove', e => { if (this.dragging) setFromX(e.clientX, e.shiftKey); });
    const up = () => { this.dragging = false; this.el.classList.remove('drag'); };
    this.el.addEventListener('pointerup', up); this.el.addEventListener('pointercancel', up);
    // スライダー上のホイール: ズームではなく時間（スライダーUIの一部）
    this.el.addEventListener('wheel', e => {
      if (!this.enabled) return;
      e.preventDefault();
      const d = Math.sign(e.deltaY) * -1 * (e.shiftKey ? 3600e3 : 86400e3);
      this.ms = Math.max(MISSION_T0, Math.min(MISSION_T1, this.ms + d));
      this.onSet(this.ms);
    }, { passive: false });
    this.el.addEventListener('keydown', e => {
      if (!this.enabled) return;
      const d = e.shiftKey ? 3600e3 : 86400e3;
      if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') { e.preventDefault(); this.ms = Math.max(MISSION_T0, this.ms - d); this.onSet(this.ms); }
      else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') { e.preventDefault(); this.ms = Math.min(MISSION_T1, this.ms + d); this.onSet(this.ms); }
    });
    const paint = () => {
      const f = (this.ms - MISSION_T0) / (MISSION_T1 - MISSION_T0);
      this.handle.style.left = (f * 100) + '%';
      fill.style.width = (f * 100) + '%';
      // 日付ラベルチップ（ドラッグ/ホバー時にCSSで表示）
      const txt = fmtJST(this.ms).slice(0, 10);
      if (this.label.textContent !== txt) this.label.textContent = txt;
      this.label.style.left = (f * 100) + '%';
      this.el.setAttribute('aria-valuenow', String(this.ms));
      this.el.setAttribute('aria-valuetext', fmtJST(this.ms));
    };
    const paintLoop = () => { paint(); requestAnimationFrame(paintLoop); };
    paintLoop();
  }
  /** マーカー（イベント）を描画。クリックでイベント詳細へ */
  setMarkers(ms: SliderMarker[]) {
    this.markers = ms;
    this.markWrap.innerHTML = '';
    for (const m of ms) {
      const d = document.createElement('div');
      d.className = 'ts-mark'; d.title = m.label;
      d.style.left = ((m.ms - MISSION_T0) / (MISSION_T1 - MISSION_T0) * 100) + '%';
      d.addEventListener('click', e => { e.stopPropagation(); if (this.enabled) this.onMarkerClick(m.id); });
      this.markWrap.appendChild(d);
    }
  }
  /** 毎フレーム呼ぶ: ドラッグ中でなければ表示位置を同期 */
  sync(ms: number) { if (!this.dragging) this.ms = ms; }
  /** 弾道飛行中など、物理と干渉する状態では無効化（P1-1 注意） */
  setEnabled(on: boolean) { this.enabled = on; this.el.classList.toggle('off', !on); }
  get isEnabled() { return this.enabled; }
}
