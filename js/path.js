// Dijkstra over the grid. Rows -1 (surface air) .. H-1.
// Empty cells are cheap to walk through, solid cells cost their digging time,
// so dwarfs prefer existing tunnels and dig only where they have to.
import { W, H, MATS, MAT, ENTRANCE_X } from './config.js';
import { hash2 } from './rng.js';

const N = W * (H + 1);
const node = (x, y) => (y + 1) * W + x;
export const nodeX = (n) => n % W;
export const nodeY = (n) => Math.floor(n / W) - 1;
export { node };

class Heap {
  constructor() { this.k = []; this.v = []; }
  get size() { return this.k.length; }
  push(key, val) {
    const k = this.k, v = this.v;
    let i = k.length;
    k.push(key); v.push(val);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (k[p] <= key) break;
      k[i] = k[p]; v[i] = v[p]; i = p;
    }
    k[i] = key; v[i] = val;
  }
  pop() {
    const k = this.k, v = this.v;
    const top = v[0];
    const lk = k.pop(), lv = v.pop();
    const n = k.length;
    if (n > 0) {
      let i = 0;
      while (true) {
        let c = 2 * i + 1;
        if (c >= n) break;
        if (c + 1 < n && k[c + 1] < k[c]) c++;
        if (k[c] >= lk) break;
        k[i] = k[c]; v[i] = v[c]; i = c;
      }
      k[i] = lk; v[i] = lv;
    }
    return top;
  }
}

// opts: { pick, noDig, seed, maxCost }
export function dijkstra(world, sx, sy, opts = {}) {
  const pick = opts.pick ?? 1;
  const noDig = !!opts.noDig;
  const seed = opts.seed ?? 0;
  const maxCost = opts.maxCost ?? Infinity;
  const dist = new Float32Array(N).fill(Infinity);
  const prev = new Int32Array(N).fill(-1);
  const heap = new Heap();
  const s = node(sx, sy);
  dist[s] = 0;
  heap.push(0, s);
  while (heap.size) {
    const cur = heap.pop();
    const d = dist[cur];
    if (d > maxCost) break;
    const cx = nodeX(cur), cy = nodeY(cur);
    // a dwarf can't walk *through* a cell that is still solid; it digs it first,
    // so expansion from a solid node is fine (it will be dug by then).
    for (let k = 0; k < 4; k++) {
      const nx = cx + (k === 0 ? 1 : k === 1 ? -1 : 0);
      const ny = cy + (k === 2 ? 1 : k === 3 ? -1 : 0);
      if (nx < 0 || nx >= W || ny < -1 || ny >= H) continue;
      let c;
      if (world.empty(nx, ny)) {
        c = ny !== cy ? 1.35 : 1;
      } else {
        if (noDig) continue;
        const m = world.get(nx, ny);
        if (m === MAT.BEDROCK || MATS[m].hard > pick) continue;
        c = 1 + MATS[m].time * 2.2 + hash2(nx, ny, seed) * 2.5 + (ny !== cy ? 3 : 0);
        // keep the meadow mostly intact: extra entrances are expensive
        if (ny === 0 && cy === -1 && nx !== ENTRANCE_X) c += 14;
      }
      const nd = d + c;
      const ni = node(nx, ny);
      if (nd < dist[ni]) {
        dist[ni] = nd;
        prev[ni] = cur;
        heap.push(nd, ni);
      }
    }
  }
  return { dist, prev, start: s };
}

// Cells from start (excluded) to target (included), or null.
export function pathTo(map, tx, ty) {
  let n = node(tx, ty);
  if (!isFinite(map.dist[n])) return null;
  const out = [];
  while (n !== map.start) {
    out.push({ x: nodeX(n), y: nodeY(n) });
    n = map.prev[n];
    if (n < 0) return null;
  }
  out.reverse();
  return out;
}

export function costTo(map, x, y) {
  return map.dist[node(x, y)];
}
