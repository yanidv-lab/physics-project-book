import type { TopicId } from '../types/simulation';
import { PROJECT_CHAPTERS, type Difficulty } from './projectBook';

export type BookActionParams = Record<string, number | boolean | string>;

export interface BookQuickAction {
  label: string;
  apply: BookActionParams;
}

export interface BookChapterSummary {
  id: string;
  topicId: TopicId;
  number: number;
  title: string;
  subtitle: string;
  difficulty: Difficulty;
  accent: string;
  isNew?: boolean;
  simpleSummary: string;
  watchFor: string[];
  quickActions?: BookQuickAction[];
}

export interface BookVolume {
  id: TopicId;
  roman: string;
  title: string;
  subtitle: string;
  icon: string;
  accent: string;
  description: string;
  chapters: BookChapterSummary[];
}

export const EM_CHAPTERS: BookChapterSummary[] = [
  {
    id: 'em-dipole',
    topicId: 'em',
    number: 1,
    title: 'Electric Dipole & Field Lines',
    subtitle: 'Coulomb Attraction & Vector Fields',
    difficulty: 'Beginner',
    accent: '#a855f7',
    simpleSummary:
      'Every positive charge acts like an electric fountain and every negative charge acts like a drain. Together they weave smooth curved field lines through empty space!',
    watchFor: [
      'Violet-magenta arrows always point away from (+) red and toward (−) blue.',
      'Click "Drop Test Charge" to watch a tiny positive charge surf along the field lines.',
      'Adjust dipole separation to see the field between the poles intensify.',
    ],
    quickActions: [
      { label: 'Drop Test Charge', apply: { action: 'launchTestCharge' } },
      { label: 'Flip Polarity', apply: { action: 'flipPolarity' } },
    ],
  },
  {
    id: 'em-lorentz',
    topicId: 'em',
    number: 2,
    title: 'Lorentz Cyclotron Helix',
    subtitle: 'Magnetic Force F = q(v × B)',
    difficulty: 'Intermediate',
    accent: '#38bdf8',
    simpleSummary:
      'A magnetic field never pushes a stationary charge—and never speeds up a moving one! Instead, it tugs sideways perpendicular to motion, curling charges into tight glowing spirals.',
    watchFor: [
      'Notice the gold F_B arrow always points perpendicular to the cyan velocity vector.',
      'Kinetic speed stays constant in a pure B-field—turn on E_z to accelerate along a helix!',
    ],
    quickActions: [
      { label: 'Pure Magnetic Circle', apply: { ez: 0.0, bField: 1.8 } },
      { label: 'Accelerating Helix', apply: { ez: 0.9, bField: 1.8 } },
    ],
  },
  {
    id: 'em-wave',
    topicId: 'em',
    number: 3,
    title: 'Light as an EM Wave',
    subtitle: 'Orthogonal E, B & Poynting Flux',
    difficulty: 'Intermediate',
    accent: '#ec4899',
    simpleSummary:
      'Light is a self-sustaining dance: an oscillating electric wave creates a magnetic wave at right angles, which recreates the electric wave—shooting energy forward at light speed!',
    watchFor: [
      'Violet E-vectors and sky-blue B-vectors always stay 90° perpendicular to each other.',
      'Try "Circular Polarization" to watch the electric vector corkscrew smoothly forward.',
    ],
    quickActions: [
      { label: 'Linear Polarization', apply: { circular: false } },
      { label: 'Circular Polarization', apply: { circular: true } },
    ],
  },
  {
    id: 'em-faraday',
    topicId: 'em',
    number: 4,
    title: "Faraday's Moving Magnet",
    subtitle: 'Electromagnetic Induction & Generators',
    difficulty: 'Advanced',
    accent: '#10b981',
    simpleSummary:
      'Holding a magnet still inside a coil generates ZERO electricity! Plunge the magnet back and forth and the changing magnetic flux induces voltage that drives electrons and lights the bulb.',
    watchFor: [
      'Notice induced EMF peaks when the magnet moves FASTEST through the coil center.',
      'Pause or set frequency to 0 Hz—electrons stop drifting immediately!',
    ],
    quickActions: [
      { label: 'Slow Plunge (0.6 Hz)', apply: { freq: 0.6 } },
      { label: 'Fast Generator (2.4 Hz)', apply: { freq: 2.4 } },
    ],
  },
  {
    id: 'em-hall',
    topicId: 'em',
    number: 5,
    title: 'The Hall Effect Sensor',
    subtitle: 'Magnetic Deflection & Transverse Hall Voltage',
    difficulty: 'Intermediate',
    accent: '#06b6d4',
    isNew: true,
    simpleSummary:
      'Send current through a metal strip inside a magnetic field and carriers get pushed sideways to the edge! That transverse pile-up creates a measurable Hall Voltage—and reveals whether current is carried by negative electrons or positive holes.',
    watchFor: [
      'Click "Replay Charge Buildup" to watch moving charges bend sideways toward the front wall.',
      'Once equilibrium builds, transverse purple E_H arrows balance v × B so the beam runs straight!',
      'Switch between n-Type Electrons and p-Type Holes and watch the Hall Voltage V_H flip sign.',
    ],
    quickActions: [
      { label: 'p-Type Holes (+q)', apply: { carrierSign: 1 } },
      { label: 'n-Type Electrons (−q)', apply: { carrierSign: -1 } },
      { label: 'Flip B-Field', apply: { action: 'flipB' } },
      { label: 'Replay Charge Buildup', apply: { action: 'replayHall' } },
    ],
  },
];

