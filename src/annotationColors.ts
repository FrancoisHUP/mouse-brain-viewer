export function labelToColorRgba(label: number): [number, number, number, number] {
  if (!Number.isFinite(label) || label <= 0) {
    return [0, 0, 0, 0];
  }

  const r = (label * 53) % 255;
  const g = (label * 97) % 255;
  const b = (label * 193) % 255;

  return [r, g, b, 88];
}

export function annotationSliceToRgbaBytes(slice: Float32Array): Uint8Array {
  const out = new Uint8Array(slice.length * 4);

  for (let i = 0; i < slice.length; i += 1) {
    const label = Math.round(slice[i]);
    const j = i * 4;
    const [r, g, b, a] = labelToColorRgba(label);
    out[j + 0] = r;
    out[j + 1] = g;
    out[j + 2] = b;
    out[j + 3] = a;
  }

  return out;
}
