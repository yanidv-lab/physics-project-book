# Physics Project Book — Interactive 3D Lab

An interactive **9-Volume, 45-Experiment 3D Physics Project Book** built with Three.js, TypeScript, and KaTeX — designed for desktop and mobile exploration with **Studio-Quality Neural Voice 3D Audio Explainer Tours** (natural narrated voice + live parameter/experiment driving), guided observations, Simple/Physics explanations, hover study notes, and persistent study pins.

- **Live Cloud App (24/7 PC & Mobile):** https://yanidv-lab.github.io/physics-project-book/
- **Repository:** https://github.com/yanidv-lab/physics-project-book

---

## 9 Volumes (45 Guided Experiments)

1. **Vol. I — Circuits & Electron POV** *(10 chapters)*
   Ride inside a closed electrical circuit from the Lagrangian first-person perspective of a conduction electron alongside an Eulerian MNA solver & oscilloscope: Drude scattering, Ohm's Law, battery energy escalators, 90° surface-charge corners, voltage dividers, capacitor displacement currents, RLC magnetic resonance, and AC wiggling in place.
2. **Vol. II — Electromagnetism & Light** *(5 experiments)*
   Electric dipoles, Lorentz cyclotron helixes, orthogonal linear/circular EM light waves, Faraday's moving-magnet induction generator, and the Hall Effect Sensor.
3. **Vol. III — Gravity & Spacetime** *(5 experiments)*
   Spacetime curvature wells, Kepler elliptical slings, binary star potential surfaces, black hole event horizon with photon ring, and Lagrange Points L1–L5.
4. **Vol. IV — Waves, Fields & Quantum** *(5 experiments)*
   Double-slit interference ripples, quantized standing waves, Schrödinger quantum wavepacket tunneling, 3D Vector Calculus (`∇f`, `∇·F`, `∇×F`), and the Quantum Harmonic Oscillator.
5. **Vol. V — Thermodynamics & Stat Mech** *(4 experiments)*
   Ideal Gas piston chamber, Carnot Heat Engine (`P–V` cycle & `η`), Brownian random-walk diffusion, and irreversible Entropy & Mixing.
6. **Vol. VI — Optics & Photonics** *(4 experiments)*
   Snell's Law & Total Internal Reflection, Cauchy dispersion rainbow prism, thin-lens principal ray tracer, and Malus's Law 3-polarizer paradox.
7. **Vol. VII — Classical Mechanics & Chaos** *(4 experiments)*
   Twin RK4 Double Pendulum chaos, coupled spring normal modes & beats, spinning gyroscope precession, and inertial vs rotating Coriolis turntable.
8. **Vol. VIII — Fluid Dynamics & Aero** *(4 experiments)*
   Venturi pipe & Bernoulli pressure columns, Magnus/Kutta-Joukowski lift, Kármán vortex street wakes, and KdV shallow-water soliton collisions.
9. **Vol. IX — Relativity & Nuclear** *(4 experiments)*
   Moving light clock time dilation, Minkowski light cone & Lorentz contraction, 216-atom radioactive half-life crystal, and Uranium-235 fission chain reaction with control rods.

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
