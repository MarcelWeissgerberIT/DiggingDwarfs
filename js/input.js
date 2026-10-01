// Touch / mouse camera controls: drag to pan, pinch or wheel to zoom, tap to interact.

export class Input {
  constructor(canvas, renderer, onTap) {
    this.cv = canvas;
    this.r = renderer;
    this.onTap = onTap;
    this.ptrs = new Map();
    this.vel = [0, 0];
    this.down = null;
    canvas.addEventListener('pointerdown', (e) => this.pd(e));
    canvas.addEventListener('pointermove', (e) => this.pm(e));
    canvas.addEventListener('pointerup', (e) => this.pu(e));
    canvas.addEventListener('pointercancel', (e) => this.pu(e, true));
    canvas.addEventListener('wheel', (e) => this.wheel(e), { passive: false });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  pd(e) {
    this.cv.setPointerCapture?.(e.pointerId);
    this.ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    this.vel = [0, 0];
    if (this.ptrs.size === 1) {
      this.down = { x: e.clientX, y: e.clientY, t: performance.now(), moved: false };
    } else {
      this.down = null;
      this.pinch = this.pinchState();
    }
  }

  pinchState() {
    const [a, b] = [...this.ptrs.values()];
    return { d: Math.hypot(a.x - b.x, a.y - b.y), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
  }

  pm(e) {
    const p = this.ptrs.get(e.pointerId);
    if (!p) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    p.x = e.clientX; p.y = e.clientY;
    const cam = this.r.cam;
    if (this.ptrs.size >= 2) {
      const s = this.pinchState();
      if (this.pinch && this.pinch.d > 0) {
        this.zoomAt(s.mx, s.my, s.d / this.pinch.d);
        cam.x -= (s.mx - this.pinch.mx) / cam.T;
        cam.y -= (s.my - this.pinch.my) / cam.T;
      }
      this.pinch = s;
      this.r.follow = null;
      return;
    }
    if (this.down && !this.down.moved && Math.hypot(e.clientX - this.down.x, e.clientY - this.down.y) > 8) {
      this.down.moved = true;
    }
    if (this.down && this.down.moved) {
      cam.x -= dx / cam.T;
      cam.y -= dy / cam.T;
      this.vel = [dx / cam.T, dy / cam.T];
      this.r.follow = null;
      this.r.camTarget = null;
    }
  }

  pu(e, cancel = false) {
    this.ptrs.delete(e.pointerId);
    if (this.ptrs.size < 2) this.pinch = null;
    if (this.down && !cancel && this.ptrs.size === 0) {
      const dt = performance.now() - this.down.t;
      if (!this.down.moved && dt < 500) this.onTap(e.clientX, e.clientY);
    }
    if (this.ptrs.size === 0) this.down = null;
  }

  wheel(e) {
    e.preventDefault();
    this.zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * 0.0015));
  }

  zoomAt(px, py, f) {
    const r = this.r, cam = r.cam;
    const cx = r.cssW / 2, cy = r.cssH / 2;
    const ix = (px - cx) / cam.T + cam.x;
    const iy = (py - cy) / cam.T + cam.y;
    cam.T = Math.max(16, Math.min(120, cam.T * f));
    if (!r.follow) {
      cam.x = ix - (px - cx) / cam.T;
      cam.y = iy - (py - cy) / cam.T;
    }
  }

  // pan inertia
  update(dt) {
    if (this.ptrs.size || (!this.vel[0] && !this.vel[1])) return;
    const cam = this.r.cam;
    cam.x -= this.vel[0] * dt * 60;
    cam.y -= this.vel[1] * dt * 60;
    const k = Math.pow(0.0025, dt);
    this.vel[0] *= k; this.vel[1] *= k;
    if (Math.abs(this.vel[0]) < 0.0005 && Math.abs(this.vel[1]) < 0.0005) this.vel = [0, 0];
  }
}
