// Inline-SVG tile-face generator.
//
// Pure functions, no DOM access — safe to import under `node --test`. Draws only
// the painted face (pips / characters); the ivory tile body, bevel and shadow are
// supplied by CSS on the wrapping element. The face uses a 90x120 viewBox (3:4),
// rendered with preserveAspectRatio "meet" so it never distorts.

const VIEWBOX = '0 0 90 120';

const TONG_RING = '#2e6da4'; // 筒：蓝色圆环
const TONG_CORE = '#2e6da4';
const TONG_CORE_ONE = '#cf3b3b'; // 一筒中心点用红色，呼应传统牌面
const RING_HOLE = '#f7f2e4'; // 与象牙牌身相近，做出圆环中空效果

const TIAO_BODY = '#1b7a3d'; // 条：绿色竹节
const TIAO_NODE = '#0f5128';

const WAN_NUM_COLOR = '#243b53'; // 万：深蓝数字
const WAN_CHAR_COLOR = '#c0392b'; // 红色「万」

const CN_NUMERALS = ['一', '二', '三', '四', '五', '六', '七', '八', '九'];

const WAN_FONT = "'KaiTi','STKaiti','SimSun',serif";

// Pip centre coordinates per count, arranged to echo traditional tile faces.
const PIP_LAYOUTS = {
  1: [[45, 60]],
  2: [[45, 38], [45, 82]],
  3: [[24, 32], [45, 60], [66, 88]],
  4: [[28, 36], [62, 36], [28, 84], [62, 84]],
  5: [[28, 34], [62, 34], [45, 60], [28, 86], [62, 86]],
  6: [[28, 30], [62, 30], [28, 60], [62, 60], [28, 90], [62, 90]],
  7: [[24, 26], [45, 26], [66, 26], [30, 62], [60, 62], [30, 92], [60, 92]],
  8: [[28, 22], [62, 22], [28, 49], [62, 49], [28, 76], [62, 76], [28, 103], [62, 103]],
  9: [[24, 30], [45, 30], [66, 30], [24, 60], [45, 60], [66, 60], [24, 90], [45, 90], [66, 90]],
};

function pipRadius(count) {
  if (count >= 9) return 9;
  if (count >= 7) return 10;
  return 12;
}

function bambooScale(count) {
  if (count >= 7) return 0.78;
  if (count >= 4) return 0.9;
  return 1;
}

function dotPip([x, y], radius, coreColor) {
  const hole = (radius * 0.55).toFixed(1);
  const core = (radius * 0.24).toFixed(1);

  return '<g class="pip">'
    + `<circle cx="${x}" cy="${y}" r="${radius}" fill="${TONG_RING}" />`
    + `<circle cx="${x}" cy="${y}" r="${hole}" fill="${RING_HOLE}" />`
    + `<circle cx="${x}" cy="${y}" r="${core}" fill="${coreColor}" />`
    + '</g>';
}

function bambooPip([x, y], scale) {
  const w = 9 * scale;
  const h = 30 * scale;
  const left = (x - w / 2).toFixed(1);
  const top = (y - h / 2).toFixed(1);
  const right = (x + w / 2).toFixed(1);
  const node1 = (y - h / 6).toFixed(1);
  const node2 = (y + h / 6).toFixed(1);

  return '<g class="pip">'
    + `<rect x="${left}" y="${top}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" rx="${(w / 2).toFixed(1)}" fill="${TIAO_BODY}" />`
    + `<line x1="${left}" y1="${node1}" x2="${right}" y2="${node1}" stroke="${TIAO_NODE}" stroke-width="1.4" />`
    + `<line x1="${left}" y1="${node2}" x2="${right}" y2="${node2}" stroke="${TIAO_NODE}" stroke-width="1.4" />`
    + '</g>';
}

function tongFace(rank) {
  const radius = pipRadius(rank);
  const coreColor = rank === 1 ? TONG_CORE_ONE : TONG_CORE;

  return (PIP_LAYOUTS[rank] ?? [])
    .map((pos) => dotPip(pos, radius, coreColor))
    .join('');
}

function tiaoFace(rank) {
  const scale = bambooScale(rank);

  return (PIP_LAYOUTS[rank] ?? [])
    .map((pos) => bambooPip(pos, scale))
    .join('');
}

function wanFace(rank) {
  const numeral = CN_NUMERALS[rank - 1] ?? String(rank);

  return `<text x="45" y="46" text-anchor="middle" dominant-baseline="middle" font-family="${WAN_FONT}" font-size="44" font-weight="700" fill="${WAN_NUM_COLOR}">${numeral}</text>`
    + `<text x="45" y="96" text-anchor="middle" dominant-baseline="middle" font-family="${WAN_FONT}" font-size="36" font-weight="700" fill="${WAN_CHAR_COLOR}">万</text>`;
}

const FACE_BY_SUIT = {
  tong: tongFace,
  tiao: tiaoFace,
  wan: wanFace,
};

export function tileFaceSvg(tile) {
  const draw = FACE_BY_SUIT[tile.suit];
  const inner = draw ? draw(tile.rank) : '';

  return `<svg class="tile-face" viewBox="${VIEWBOX}" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">${inner}</svg>`;
}