export const GRAVITY_CHAPTERS: BookChapterSummary[] = [
  {
    id: 'grav-well',
    topicId: 'gravity',
    number: 1,
    title: 'The Rubber-Sheet Gravity Well',
    subtitle: 'Spacetime Curvature & Escape Speed',
    difficulty: 'Beginner',
    accent: '#f59e0b',
    simpleSummary:
      'Mass bends the geometry of spacetime like a heavy bowling ball on a stretched trampoline. Nearby marbles roll down the curved funnel unless they travel fast enough to orbit or escape!',
    watchFor: [
      'Click "Fire Slow Probe" vs "Fire Escape Probe" to compare bound vs unbound paths.',
      'Notice the grid depth shows gravitational potential Φ(r) = −GM/r.',
    ],
    quickActions: [
      { label: 'Circular Orbit Probe', apply: { action: 'launchCircular' } },
      { label: 'Fire Escape Probe', apply: { action: 'launchEscape' } },
    ],
  },
  {
    id: 'grav-kepler',
    topicId: 'gravity',
    number: 2,
    title: "Kepler's Elliptical Sling",
    subtitle: 'Conservation of Angular Momentum',
    difficulty: 'Beginner',
    accent: '#fbbf24',
    simpleSummary:
      'Planets on oval orbits do not move at constant speed! Watch the planet whip furiously past the star at closest approach (perihelion) and coast lazily far away (aphelion).',
    watchFor: [
      'Watch the cyan velocity arrow stretch dramatically near the star.',
      'Check the oscilloscope: Kinetic energy K and Potential energy U trade places while E_tot stays flat!',
    ],
    quickActions: [
      { label: 'High Eccentricity Comet', apply: { eccentricity: 0.72 } },
      { label: 'Nearly Circular Planet', apply: { eccentricity: 0.15 } },
    ],
  },
  {
    id: 'grav-binary',
    topicId: 'gravity',
    number: 3,
    title: 'Binary Star Dance',
    subtitle: 'Rotating Two-Body Potential Well',
    difficulty: 'Intermediate',
    accent: '#38bdf8',
    simpleSummary:
      'When two massive stars orbit each other, they sculpt a swirling double-funnel in spacetime! Watch a small planet weave intricate figure-8 or chaotic trajectories between them.',
    watchFor: [
      'See the glowing saddle point between the two stars where their pulls cancel out.',
      'Launch a new test planet to watch multi-body gravitational assists.',
    ],
    quickActions: [
      { label: 'Launch New Planet', apply: { action: 'launchBinaryProbe' } },
      { label: 'Equal Mass Twins', apply: { massRatio: 1.0 } },
    ],
  },
  {
    id: 'grav-blackhole',
    topicId: 'gravity',
    number: 4,
    title: 'Black Hole & Photon Ring',
    subtitle: 'Event Horizon & Accretion Disk',
    difficulty: 'Advanced',
    accent: '#ef4444',
    simpleSummary:
      'Pack enormous mass into a tiny point and the spacetime funnel plunges into a bottomless throat! Gas spirals in an incandescent accretion disk outside the black Event Horizon.',
    watchFor: [
      'Notice the golden photon ring hovering right outside the obsidian Event Horizon.',
      'Fire a slingshot probe carefully near the disk—too close and it gets captured!',
    ],
    quickActions: [
      { label: 'Fire Slingshot Probe', apply: { action: 'launchSlingshot' } },
      { label: 'Boost Black Hole Mass', apply: { centralMass: 3.2 } },
    ],
  },
  {
    id: 'grav-lagrange',
    topicId: 'gravity',
    number: 5,
    title: 'Lagrange Points & Space Telescopes',
    subtitle: 'Rotating 3-Body Wells, JWST & Trojans',
    difficulty: 'Advanced',
    accent: '#10b981',
    isNew: true,
    simpleSummary:
      'In a rotating Star–Planet frame, gravity and outward centrifugal sling balance at five magic parking spots L1–L5! Collinear saddles L1/L2 host observatories like JWST, while triangular peaks L4/L5 trap Trojan asteroids.',
    watchFor: [
      'Hover over L1–L5 diamonds on the 3D Roche surface to inspect collinear saddles vs Trojan peaks.',
      'Compare stable L4/L5 tadpole loops at low mass ratio μ = 0.03 against L2 saddle parking.',
      'Try "Unstable μ = 0.10" above the 0.0385 threshold to watch the Trojan orbit spiral away!',
    ],
    quickActions: [
      { label: 'Park at L4 (Trojan)', apply: { preset: 'L4', mu: 0.03 } },
      { label: 'Park at L2 (JWST)', apply: { preset: 'L2', mu: 0.03 } },
      { label: 'Park at L1 (Saddle)', apply: { preset: 'L1', mu: 0.03 } },
      { label: 'Unstable μ = 0.10', apply: { preset: 'L4', mu: 0.10 } },
    ],
  },
];

