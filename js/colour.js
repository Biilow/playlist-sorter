// Works out the one colour that best describes an album cover, and where that
// colour belongs in a white -> rainbow -> black ordering. Everything happens in
// OKLab because distances and hues there match what people actually see.

const SEEDS = 8; // clusters before near-duplicates are merged
const ROUNDS = 12;
const MERGE_DISTANCE = 0.07; // gradients split into many clusters; rejoin them
const MIN_SHARE = 0.06; // a colour must cover this much of the cover to count
const CHROMA_PULL = 1.5; // how much a vivid colour outweighs a dull one of equal area

const NEUTRAL_CHROMA = 0.04;
const NEAR_BLACK = 0.2;
const NEAR_WHITE = 0.96;
const LIGHT_NEUTRAL = 0.6; // neutrals above this go with white, below with black

const RAINBOW_START = 10; // degrees: just before red, so pinks close the rainbow
const HUE_BAND = 30;

const toLinear = (v) => {
  const c = v / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};

const toGamma = (c) => {
  const clamped = Math.min(1, Math.max(0, c));
  const v = clamped <= 0.0031308 ? 12.92 * clamped : 1.055 * clamped ** (1 / 2.4) - 0.055;
  return Math.round(v * 255);
};

export function rgbToOklab(r, g, b) {
  const R = toLinear(r);
  const G = toLinear(g);
  const B = toLinear(b);
  const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B);
  const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
  const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

export function oklabToRgb(L, a, b) {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    toGamma(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    toGamma(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    toGamma(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  ];
}

const distance = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);

// Seeds are chosen deterministically (farthest-first) so a cover always gets
// the same colour and a sort is repeatable.
function chooseSeeds(points) {
  const mean = [0, 1, 2].map((d) => points.reduce((sum, p) => sum + p[d], 0) / points.length);
  const seeds = [mean];
  const nearest = points.map((p) => distance(p, mean));
  while (seeds.length < SEEDS) {
    let farthest = 0;
    for (let i = 1; i < points.length; i++) if (nearest[i] > nearest[farthest]) farthest = i;
    if (nearest[farthest] === 0) break;
    const seed = points[farthest];
    seeds.push(seed);
    for (let i = 0; i < points.length; i++) nearest[i] = Math.min(nearest[i], distance(points[i], seed));
  }
  return seeds;
}

function kMeans(points) {
  let centres = chooseSeeds(points);
  let totals = [];
  for (let round = 0; round < ROUNDS; round++) {
    totals = centres.map(() => [0, 0, 0, 0]);
    for (const p of points) {
      let best = 0;
      let bestDistance = Infinity;
      for (let c = 0; c < centres.length; c++) {
        const d = distance(p, centres[c]);
        if (d < bestDistance) {
          bestDistance = d;
          best = c;
        }
      }
      const t = totals[best];
      t[0] += p[0];
      t[1] += p[1];
      t[2] += p[2];
      t[3] += 1;
    }
    centres = centres.map((c, i) => (totals[i][3] ? totals[i].slice(0, 3).map((v) => v / totals[i][3]) : c));
  }
  return centres
    .map((lab, i) => ({ lab, share: totals[i][3] / points.length }))
    .filter((cluster) => cluster.share > 0);
}

function mergeNearby(clusters) {
  const merged = clusters.slice();
  for (;;) {
    let pair = null;
    let closest = MERGE_DISTANCE;
    for (let i = 0; i < merged.length; i++) {
      for (let j = i + 1; j < merged.length; j++) {
        const d = distance(merged[i].lab, merged[j].lab);
        if (d < closest) {
          closest = d;
          pair = [i, j];
        }
      }
    }
    if (!pair) return merged;
    const [i, j] = pair;
    const share = merged[i].share + merged[j].share;
    const lab = merged[i].lab.map((v, d) => (v * merged[i].share + merged[j].lab[d] * merged[j].share) / share);
    merged[i] = { lab, share };
    merged.splice(j, 1);
  }
}

function describe([L, a, b]) {
  const C = Math.hypot(a, b);
  const h = (Math.atan2(b, a) * 180) / Math.PI;
  const [r, g, bl] = oklabToRgb(L, a, b);
  const luminance = 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(bl);
  const onBlack = (luminance + 0.05) / 0.05;
  const onWhite = 1.05 / (luminance + 0.05);
  return {
    lab: [L, a, b],
    L,
    C,
    h: (h + 360) % 360,
    css: `rgb(${r} ${g} ${bl})`,
    ink: onBlack >= onWhite ? '#000' : '#fff',
  };
}

// pixels: RGBA bytes, as returned by canvas getImageData.
export function dominantColour(pixels) {
  const points = [];
  for (let i = 0; i < pixels.length; i += 4) {
    points.push(rgbToOklab(pixels[i], pixels[i + 1], pixels[i + 2]));
  }
  const clusters = mergeNearby(kMeans(points));
  const candidates = clusters.filter((c) => c.share >= MIN_SHARE);
  const pool = candidates.length ? candidates : clusters;

  const score = ({ lab, share }) => {
    const chroma = Math.hypot(lab[1], lab[2]);
    const pull = lab[0] < NEAR_BLACK ? 0 : CHROMA_PULL * Math.min(chroma / 0.12, 1);
    return share * (1 + pull);
  };
  return describe(pool.reduce((best, c) => (score(c) > score(best) ? c : best)).lab);
}

export const colourDistance = (x, y) => distance(x.lab, y.lab);

// 0 = white side, 1 = rainbow, 2 = black side.
function place({ L, C, h }) {
  if (C < NEUTRAL_CHROMA || L < NEAR_BLACK || L > NEAR_WHITE) {
    return { section: L >= LIGHT_NEUTRAL ? 0 : 2, band: 0 };
  }
  const turned = (h - RAINBOW_START + 360) % 360;
  return { section: 1, band: Math.floor(turned / HUE_BAND) };
}

// Sorts white -> rainbow -> black. Inside the rainbow each hue band snakes
// light-to-dark then dark-to-light, so neighbouring bands meet at a similar
// lightness and the list reads as one smooth gradient.
export function compareColours(x, y) {
  const a = place(x);
  const b = place(y);
  if (a.section !== b.section) return a.section - b.section;
  if (a.band !== b.band) return a.band - b.band;
  const lighterFirst = a.section !== 1 || a.band % 2 === 0;
  return lighterFirst ? y.L - x.L : x.L - y.L;
}
