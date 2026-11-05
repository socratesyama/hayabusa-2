import { buildLUT } from './thermalcore.js';
self.onmessage = () => {
  const t0 = performance.now();
  const lut = buildLUT();
  self.postMessage({ lut, ms: performance.now() - t0 }, [lut.buffer]);
};