export const WAVES_CHAPTERS: BookChapterSummary[] = [
  {
    id: 'wave-interference',
    topicId: 'waves',
    number: 1,
    title: 'Double-Slit Wave Interference',
    subtitle: 'Constructive & Destructive Superposition',
    difficulty: 'Beginner',
    accent: '#10b981',
    simpleSummary:
      'When ripples from two slits overlap, crests meeting crests build tall bright stripes, while crests meeting troughs cancel flat into calm quiet lanes!',
    watchFor: [
      'Trace the calm radial nodal rays where the two waves perpetually cancel out.',
      'Toggle "Single Source" vs "Two Slits" to confirm interference comes from overlapping paths.',
    ],
    quickActions: [
      { label: 'Two Slits', apply: { singleSource: false } },
      { label: 'Single Source', apply: { singleSource: true } },
    ],
  },
  {
    id: 'wave-standing',
    topicId: 'waves',
    number: 2,
    title: 'Harmonic Standing Waves',
    subtitle: 'Nodes, Antinodes & Quantized Modes',
    difficulty: 'Beginner',
    accent: '#00f0ff',
    simpleSummary:
      'A trapped wave bouncing between two fixed walls only survives cleanly at whole-number harmonics! Gold Nodes stay completely frozen while cyan Antinodes oscillate wildly.',
    watchFor: [
      'Step Harmonic n = 1, 2, 3, 4, 5 to see how quantized energy modes emerge from boundary walls.',
      'Notice how nodes stay permanently at zero height.',
    ],
    quickActions: [
      { label: 'Fundamental n=1', apply: { harmonic: 1 } },
      { label: '3rd Harmonic n=3', apply: { harmonic: 3 } },
      { label: '5th Harmonic n=5', apply: { harmonic: 5 } },
    ],
  },
  {
    id: 'wave-tunneling',
    topicId: 'waves',
    number: 3,
    title: 'Quantum Tunneling Through a Wall',
    subtitle: 'Schrödinger Wavepacket & Probability',
    difficulty: 'Advanced',
    accent: '#a855f7',
    simpleSummary:
      'Unlike a classical tennis ball, a quantum electron is a fuzzy wave of probability! Even when a barrier is taller than the wave’s energy, part of the wave leaks straight through the wall.',
    watchFor: [
      'Watch the glowing probability curtain split into Reflected (left) and Tunneled (right) waves!',
      'Lower the barrier height or increase wave momentum to watch Transmission % surge.',
    ],
    quickActions: [
      { label: 'Relaunch Wavepacket', apply: { action: 'relaunchPacket' } },
      { label: 'Thin Low Wall (High Tunnel)', apply: { barrierHeight: 1.2 } },
      { label: 'Tall Wall (Mostly Reflect)', apply: { barrierHeight: 3.4 } },
    ],
  },
  {
    id: 'wave-vectorfield',
    topicId: 'waves',
    number: 4,
    title: 'Scalar & Vector Field Explorer',
    subtitle: 'Gradient, Divergence & Vortex Curl',
    difficulty: 'Intermediate',
    accent: '#38bdf8',
    simpleSummary:
      'Fields assign a number or an arrow to every single point in space! Switch between uphill Gradients, Source/Sink Divergence, and swirling Vortex Curl with flowing glowing tracers.',
    watchFor: [
      'In Gradient mode, arrows point strictly up the steepest slope of the terrain.',
      'In Divergence mode, particles burst from the red source and vanish into the blue sink.',
    ],
    quickActions: [
      { label: 'Gradient ∇f', apply: { fieldMode: 'gradient' } },
      { label: 'Source / Sink ∇·F', apply: { fieldMode: 'divergence' } },
      { label: 'Vortex Curl ∇×F', apply: { fieldMode: 'curl' } },
    ],
  },
  {
    id: 'wave-harmonic',
    topicId: 'waves',
    number: 5,
    title: 'Quantum Harmonic Oscillator',
    subtitle: 'Zero-Point Energy & Coherent Pendulum',
    difficulty: 'Advanced',
    accent: '#fbbf24',
    isNew: true,
    simpleSummary:
      'Trap a quantum particle inside a parabolic bowl V = ½ω²x² and even the lowest state refuses to sit at rest (Zero-Point Energy E₀ = ½ℏω)! Mix levels to beat, or displace the packet into a quantum pendulum.',
    watchFor: [
      'Notice the glowing emerald tails of |ψ|² leaking past the magenta classical turning-point pillars!',
      'Compare stationary eigenstates (n = 0..4) against "Quantum Beat (0 + 1)" where probability sloshes.',
      'Select "Coherent Pendulum" to watch a non-spreading Gaussian oscillate like a classical mass on a spring!',
    ],
    quickActions: [
      { label: 'Ground State (n=0)', apply: { qhoMode: 'eigenstate', qhoLevel: 0 } },
      { label: 'Excited Mode (n=3)', apply: { qhoMode: 'eigenstate', qhoLevel: 3 } },
      { label: 'Quantum Beat (0 + 1)', apply: { qhoMode: 'superposition' } },
      { label: 'Coherent Pendulum', apply: { qhoMode: 'coherent', qhoOffset: 4.0 } },
    ],
  },
];

export const THERMO_CHAPTERS: BookChapterSummary[] = [
  {
    id: 'thermo-gas',
    topicId: 'thermo',
    number: 1,
    title: 'Ideal Gas & Maxwell Box',
    subtitle: 'Kinetic Theory & Piston Pressure',
    difficulty: 'Beginner',
    accent: '#f97316',
    isNew: true,
    simpleSummary:
      'Watch 160 gas particles bounce elastically inside a movable piston! Heating the box speeds molecules up while squeezing volume packs collisions closer together—pushing pressure up.',
    watchFor: [
      'Compress Volume to 45% to watch wall collision impulse & pressure double.',
      'Heat the box to 700 K to see fast thermal speed boost pressure linearly.',
    ],
    quickActions: [
      { label: 'Hot 700 K', apply: { temp: 700 } },
      { label: 'Cold 120 K', apply: { temp: 120 } },
      { label: 'Squeeze 45%', apply: { vol: 0.45 } },
    ],
  },
  {
    id: 'thermo-carnot',
    topicId: 'thermo',
    number: 2,
    title: 'Carnot Heat Engine Cycle',
    subtitle: 'Reversible Work & Second-Law Limit',
    difficulty: 'Intermediate',
    accent: '#fbbf24',
    isNew: true,
    simpleSummary:
      'A synchronized cylinder piston and glowing 3D Pressure–Volume loop trace all four strokes of the ideal heat engine. Even a perfect engine cannot exceed η = 1 − T_C/T_H!',
    watchFor: [
      'Notice the blue dot tracing clockwise around the orange P–V work loop.',
      'Boost T_H to 1050 K to watch Carnot efficiency climb steeply.',
    ],
    quickActions: [
      { label: 'High T_H (1050 K)', apply: { tHot: 1050, tCold: 250 } },
      { label: 'Small ΔT (450/350 K)', apply: { tHot: 450, tCold: 350 } },
    ],
  },
  {
    id: 'thermo-brownian',
    topicId: 'thermo',
    number: 3,
    title: 'Brownian Motion & Random Walk',
    subtitle: 'Microscopic Fluctuations & Diffusion',
    difficulty: 'Beginner',
    accent: '#38bdf8',
    isNew: true,
    simpleSummary:
      'Uneven impacts from tiny, fast solvent molecules kick a heavy golden pollen grain along a jagged random walk—Einstein’s direct proof that atoms exist!',
    watchFor: [
      'Trace the jagged golden path curving unpredictably through empty space.',
      'Raise Bath Temperature to 650 K to speed up diffusion ⟨r²⟩ = 6Dt.',
    ],
    quickActions: [
      { label: 'Cold Bath (100 K)', apply: { temp: 100 } },
      { label: 'Boiling Bath (650 K)', apply: { temp: 650 } },
    ],
  },
  {
    id: 'thermo-entropy',
    topicId: 'thermo',
    number: 4,
    title: 'Entropy & Mixing (Arrow of Time)',
    subtitle: 'Boltzmann Microstates & Irreversibility',
    difficulty: 'Intermediate',
    accent: '#ef4444',
    isNew: true,
    simpleSummary:
      'Hot red molecules sit isolated on the left and cold blue on the right (Entropy = 0). Pull out the divider wall and watch them spontaneously mix toward maximum disorder!',
    watchFor: [
      'Watch Shannon/Boltzmann Mixing Entropy climb from 0 toward ln(2) ≈ 0.693.',
      'Try resetting unmixed states to verify mixing never spontaneously reverses.',
    ],
    quickActions: [
      { label: 'Remove Divider Wall', apply: { action: 'removeDivider' } },
      { label: 'Reset Unmixed', apply: { action: 'resetEntropy' } },
    ],
  },
];

