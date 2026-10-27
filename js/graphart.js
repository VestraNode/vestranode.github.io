// graphart.js — малює «живі» діаграми нод як SVG (для головної сторінки): кольорові шапки, порти за типом, з'єднання

export const TYPE_COLORS = { text: '#4fb3ff', bits: '#ffb454', number: '#5fd68a', bool: '#ff6b6b', image: '#f2dc5d' };
export const CAT_COLORS = { import: '#d9772b', convert: '#3c78d8', cipher: '#8a5bd6', bits: '#c79a22', math: '#2f9e6e', text: '#2d9cc8', logic: '#c24d6a', stego: '#d1368f' };

const NS = 'http://www.w3.org/2000/svg';
const el = (tag, attrs = {}, ...kids) => {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  kids.forEach((k) => e.append(k instanceof Node ? k : document.createTextNode(k)));
  return e;
};

/**
 * nodes: [{id, title, cat, x, y, ins:[{name,type}], outs:[{name,type}], note?}]
 * edges: [[fromId, fromPort, toId, toPort]]
 */
export function miniGraphSVG(nodes, edges, { width = 760, height = 300, animate = true, uid = 'g' } = {}) {
  const NW = 150, HEAD = 26, ROW = 22, PAD = 10;
  const svg = el('svg', { viewBox: `0 0 ${width} ${height}`, class: 'mini-graph', role: 'img' });
  const defs = el('defs');
  svg.append(defs);
  const pos = {};
  const edgeLayer = el('g'), nodeLayer = el('g');
  svg.append(edgeLayer, nodeLayer);

  for (const n of nodes) {
    const rows = Math.max(n.ins?.length || 0, n.outs?.length || 0, 1);
    const hgt = HEAD + PAD + rows * ROW + PAD;
    const g = el('g', { transform: `translate(${n.x},${n.y})` });
    g.append(el('rect', { width: NW, height: hgt, rx: 9, fill: '#24262c', stroke: '#3a3d46', 'stroke-width': 1 }));
    g.append(el('path', { d: `M0 ${HEAD} V9 a9 9 0 0 1 9 -9 H${NW - 9} a9 9 0 0 1 9 9 V${HEAD} Z`, fill: CAT_COLORS[n.cat] || '#666' }));
    g.append(el('text', { x: 10, y: 17.5, fill: '#fff', 'font-size': 11.5, 'font-weight': 700, 'font-family': 'system-ui, sans-serif' }, n.title));
    (n.ins || []).forEach((p, i) => {
      const y = HEAD + PAD + i * ROW + ROW / 2;
      g.append(el('circle', { cx: 0, cy: y, r: 5.2, fill: TYPE_COLORS[p.type], stroke: '#15161a', 'stroke-width': 1.5 }));
      g.append(el('text', { x: 11, y: y + 3.6, fill: '#c9ccd4', 'font-size': 10.5, 'font-family': 'system-ui, sans-serif' }, p.name));
      pos[`${n.id}:in:${p.name}`] = [n.x, n.y + y];
    });
    (n.outs || []).forEach((p, i) => {
      const y = HEAD + PAD + i * ROW + ROW / 2;
      g.append(el('circle', { cx: NW, cy: y, r: 5.2, fill: TYPE_COLORS[p.type], stroke: '#15161a', 'stroke-width': 1.5 }));
      g.append(el('text', { x: NW - 11, y: y + 3.6, fill: '#c9ccd4', 'font-size': 10.5, 'text-anchor': 'end', 'font-family': 'system-ui, sans-serif' }, p.name));
      pos[`${n.id}:out:${p.name}`] = [n.x + NW, n.y + y];
    });
    nodeLayer.append(g);
  }

  edges.forEach(([a, ap, b, bp], i) => {
    const s = pos[`${a}:out:${ap}`], t = pos[`${b}:in:${bp}`];
    if (!s || !t) return;
    const dx = Math.max(40, Math.abs(t[0] - s[0]) * 0.5);
    const d = `M${s[0]} ${s[1]} C${s[0] + dx} ${s[1]} ${t[0] - dx} ${t[1]} ${t[0]} ${t[1]}`;
    const type = nodes.find((n) => n.id === a).outs.find((p) => p.name === ap).type;
    edgeLayer.append(el('path', { d, fill: 'none', stroke: TYPE_COLORS[type], 'stroke-width': 2.4, opacity: 0.35 }));
    edgeLayer.append(el('path', { d, fill: 'none', stroke: TYPE_COLORS[type], 'stroke-width': 2.4, 'stroke-linecap': 'round',
      'stroke-dasharray': '6 14', class: animate ? 'flow' : '', style: `animation-delay:${-i * 0.35}s` }));
  });
  return svg;
}

export const PNG_SKY = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 260"><defs><linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1b2a6b"/><stop offset=".55" stop-color="#e0568f"/><stop offset="1" stop-color="#ffb36b"/></linearGradient></defs><rect width="400" height="260" fill="url(#s)"/><circle cx="270" cy="150" r="34" fill="#ffe8a8" opacity=".9"/><path d="M0 200 L70 140 L120 190 L190 120 L260 195 L330 150 L400 205 V260 H0Z" fill="#141a33"/><path d="M0 225 Q100 195 200 220 T400 215 V260 H0Z" fill="#0b0f22"/></svg>';
