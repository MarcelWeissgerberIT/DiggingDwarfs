// Loads images and prepares shaded texture variants for the isometric faces.

const loadImage = (src) => new Promise((resolve, reject) => {
  const img = new Image();
  img.onload = () => resolve(img);
  img.onerror = () => reject(new Error('Bild fehlt: ' + src));
  img.src = src;
});

// brightness multiplier + tint for each face orientation
const SHADES = {
  front: { k: 1.0, tint: [0, 0, 0], t: 0, c: 0.68 },
  floor: { k: 1.1, tint: [255, 236, 200], t: 0.08, c: 0.55 },
  side: { k: 0.66, tint: [40, 20, 60], t: 0.1, c: 0.6 },
  back: { k: 0.4, tint: [30, 16, 40], t: 0.25, c: 0.5 },
};

function shade(img, { k, tint, t, c: contrast }) {
  const c = document.createElement('canvas');
  c.width = img.width;
  c.height = img.height;
  const g = c.getContext('2d');
  g.drawImage(img, 0, 0);
  const d = g.getImageData(0, 0, c.width, c.height);
  const p = d.data;
  // reduce contrast towards the average colour so tunnels read clearly
  const avg = [0, 0, 0];
  for (let i = 0; i < p.length; i += 4) { avg[0] += p[i]; avg[1] += p[i + 1]; avg[2] += p[i + 2]; }
  const n = p.length / 4;
  for (let i = 0; i < p.length; i += 4) {
    for (let j = 0; j < 3; j++) p[i + j] = avg[j] / n + (p[i + j] - avg[j] / n) * contrast;
  }
  for (let i = 0; i < p.length; i += 4) {
    p[i] = Math.min(255, p[i] * k * (1 - t) + tint[0] * t);
    p[i + 1] = Math.min(255, p[i + 1] * k * (1 - t) + tint[1] * t);
    p[i + 2] = Math.min(255, p[i + 2] * k * (1 - t) + tint[2] * t);
  }
  g.putImageData(d, 0, 0);
  return c;
}

export async function loadAssets(onProgress) {
  const list = {
    dwarfs: 'assets/dwarfs.png',
    dino0: 'assets/dinos/0.png',
    dino1: 'assets/dinos/1.png',
    dino2: 'assets/dinos/2.png',
    dino3: 'assets/dinos/3.png',
    dirt: 'assets/tex/dirt.jpg',
    clay: 'assets/tex/clay.jpg',
    stone: 'assets/tex/stone.jpg',
    deep: 'assets/tex/deep.jpg',
    magma: 'assets/tex/magma.jpg',
    crystal: 'assets/tex/crystal.jpg',
    obsidian: 'assets/tex/obsidian.jpg',
    ruins: 'assets/tex/ruins.jpg',
    grass: 'assets/tex/grass.jpg',
  };
  const keys = Object.keys(list);
  const img = {};
  let done = 0;
  await Promise.all(keys.map(async (k) => {
    img[k] = await loadImage(list[k]);
    onProgress?.(++done / keys.length);
  }));

  // shaded variants per material texture
  const tex = {};
  for (const name of ['dirt', 'clay', 'stone', 'deep', 'magma', 'crystal', 'obsidian', 'ruins', 'grass']) {
    tex[name] = {};
    for (const [face, s] of Object.entries(SHADES)) tex[name][face] = shade(img[name], s);
  }
  return { img, tex };
}