export const OPTICS_CHAPTERS: BookChapterSummary[] = [
  {
    id: 'opt-snell',
    topicId: 'optics',
    number: 1,
    title: "Snell's Law & Internal Reflection",
    subtitle: 'Refraction Boundary & Fiber Optics',
    difficulty: 'Beginner',
    accent: '#ec4899',
    isNew: true,
    simpleSummary:
      'Light bends sharply whenever it crosses between materials of different refractive index. Tilt shallow enough inside glass (n₁ > n₂) and 100% bounces back—how fiber-optic internet traps laser beams!',
    watchFor: [
      'Sweep Incident Angle past 41.8° in glass→air to trigger Total Internal Reflection.',
      'Compare Glass→Air against Air→Water bending toward the normal.',
    ],
    quickActions: [
      { label: 'TIR Glass→Air (55°)', apply: { thetaIncDeg: 55, n1: 1.5, n2: 1.0 } },
      { label: 'Air→Water (45°)', apply: { thetaIncDeg: 45, n1: 1.0, n2: 1.33 } },
    ],
  },
  {
    id: 'opt-prism',
    topicId: 'optics',
    number: 2,
    title: 'Chromatic Dispersion Prism',
    subtitle: 'Cauchy Spectrum Splitting',
    difficulty: 'Beginner',
    accent: '#a855f7',
    isNew: true,
    simpleSummary:
      'Glass slows violet light slightly more than red light! When white sunlight slices through a triangular prism, each color refracts at a distinct angle into a vibrant 7-band rainbow.',
    watchFor: [
      'Notice violet (415 nm) bends steepest downward while red (670 nm) bends least.',
    ],
    quickActions: [
      { label: 'Steep Entry (58°)', apply: { prismIncDeg: 58 } },
      { label: 'Shallow Entry (28°)', apply: { prismIncDeg: 28 } },
    ],
  },
  {
    id: 'opt-lens',
    topicId: 'optics',
    number: 3,
    title: 'Thin Lens Ray Tracer',
    subtitle: 'Real Images vs. Virtual Magnifiers',
    difficulty: 'Intermediate',
    accent: '#38bdf8',
    isNew: true,
    simpleSummary:
      'Trace principal rays from the cyan object through focal points to predict exact magnification and image placement. Slip closer than focal length f and the image flips upright like a magnifying glass!',
    watchFor: [
      'Notice emerald Real inverted image (d_o > f) flip to pink Virtual upright image (d_o < f)!',
    ],
    quickActions: [
      { label: 'Real Inverted (d=6.5)', apply: { objectDist: 6.5, focalLength: 3.2 } },
      { label: 'Virtual Magnifier (d=1.8)', apply: { objectDist: 1.8, focalLength: 3.2 } },
    ],
  },
  {
    id: 'opt-polar',
    topicId: 'optics',
    number: 4,
    title: "Malus's Law & 3-Polarizer Paradox",
    subtitle: 'Transverse Wave Projection',
    difficulty: 'Advanced',
    accent: '#fbbf24',
    isNew: true,
    simpleSummary:
      'Crossed 0° and 90° polarizing filters block 100% of light—yet slipping a THIRD 45° filter right between them somehow lets 12.5% shine through! Watch the transverse wave rotate step-by-step.',
    watchFor: [
      'Toggle Middle 45° Filter OFF (0% output) vs ON (12.5% output)!',
    ],
    quickActions: [
      { label: 'Insert 45° Middle (12.5%)', apply: { useMiddlePol: true, pol2Deg: 45, pol3Deg: 90 } },
      { label: 'Remove Middle (0% Dark)', apply: { useMiddlePol: false, pol3Deg: 90 } },
    ],
  },
];

