# Physics Project Book — Interactive 3D Lab

An interactive **4-Volume, 25-Experiment 3D Physics Project Book** built with Three.js, TypeScript, and KaTeX — designed for desktop and mobile exploration with guided observations, Simple/Physics explanations, hover study notes, and persistent study pins.

- **Live Cloud App (24/7 PC & Mobile):** https://yanidv-lab.github.io/physics-project-book/
- **Repository:** https://github.com/yanidv-lab/physics-project-book

---

## 4 Volumes (25 Guided Experiments)

1. **Vol. I — Circuits & Electron POV** *(10 chapters)*
   Ride inside a closed electrical circuit from the Lagrangian first-person perspective of a conduction electron alongside an Eulerian MNA solver & oscilloscope: Drude scattering, Ohm's Law, battery energy escalators, 90° surface-charge corners, voltage dividers, capacitor displacement currents, RLC magnetic resonance, and **AC wiggling in place with twice-per-cycle Joule heating**.
2. **Vol. II — Electromagnetism & Light** *(5 experiments)*
   Electric dipoles with test charges, Lorentz cyclotron helixes, orthogonal linear/circular EM light waves, Faraday's moving-magnet induction generator, and **the Hall Effect Sensor** (n-type electrons vs. p-type holes transverse voltage buildup).
3. **Vol. III — Gravity & Spacetime** *(5 experiments)*
   Rubber-sheet spacetime curvature wells, Kepler elliptical slings, two-body binary star potential surfaces, black hole event horizon with photon ring and accretion disk, and **Lagrange Points L1–L5** on a rotating 3-body Roche potential surface (JWST & Trojan orbits).
4. **Vol. IV — Waves, Fields & Quantum** *(5 experiments)*
   Double-slit interference ripples, quantized harmonic standing waves, Schrödinger quantum wavepacket tunneling through potential barriers, 3D Gradient (`∇f`), Divergence (`∇·F`), and Curl (`∇×F`) explorers, and the **Quantum Harmonic Oscillator** (zero-point energy, tunneling tails, quantum beats & coherent pendulum).

---

## Run on Mobile & Anywhere in the Cloud

Once published on GitHub Pages, the app is a static HTTPS site that runs **24/7 even when your computer is offline**:

1. Open **https://yanidv-lab.github.io/physics-project-book/** on your phone or desktop.
2. Use the bottom mobile navigation bar (`Book`, `Controls`, `Stats`, `Marks`, `3D`) or tap **Open on Phone** inside the app to display a scannable QR code.
3. On iOS/Android, use **Add to Home Screen** (`manifest.json`) for a full-screen app experience.

## Edit Remotely (Mobile, Tablet, or Browser)

- **GitHub Codespaces (Full Dev Environment in Browser):** Click **Code → Codespaces → Create codespace on main** (configured in `.devcontainer/devcontainer.json` with Node 22 and port `5173` auto-forwarded).
- **Web Editor (`github.dev`):** Open https://github.dev/yanidv-lab/physics-project-book in your browser to browse and edit TypeScript files immediately.
- **GitHub Mobile:** Review files, create issues, merge PRs, or trigger commits from your phone.
- **Antigravity / Local Machine:** Clone `https://github.com/yanidv-lab/physics-project-book.git` and open it as your workspace anywhere.

---

## Local Development

```bash
npm install
npm run start      # Opens http://localhost:5173/ and binds LAN for mobile testing
```

On Windows, you can also double-click `START_PROJECT_BOOK.bat`.

### Test & Build

```bash
npm test           # Run Vitest suite (physics solvers, geometry, catalog)
npm run build      # Type-check (tsc --noEmit) and bundle to dist/
```
