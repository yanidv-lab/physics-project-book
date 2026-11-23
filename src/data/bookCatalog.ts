import type { TopicId } from '../types/simulation';
import { PROJECT_CHAPTERS, type Difficulty } from './projectBook';

export interface BookQuickAction {
  label: string;
  apply: Record<string, number | boolean | string>;
}

export interface BookChapterSummary {
  id: string;
  topicId: TopicId;
  number: number;
  title: string;
  subtitle: string;
  difficulty: Difficulty;
  accent: string;
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
    subtitle: 'Dipoles, Lorentz Spirals, EM Waves & Induction',
    icon: '🧲',
    accent: '#a855f7',
    description:
      'See electric and magnetic fields come alive in 3D! Launch test charges, watch cyclotron spirals, inspect orthogonal light waves, and generate current by plunging a magnet.',
    chapters: EM_CHAPTERS,
  },
  {
    id: 'gravity',
    roman: 'Vol. III',
    title: 'Gravity & Spacetime',
    subtitle: 'Curved Wells, Kepler Orbits, Binaries & Black Holes',
    icon: '🪐',
    accent: '#f59e0b',
    description:
      'Watch massive stars bend a 3D spacetime fabric! Fire planetary probes, observe Kepler’s energy trade-offs, dance around binary stars, and slingshot past a black hole.',
    chapters: GRAVITY_CHAPTERS,
  },
  {
    id: 'waves',
    roman: 'Vol. IV',
    title: 'Waves, Fields & Quantum',
    subtitle: 'Double-Slit, Harmonics, Tunneling & Vector Calculus',
    icon: '🌊',
    accent: '#10b981',
    description:
      'Explore superposition ripples, quantized standing waves, a real-time Schrödinger quantum wavepacket tunneling through walls, and 3D Gradient / Divergence / Curl fields.',
    chapters: WAVES_CHAPTERS,
  },
];

export function getVolumeById(topicId: TopicId): BookVolume {
  return BOOK_VOLUMES.find((v) => v.id === topicId) ?? BOOK_VOLUMES[0];
}