export const MECHANICS_CHAPTERS: BookChapterSummary[] = [
  {
    id: 'mech-chaos',
    topicId: 'mechanics',
    number: 1,
    title: 'Double Pendulum Chaos',
    subtitle: 'Deterministic Sensitivity (Butterfly Effect)',
    difficulty: 'Intermediate',
    accent: '#38bdf8',
    isNew: true,
    simpleSummary:
      'Two double pendulums start nearly identically—separated by 0.002 rad—governed by identical exact RK4 equations. Watch how quickly their trails split completely!',
    watchFor: [
      'Notice Cyan and Pink overlap tightly for the first few swings before diverging sharply.',
      'Total mechanical energy stays strictly conserved even during wild flips!',
    ],
    quickActions: [{ label: 'Reset Twin Pendulums', apply: { action: 'relaunchChaos' } }],
  },
  {
    id: 'mech-coupled',
    topicId: 'mechanics',
    number: 2,
    title: 'Coupled Oscillators & Normal Modes',
    subtitle: 'Symmetric, Antisymmetric & Quantum-Like Beats',
    difficulty: 'Intermediate',
    accent: '#00f0ff',
    isNew: true,
    simpleSummary:
      'Link two masses with three springs: pull them together for symmetric sway, oppose them for fast vibration, or push just one and watch energy trade back and forth completely!',
    watchFor: [
      'In Beat Mode, watch one mass stop completely while the other swings at full energy!',
    ],
    quickActions: [
      { label: 'Beat Energy Swap', apply: { coupleMode: 'beat' } },
      { label: 'Symmetric Mode', apply: { coupleMode: 'symmetric' } },
      { label: 'Antisymmetric Mode', apply: { coupleMode: 'antisymmetric' } },
    ],
  },
  {
    id: 'mech-gyro',
    topicId: 'mechanics',
    number: 3,
    title: 'Gyroscope Precession',
    subtitle: 'Gravity Torque τ = dL/dt',
    difficulty: 'Intermediate',
    accent: '#fbbf24',
    isNew: true,
    simpleSummary:
      'Why doesn’t a spinning bike wheel flop to the ground? Gravity’s torque acts sideways on its angular momentum L, steering the axle smoothly around in a horizontal circle!',
    watchFor: [
      'Counter-intuitively, spinning FASTER (ω_s = 56) makes horizontal precession SLOWER!',
    ],
    quickActions: [
      { label: 'Slow Spin (Fast Precess)', apply: { gyroSpin: 10 } },
      { label: 'Fast Spin (Steady Lock)', apply: { gyroSpin: 56 } },
    ],
  },
  {
    id: 'mech-coriolis',
    topicId: 'mechanics',
    number: 4,
    title: 'Turntable & Coriolis Deflection',
    subtitle: 'Inertial Straight Lines vs. Rotating Curves',
    difficulty: 'Beginner',
    accent: '#10b981',
    isNew: true,
    simpleSummary:
      'Roll a frictionless puck straight across a spinning carousel: from above (Inertial), it moves in a dead-straight line, while from the turntable (Rotating), it loops sideways!',
    watchFor: [
      'Flip between Rotating Frame and Inertial Frame to prove Coriolis is pure geometry!',
    ],
    quickActions: [
      { label: 'Rotating View (Curved)', apply: { frame: 'rotating' } },
      { label: 'Inertial View (Straight)', apply: { frame: 'inertial' } },
    ],
  },
];

export const FLUIDS_CHAPTERS: BookChapterSummary[] = [
  {
    id: 'fluid-venturi',
    topicId: 'fluids',
    number: 1,
    title: "Venturi Tube & Bernoulli's Law",
    subtitle: 'Constricted Continuity & Pressure Drop',
    difficulty: 'Beginner',
    accent: '#06b6d4',
    isNew: true,
    simpleSummary:
      'Fluid rushing into a narrow pipe throat must speed up to conserve flow (A₁v₁ = A₂v₂)—and that burst of speed drops static pressure in the center column!',
    watchFor: [
      'Compare the short amber pressure column at the tight throat against the tall cyan inlet columns!',
    ],
    quickActions: [
      { label: 'Tight Squeeze (30%)', apply: { throatRatio: 0.3 } },
      { label: 'Wide Throat (80%)', apply: { throatRatio: 0.8 } },
    ],
  },
  {
    id: 'fluid-airfoil',
    topicId: 'fluids',
    number: 2,
    title: 'Magnus Circulation & Lift',
    subtitle: 'Kutta–Joukowski Aerodynamic Lift',
    difficulty: 'Intermediate',
    accent: '#f97316',
    isNew: true,
    simpleSummary:
      'Spinning a ball or tilting a wing induces bound circulation Γ: air whips faster over the top surface and slower below—creating an upward net lift arrow!',
    watchFor: [
      'Reverse Circulation Γ to −10 and watch the golden Lift arrow invert into downforce!',
    ],
    quickActions: [
      { label: 'Strong Upward Lift (+10)', apply: { circulation: 10 } },
      { label: 'Downforce (−10)', apply: { circulation: -10 } },
    ],
  },
  {
    id: 'fluid-vortex',
    topicId: 'fluids',
    number: 3,
    title: 'Kármán Vortex Street',
    subtitle: 'Wake Instability & Strouhal Shedding',
    difficulty: 'Intermediate',
    accent: '#38bdf8',
    isNew: true,
    simpleSummary:
      'Flow past a cylinder breaks symmetry behind the obstacle, peeling off alternating counter-rotating swirls that wobble downwind—the exact wind vibration behind flags and chimneys!',
    watchFor: [
      'Follow smoke tracers curving into alternating upper and lower eddies downstream.',
    ],
  },
  {
    id: 'fluid-wave',
    topicId: 'fluids',
    number: 4,
    title: 'Shallow-Water Soliton Tank',
    subtitle: 'KdV Nonlinear Wave Collision',
    difficulty: 'Advanced',
    accent: '#00f0ff',
    isNew: true,
    simpleSummary:
      'In shallow channels, taller solitary water humps outrun shorter ones! Watch the tall cyan soliton overtake the smaller wave and emerge completely unscathed.',
    watchFor: [
      'Notice both pulses keep their exact shape & height after passing straight through each other!',
    ],
    quickActions: [
      { label: 'Tall Fast Wave (3.4m)', apply: { amp1: 3.4 } },
      { label: 'Restart Collision', apply: { action: 'relaunchSoliton' } },
    ],
  },
];

