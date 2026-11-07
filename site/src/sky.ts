// §4.6 / §7.19 — the ONE place that decides sky colour. HUD colour, stars and sun dot all derive from this state.
export type Layer = 'walk' | 'ballistic' | 'orbit' | 'mascot' | 'td1';
export interface SkyState { white: boolean; }
/** white sky = presentation layer (walk) AND sun above the local horizon. §4.6 signature moment:
 *  白い空＝歩く世界（舞台・人間の時間）、黒い空＝跳ぶ世界（物理・リュウグウの時間）。 */
export function skyFor(layer: Layer, sunElevationSin: number, mascotDay = false): SkyState {
  if (layer === 'walk') return { white: sunElevationSin > 0 };
  if (layer === 'mascot' || layer === 'td1') return { white: mascotDay && sunElevationSin > 0 };
  return { white: false };
}
export function applySky(s: SkyState) { document.body.classList.toggle('sky-white', s.white); }
export const PAPER = 0xF0F0EB;