export const RELATIVITY_CHAPTERS: BookChapterSummary[] = [
  {
    id: 'rel-dilation',
    topicId: 'relativity',
    number: 1,
    title: 'Light Clock & Time Dilation',
    subtitle: 'Invariant Light Speed c & γ Factor',
    difficulty: 'Beginner',
    accent: '#c084fc',
    isNew: true,
    simpleSummary:
      'Compare a stationary photon bouncing vertically against one inside a relativistic spaceship tracing a longer diagonal zigzag. Since light speed c stays constant, the ship clock ticks γ× slower!',
    watchFor: [
      'Slide Ship Speed β up to 0.90c to watch the moving golden photon lag sharply behind the stationary cyan clock.',
    ],
    quickActions: [
      { label: 'Fast Ship (0.88c)', apply: { beta: 0.88 } },
      { label: 'Slow Cruise (0.30c)', apply: { beta: 0.3 } },
    ],
  },
  {
    id: 'rel-lorentz',
    topicId: 'relativity',
    number: 2,
    title: 'Length Contraction & Light Cone',
    subtitle: 'Minkowski Geometry & Boosted Axes',
    difficulty: 'Intermediate',
    accent: '#fbbf24',
    isNew: true,
    simpleSummary:
      'Objects rushing near light speed shrink along their direction of travel, while primed spacetime axes scissor inward toward the 45° golden Light Cone!',
    watchFor: [
      'Notice purple ct′ and x′ axes pinch toward the 45° cone boundary without ever crossing c!',
    ],
    quickActions: [
      { label: 'Extreme 0.92c', apply: { beta: 0.92 } },
      { label: 'Rest Frame 0.0c', apply: { beta: 0.0 } },
    ],
  },
  {
    id: 'rel-decay',
    topicId: 'relativity',
    number: 3,
    title: 'Radioactive Decay & Half-Life',
    subtitle: '216-Atom Stochastic Isotope Lattice',
    difficulty: 'Beginner',
    accent: '#10b981',
    isNew: true,
    simpleSummary:
      'No single atom knows when it will decay—yet across a 216-atom crystal, emerald parent nuclei transform smoothly along N(t) = N₀ (½)^(t/t₁/₂)!',
    watchFor: [
      'Check remaining emerald count vs theoretical curve at 1.0 half-life (~108 left).',
    ],
    quickActions: [
      { label: 'Fast Decay (2.5 s)', apply: { halfLife: 2.5 } },
      { label: 'Refill 216 Atoms', apply: { action: 'resetDecay' } },
    ],
  },
  {
    id: 'rel-fission',
    topicId: 'relativity',
    number: 4,
    title: 'Nuclear Chain Reaction & Control',
    subtitle: 'Criticality k_eff & Boron Rods',
    difficulty: 'Intermediate',
    accent: '#a855f7',
    isNew: true,
    simpleSummary:
      'Splitting U-235 emits prompt neutrons that can spark more fissions! Raise Boron control rods for supercritical growth (k > 1) or drop them in to brake safely below 1.0.',
    watchFor: [
      'Steer Control Rod Depth smoothly to hold Criticality right around k_eff = 1.00!',
    ],
    quickActions: [
      { label: 'Pull Rods (Supercritical)', apply: { rodInsertion: 0.1 } },
      { label: 'Drop Rods (SCRAM Brake)', apply: { rodInsertion: 0.9 } },
    ],
  },
];

export const NUCLEAR_CHAPTERS: BookChapterSummary[] = [
  {
    id: 'nuc-liquiddrop',
    topicId: 'nuclear',
    number: 1,
    title: 'Liquid-Drop Nuclear Fission',
    subtitle: 'U-235 + n → Ba-141 + Kr-92 + 3n + 200 MeV',
    difficulty: 'Beginner',
    accent: '#f97316',
    isNew: true,
    simpleSummary:
      'A single slow neutron slips into Uranium-235 and makes the nucleus wobble like a stretched water droplet until electric repulsion snaps its thin neck—releasing 200 MeV and 3 fast neutrons!',
    watchFor: [
      'Watch the glowing neck pinch in the custom GLSL liquid-drop shader before scission!',
      'Notice how 1 neutron enters and 3 fast neutrons fly out to seed a chain reaction.',
    ],
    quickActions: [
      { label: 'Fire Thermal Neutron', apply: { fireNeutron: true, dropSpeed: 0.24 } },
      { label: 'Ultra Slow-Mo (0.10×)', apply: { fireNeutron: true, dropSpeed: 0.1 } },
    ],
  },
  {
    id: 'nuc-critical',
    topicId: 'nuclear',
    number: 2,
    title: 'Critical Mass & Chain Reaction',
    subtitle: 'Neutron Leakage vs Exponential Growth (k_eff)',
    difficulty: 'Intermediate',
    accent: '#38bdf8',
    isNew: true,
    simpleSummary:
      'In a small lump of Uranium-235, most neutrons escape through the surface before hitting another atom. Cross Critical Mass or add a Neutron Reflector so k_eff > 1 and the cascade explodes exponentially!',
    watchFor: [
      'Compare 25 kg (Subcritical fizzle) vs 72 kg + Reflector (Supercritical cascade)!',
    ],
    quickActions: [
      { label: 'Subcritical (25 kg)', apply: { coreMassKg: 25, reflectorEff: 0.0 } },
      { label: 'Supercritical + Reflector', apply: { coreMassKg: 72, reflectorEff: 0.65 } },
    ],
  },
  {
    id: 'nuc-implosion',
    topicId: 'nuclear',
    number: 3,
    title: 'Density Compression (M_c ∝ 1/ρ²)',
    subtitle: 'How Compressing a Subcritical Core Turns It Supercritical',
    difficulty: 'Intermediate',
    accent: '#fbbf24',
    isNew: true,
    simpleSummary:
      'Squeezing a metallic sphere to 2× normal density packs nuclei closer together—shrinking the critical mass by 4× (M_c ∝ 1/ρ²)! A safely subcritical core suddenly jumps deeply supercritical.',
    watchFor: [
      'Watch the core glow shift from cool blue (subcritical) to blazing orange-red (supercritical) as ρ/ρ₀ rises!',
    ],
    quickActions: [
      { label: 'Uncompressed (1.0× ρ₀)', apply: { compressionRatio: 1.0 } },
      { label: 'Peak Compression (2.3× ρ₀)', apply: { compressionRatio: 2.3 } },
      { label: 'Auto Pulse', apply: { implosionAuto: true } },
    ],
  },
  {
    id: 'nuc-fireball',
    topicId: 'nuclear',
    number: 4,
    title: 'E = mc² Fireball & Shockwave',
    subtitle: 'Blackbody Plasma, Sedov-Taylor Blast & Energy Split',
    difficulty: 'Advanced',
    accent: '#ef4444',
    isNew: true,
    simpleSummary:
      'Converting less than ONE GRAM of mass defect directly into energy heats the air into a blinding blackbody plasma fireball, launching a Sedov-Taylor shockwave and towering thermal convection plume.',
    watchFor: [
      'Notice the energy split: 50% blast shockwave, 35% thermal flash, and 15% nuclear radiation.',
      'Slide Fissioned Mass up to 2.0 kg to see both Δm (grams) and Sedov-Taylor radius R(t) grow!',
    ],
    quickActions: [
      { label: '15 kt Reference (0.85 kg)', apply: { fissionedMassKg: 0.85, triggerBlast: true } },
      { label: '35 kt High Yield (2.0 kg)', apply: { fissionedMassKg: 2.0, triggerBlast: true } },
    ],
  },
];

export const FUSION_CHAPTERS: BookChapterSummary[] = [
  {
    id: 'fus-tokamak',
    topicId: 'fusion',
    number: 1,
    title: 'Tokamak Magnetic Plasma Cage',
    subtitle: '150 MK Toroidal Plasma, Superconducting Coils & Lawson Q',
    difficulty: 'Beginner',
    accent: '#f472b6',
    isNew: true,
    simpleSummary:
      'No solid container can survive 150-million-degree plasma—so superconducting magnets twist field lines into a floating donut cage, levitating burning fuel away from the walls!',
    watchFor: [
      'Watch the glowing helical plasma filaments twist around the cutaway Blender superconducting coils!',
      'Crank Toroidal Magnetic Field B up to 12 T to push the Lawson triple product into self-sustaining IGNITED BURN.',
    ],
    quickActions: [
      { label: 'Ignite Tokamak (12 T · 160 MK)', apply: { bTesla: 12.0, tokamakTempMK: 160, confinementSec: 4.5 } },
      { label: 'Low-Field Driven (5 T)', apply: { bTesla: 5.0, tokamakTempMK: 90, confinementSec: 1.5 } },
    ],
  },
  {
    id: 'fus-tunnel',
    topicId: 'fusion',
    number: 2,
    title: 'Quantum Tunneling D-T Fusion',
    subtitle: '²H + ³H → ⁴He (3.5 MeV) + n (14.1 MeV)',
    difficulty: 'Intermediate',
    accent: '#38bdf8',
    isNew: true,
    simpleSummary:
      'Deuterium and Tritium nuclei both carry positive charge and violently repel—yet at extreme heat, their quantum waves overlap and tunnel straight through the Coulomb barrier!',
    watchFor: [
      'Drop Plasma Temperature to 25 MK to watch them bounce off the glowing barrier, then raise to 160 MK to watch them fuse!',
    ],
    quickActions: [
      { label: 'Hot Tunneling (160 MK)', apply: { tunnelTempMK: 160, triggerFusion: true } },
      { label: 'Cold Coulomb Bounce (25 MK)', apply: { tunnelTempMK: 25, triggerFusion: true } },
    ],
  },
  {
    id: 'fus-icf',
    topicId: 'fusion',
    number: 3,
    title: 'Laser Inertial Confinement (ICF)',
    subtitle: '16 Converging UV Lasers, Gold Hohlraum & Q > 1 Ignition',
    difficulty: 'Intermediate',
    accent: '#fbbf24',
    isNew: true,
    simpleSummary:
      'Sixteen synchronized ultraviolet laser beams fire into a tiny gold hohlraum, bathing a frozen fuel pellet in uniform X-rays until it implodes past scientific breakeven (Q > 1)!',
    watchFor: [
      'Cross 2.0 MJ laser drive to watch the dramatic white-gold thermonuclear ignition flash and expanding alpha-heating wave!',
    ],
    quickActions: [
      { label: 'NIF Ignition Shot (2.4 MJ)', apply: { laserMJ: 2.4, fireLasers: true } },
      { label: 'Sub-Ignition (1.2 MJ)', apply: { laserMJ: 1.2, fireLasers: true } },
    ],
  },
  {
    id: 'fus-stellar',
    topicId: 'fusion',
    number: 4,
    title: 'Solar Core & Magnetic Corona',
    subtitle: 'Boiling Photosphere, Coronal Loops & L ∝ M³·⁵',
    difficulty: 'Advanced',
    accent: '#f97316',
    isNew: true,
    simpleSummary:
      'Gravity acts as nature’s ultimate fusion reactor—crushing hydrogen in our Sun’s core to convert 4.26 million tonnes of matter into pure starlight every single second!',
    watchFor: [
      'Watch glowing plasma beads race along 3D magnetic coronal prominence arches above the boiling GLSL photosphere!',
      'Slide Stellar Mass up to 2.0 M☉ to see luminosity jump more than 11× and shift blue-white.',
    ],
    quickActions: [
      { label: 'Our Sun (1.0 M☉)', apply: { solarMasses: 1.0 } },
      { label: 'Blue-White Giant (2.0 M☉)', apply: { solarMasses: 2.0 } },
    ],
  },
];

export const BOOK_VOLUMES: BookVolume[] = [
  {
    id: 'circuits',
    roman: 'Vol. I',
    title: 'Circuits & Electron POV',
    subtitle: 'Drude Scattering, Voltage Hills & Components',
    icon: '⚡',
    accent: '#00f0ff',
    description:
      'Ride inside a copper wire as a single conduction electron! Explore Ohm’s Law, battery escalators, 90° surface-charge corners, capacitors, and RLC resonance.',
    chapters: PROJECT_CHAPTERS.map((ch) => ({
      id: ch.id,
      topicId: 'circuits',
      number: ch.number,
      title: ch.title,
      subtitle: ch.subtitle,
      difficulty: ch.difficulty,
      accent: ch.accent,
      isNew: ch.isNew,
      simpleSummary: ch.simpleSummary,
      watchFor: ch.watchFor,
      quickActions: ch.quickActions?.map((q) => ({
        label: q.label,
        apply: q.apply as Record<string, number | boolean | string>,
      })),
    })),
  },
  {
    id: 'em',
    roman: 'Vol. II',
    title: 'Electromagnetism & Light',
    subtitle: 'Dipoles, Lorentz Spirals, EM Waves & Hall Sensor',
    icon: '🧲',
    accent: '#a855f7',
    description:
      'See electric and magnetic fields come alive in 3D! Launch test charges, watch cyclotron spirals, inspect light waves, generate Faraday EMF, and test Hall sensors.',
    chapters: EM_CHAPTERS,
  },
  {
    id: 'gravity',
    roman: 'Vol. III',
    title: 'Gravity & Spacetime',
    subtitle: 'Wells, Kepler Orbits, Black Holes & Lagrange',
    icon: '🪐',
    accent: '#f59e0b',
    description:
      'Watch massive stars bend a 3D spacetime fabric! Fire probes, trace Kepler ellipses, dance around binary stars, slingshot past a black hole, and explore L1–L5.',
    chapters: GRAVITY_CHAPTERS,
  },
  {
    id: 'waves',
    roman: 'Vol. IV',
    title: 'Waves, Fields & Quantum',
    subtitle: 'Double-Slit, Tunneling, Vector Calculus & QHO',
    icon: '🌊',
    accent: '#10b981',
    description:
      'Explore superposition ripples, quantized standing waves, Schrödinger barrier tunneling, 3D vector calculus, and the Quantum Harmonic Oscillator.',
    chapters: WAVES_CHAPTERS,
  },
  {
    id: 'thermo',
    roman: 'Vol. V',
    title: 'Thermodynamics & Stat Mech',
    subtitle: 'Ideal Gas, Carnot Engine, Brownian & Entropy',
    icon: '🔥',
    accent: '#f97316',
    description:
      'Discover how temperature, pressure, Carnot efficiency, Brownian diffusion, and irreversible entropy emerge from bouncing microscopic molecules.',
    chapters: THERMO_CHAPTERS,
  },
  {
    id: 'optics',
    roman: 'Vol. VI',
    title: 'Optics & Photonics',
    subtitle: 'Snell TIR, Rainbow Prisms, Lenses & Polarizers',
    icon: '🌈',
    accent: '#ec4899',
    description:
      'Bend laser beams at refractive boundaries, split white sunlight through a dispersion prism, trace thin-lens images, and unlock the 3-polarizer paradox.',
    chapters: OPTICS_CHAPTERS,
  },
  {
    id: 'mechanics',
    roman: 'Vol. VII',
    title: 'Classical Mechanics & Chaos',
    subtitle: 'Butterfly Chaos, Normal Modes, Gyros & Coriolis',
    icon: '⚙️',
    accent: '#38bdf8',
    description:
      'Watch twin double pendulums diverge chaotically, trade energy across coupled springs, spin a precessing gyroscope, and compare inertial vs Coriolis frames.',
    chapters: MECHANICS_CHAPTERS,
  },
  {
    id: 'fluids',
    roman: 'Vol. VIII',
    title: 'Fluid Dynamics & Aero',
    subtitle: 'Venturi, Magnus Lift, Vortex Street & Solitons',
    icon: '💨',
    accent: '#06b6d4',
    description:
      'Measure Bernoulli pressure drops in Venturi pipes, generate aerodynamic lift via circulation, shed Kármán vortex streets, and collide KdV water solitons.',
    chapters: FLUIDS_CHAPTERS,
  },
  {
    id: 'relativity',
    roman: 'Vol. IX',
    title: 'Relativity & Nuclear',
    subtitle: 'Time Dilation, Light Cones, Decay & Fission',
    icon: '⚛️',
    accent: '#c084fc',
    description:
      'Compare moving light clocks, tilt Minkowski spacetime axes inside a 3D light cone, watch 216 atoms decay randomly, and steer a Uranium-235 chain reaction.',
    chapters: RELATIVITY_CHAPTERS,
  },
  {
    id: 'nuclear',
    roman: 'Vol. X',
    title: 'Atomic Fission & Energy',
    subtitle: 'Liquid-Drop Split, Critical Mass, Implosion & E=mc²',
    icon: '☢️',
    accent: '#f97316',
    description:
      'Explore the complete physics of an atomic reaction—from a single U-235 droplet snapping apart to critical mass, density compression (M_c ∝ 1/ρ²), and the E = mc² fireball shockwave.',
    chapters: NUCLEAR_CHAPTERS,
  },
  {
    id: 'fusion',
    roman: 'Vol. XI',
    title: 'Stellar Fusion & Tokamak',
    subtitle: 'Tokamak Plasma, Quantum Tunneling, Laser ICF & Stars',
    icon: '☀️',
    accent: '#f472b6',
    description:
      'Step inside a 150-million-degree magnetic tokamak, fire 16 converging UV lasers at a gold hohlraum, watch D-T nuclei tunnel through Coulomb repulsion, and orbit a boiling star.',
    chapters: FUSION_CHAPTERS,
  },
];

export function getVolumeById(topicId: TopicId): BookVolume {
  return BOOK_VOLUMES.find((v) => v.id === topicId) ?? BOOK_VOLUMES[0];
}
