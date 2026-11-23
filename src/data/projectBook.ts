import { wrapS } from '../physics/constants';
import type { PathGeometry } from '../physics/pathGeometry';
import type {
  CameraMode,
  HoverTargetKind,
  LayerVisibility,
  SourceMode,
  TopologyId,
} from '../types/simulation';

export type Difficulty = 'Beginner' | 'Intermediate' | 'Advanced';

export type HeroAnchor =
  | 'wire-before-r1'
  | 'inside-r1'
  | 'battery-entry'
  | 'corner-2'
  | 'before-cap'
  | 'inside-inductor';

export interface ChapterQuickAction {
  label: string;
  apply: {
    temperature?: number;
    voltage?: number;
    resistance?: number;
    resistance2?: number;
    sourceMode?: SourceMode;
    acFrequency?: number;
    rcDischarging?: boolean;
    cameraMode?: CameraMode;
    heroAnchor?: HeroAnchor;
  };
}

export interface ProjectChapter {
  id: string;
  number: number;
  title: string;
  subtitle: string;
  difficulty: Difficulty;
  accent: string;
  simpleSummary: string;
  watchFor: string[];
  setup: {
    topology: TopologyId;
    sourceMode: SourceMode;
    voltage: number;
    acFrequency?: number;
    resistance: number;
    resistance2?: number;
    capacitance?: number;
    inductance?: number;
    rcDischarging?: boolean;
    temperature: number;
    scaleCompression: number;
    timeDilation: number;
    cameraMode: CameraMode;
    heroAnchor: HeroAnchor;
    layers: LayerVisibility;
  };
  quickActions?: ChapterQuickAction[];
}

export interface StudyNote {
  key: string;
  title: string;
  badge: string;
  accent: string;
  simple: string;
  deeper: string;
}

export function resolveHeroAnchorS(anchor: HeroAnchor, path: PathGeometry): number {
  const a = path.anchors;
  const L = path.totalLength;
  let target: number;
  switch (anchor) {
    case 'wire-before-r1':
      target = a.res1Start - 4.2;
      break;
    case 'inside-r1':
      target = 0.5 * (a.res1Start + a.res1End);
      break;
    case 'battery-entry':
      target = a.batteryStart + 1.2;
      break;
    case 'corner-2':
      target = a.res1Start - 10.75;
      break;
    case 'before-cap':
      target = a.capGapStart !== null ? a.capGapStart - 1.8 : a.res1End + 6.0;
      break;
    case 'inside-inductor':
      target =
        a.inductorStart !== null && a.inductorEnd !== null
          ? 0.5 * (a.inductorStart + a.inductorEnd)
          : a.batteryEnd + 16.0;
      break;
  }
  const wrapped = wrapS(target, L);
  if (a.capGapStart !== null && a.capGapEnd !== null && wrapped >= a.capGapStart && wrapped <= a.capGapEnd) {
    return wrapS(a.capGapStart - 0.5, L);
  }
  return wrapped;
}

export const PROJECT_CHAPTERS: ProjectChapter[] = [
  {
    id: 'ch1-zero-volt',
    number: 1,
    title: 'Never Standing Still',
    subtitle: '0 V Thermal & Quantum Chaos',
    difficulty: 'Beginner',
    accent: '#00f0ff',
    simpleSummary:
      'Even when the battery is completely OFF (0 V), electrons inside copper zip wildly at 1.57 million m/s! Because they bounce randomly in every direction, they make zero net progress.',
    watchFor: [
      'Check Drift Speed (v_d = 0) while Instant Speed stays ~1.57×10⁶ m/s.',
      'All purple electric field arrows vanish—pure random pinballing remains.',
      'Nudge Battery ON to 4 V below to watch ordered drift emerge from chaos.',
    ],
    setup: {
      topology: 'simple-r',
      sourceMode: 'dc',
      voltage: 0,
      resistance: 10,
      temperature: 300,
      scaleCompression: 0,
      timeDilation: 0.7,
      cameraMode: 'locked-drift',
      heroAnchor: 'wire-before-r1',
      layers: {
        electricField: true,
        surfaceCharge: true,
        potentialLandscape: false,
        phononGlow: true,
        magneticField: false,
      },
    },
    quickActions: [
      { label: 'Turn Battery ON (4 V)', apply: { voltage: 4.0 } },
      { label: 'Turn Battery OFF (0 V)', apply: { voltage: 0.0 } },
    ],
  },
  {
    id: 'ch2-bottleneck-heat',
    number: 2,
    title: 'The Bottleneck & Red-Hot Atoms',
    subtitle: "Ohm's Law & Joule Heating",
    difficulty: 'Beginner',
    accent: '#ff3b30',
    simpleSummary:
      'Watch your electron glide through wide copper wire, then squeeze into the narrow resistor. To preserve steady current, drift speeds up, collisions spike, and metal atoms shake red-hot!',
    watchFor: [
      'Purple E-field arrows suddenly stretch and brighten inside Resistor R₁.',
      'Amber lattice atoms shift toward incandescent red and emit thermal ripples.',
      'Drift velocity jumps by 2.78× in the constricted bottleneck (I = nAe v_d).',
    ],
    setup: {
      topology: 'simple-r',
      sourceMode: 'dc',
      voltage: 8.0,
      resistance: 8.0,
      temperature: 300,
      scaleCompression: 0,
      timeDilation: 0.85,
      cameraMode: 'locked-drift',
      heroAnchor: 'wire-before-r1',
      layers: {
        electricField: true,
        surfaceCharge: true,
        potentialLandscape: true,
        phononGlow: true,
        magneticField: false,
      },
    },
    quickActions: [
      { label: 'Jump Inside R₁', apply: { heroAnchor: 'inside-r1' } },
      { label: 'High Load (2 Ω Hot!)', apply: { resistance: 2.0, voltage: 10.0 } },
      { label: 'Gentle Load (100 Ω)', apply: { resistance: 100.0 } },
    ],
  },
  {
    id: 'ch3-battery-escalator',
    number: 3,
    title: 'Inside the Battery Escalator',
    subtitle: 'Chemical EMF vs. Electric Field',
    difficulty: 'Beginner',
    accent: '#10b981',
    simpleSummary:
      'Batteries do not create electrons—they act like an energy escalator! Green chemical force arrows push electrons uphill in potential energy against the battery’s own internal electric field.',
    watchFor: [
      'Watch the glowing cyan-indigo Potential Energy curtain climb steeply inside the battery.',
      'Green chemical escalator rings lift electrons from (+) up to (−).',
      'On the oscilloscope, watch the pink U(t) energy trace climb up as you pass through.',
    ],
    setup: {
      topology: 'simple-r',
      sourceMode: 'dc',
      voltage: 9.0,
      resistance: 12.0,
      temperature: 300,
      scaleCompression: 0,
      timeDilation: 0.75,
      cameraMode: 'side-cutaway',
      heroAnchor: 'battery-entry',
      layers: {
        electricField: true,
        surfaceCharge: true,
        potentialLandscape: true,
        phononGlow: false,
        magneticField: false,
      },
    },
    quickActions: [
      { label: 'Ride Inside Battery (POV)', apply: { cameraMode: 'locked-drift', heroAnchor: 'battery-entry' } },
      { label: 'Side Cutaway View', apply: { cameraMode: 'side-cutaway', heroAnchor: 'battery-entry' } },
    ],
  },
  {
    id: 'ch4-corner-steering',
    number: 4,
    title: 'Why Electrons Turn 90° Corners',
    subtitle: 'Surface-Charge Steering',
    difficulty: 'Intermediate',
    accent: '#3b82f6',
    simpleSummary:
      'Electricity is NOT like water slamming into pipe elbows! Tiny extra negative surface charges gather on the outer bend wall, tilting the purple electric field smoothly around the 90° corner.',
    watchFor: [
      'Notice the blue/red surface charge rings shifting tint between outer and inner walls.',
      'Violet E-field arrows curve seamlessly along the bend centerline.',
      'Hover over the corner wire in 3D to read how surface charges steer every field.',
    ],
    setup: {
      topology: 'simple-r',
      sourceMode: 'dc',
      voltage: 9.0,
      resistance: 10.0,
      temperature: 300,
      scaleCompression: 0,
      timeDilation: 0.65,
      cameraMode: 'side-cutaway',
      heroAnchor: 'corner-2',
      layers: {
        electricField: true,
        surfaceCharge: true,
        potentialLandscape: false,
        phononGlow: false,
        magneticField: false,
      },
    },
    quickActions: [
      { label: 'Fly Through Corner (POV)', apply: { cameraMode: 'locked-drift', heroAnchor: 'corner-2' } },
      { label: 'Macro Circuit View', apply: { cameraMode: 'macro-overview' } },
    ],
  },
  {
    id: 'ch5-cryo-vs-furnace',
    number: 5,
    title: 'Cryo Freeze vs. 800 K Furnace',
    subtitle: 'Temperature & Lattice Scattering',
    difficulty: 'Intermediate',
    accent: '#38bdf8',
    simpleSummary:
      'Cool copper to 10 K and its crystal atoms freeze nearly still—electrons glide smoothly with ~100× fewer collisions! Heat to 800 K and violent atomic shaking turns every wire into an obstacle course.',
    watchFor: [
      'Check Mean Free Time (τ) jump into picoseconds at 10 K.',
      'Hit "Blast to 800 K" below and watch lattice vibration amplitude & collisions explode.',
    ],
    setup: {
      topology: 'simple-r',
      sourceMode: 'dc',
      voltage: 6.0,
      resistance: 10.0,
      temperature: 10,
      scaleCompression: 0,
      timeDilation: 0.6,
      cameraMode: 'locked-drift',
      heroAnchor: 'wire-before-r1',
      layers: {
        electricField: true,
        surfaceCharge: false,
        potentialLandscape: false,
        phononGlow: true,
        magneticField: false,
      },
    },
    quickActions: [
      { label: 'Freeze 10 K', apply: { temperature: 10 } },
      { label: 'Room 300 K', apply: { temperature: 300 } },
      { label: 'Blast 800 K', apply: { temperature: 800 } },
    ],
  },
  {
    id: 'ch6-voltage-waterfall',
    number: 6,
    title: 'Two-Step Voltage Waterfall',
    subtitle: 'Series R₁ + R₂ Divider',
    difficulty: 'Intermediate',
    accent: '#a855f7',
    simpleSummary:
      'Look at the glowing 3D Potential Energy curtain from above: the battery lifts electrons to the top terrace, R₁ drops a small step, the middle wire coasts flat, and R₂ plunges the rest of the way!',
    watchFor: [
      'Hover over R₁, the middle wire, and R₂ in 3D to compare their live voltages.',
      'Notice the surface charge color drops more steeply across R₂ (30 Ω) than R₁ (10 Ω).',
      'Click any point on the 2D Eulerian Map to teleport your electron straight there.',
    ],
    setup: {
      topology: 'divider',
      sourceMode: 'dc',
      voltage: 12.0,
      resistance: 10.0,
      resistance2: 30.0,
      temperature: 300,
      scaleCompression: 0,
      timeDilation: 1.0,
      cameraMode: 'macro-overview',
      heroAnchor: 'wire-before-r1',
      layers: {
        electricField: true,
        surfaceCharge: true,
        potentialLandscape: true,
        phononGlow: true,
        magneticField: false,
      },
    },
    quickActions: [
      { label: 'Follow Electron (POV)', apply: { cameraMode: 'locked-drift' } },
      { label: 'Macro Waterfall View', apply: { cameraMode: 'macro-overview' } },
    ],
  },
  {
    id: 'ch7-capacitor-wall',
    number: 7,
    title: 'The Glass Wall & Phantom Current',
    subtitle: 'Capacitor & Displacement Current',
    difficulty: 'Advanced',
    accent: '#ec4899',
    simpleSummary:
      'No electron can physically cross the insulating glass gap! Instead, electrons pile up on the left plate, firing electric flux across the dielectric that repels a paired electron off the right plate.',
    watchFor: [
      'Watch your hero electron bounce off the glass barrier as cyan waves pulse across.',
      'Watch the oscilloscope amber V(t) curve charge up while current I(t) decays to zero.',
      'Click "Flip to Discharge" once charged to watch the stored field push electrons backward!',
    ],
    setup: {
      topology: 'rc',
      sourceMode: 'dc',
      voltage: 10.0,
      resistance: 25.0,
      capacitance: 0.025,
      rcDischarging: false,
      temperature: 300,
      scaleCompression: 0,
      timeDilation: 0.9,
      cameraMode: 'side-cutaway',
      heroAnchor: 'before-cap',
      layers: {
        electricField: true,
        surfaceCharge: true,
        potentialLandscape: true,
        phononGlow: false,
        magneticField: false,
      },
    },
    quickActions: [
      { label: 'Flip to Discharge', apply: { rcDischarging: true } },
      { label: 'Flip to Charge', apply: { rcDischarging: false } },
    ],
  },
  {
    id: 'ch8-rlc-slosh',
    number: 8,
    title: 'Magnetic Slosh & Resonance',
    subtitle: 'RLC Coiled Inductor Tank',
    difficulty: 'Advanced',
    accent: '#fbbf24',
    simpleSummary:
      'Coiling the wire builds swirling magnetic flux loops that act like a heavy flywheel! Whenever current tries to reverse, amber Faraday back-EMF arrows fight back—making electrons slosh back and forth.',
    watchFor: [
      'Watch the sky-blue magnetic flux loops brighten and reverse curl as I(t) oscillates.',
      'Notice the amber induced back-EMF arrows pulsing whenever current changes rapidly.',
      'Try "Drive at Resonance (1.59 Hz AC)" to pump maximum swinging current!',
    ],
    setup: {
      topology: 'rlc',
      sourceMode: 'dc',
      voltage: 10.0,
      acFrequency: 1.59,
      resistance: 3.0,
      capacitance: 0.004,
      inductance: 2.5,
      temperature: 300,
      scaleCompression: 0,
      timeDilation: 0.9,
      cameraMode: 'side-cutaway',
      heroAnchor: 'inside-inductor',
      layers: {
        electricField: true,
        surfaceCharge: false,
        potentialLandscape: true,
        phononGlow: false,
        magneticField: true,
      },
    },
    quickActions: [
      { label: 'Drive at Resonance (1.59 Hz AC)', apply: { sourceMode: 'ac', acFrequency: 1.59 } },
      { label: 'Macro Board Overview', apply: { cameraMode: 'macro-overview' } },
    ],
  },
  {
    id: 'ch9-true-scale',
    number: 9,
    title: 'Reality Check: 10¹⁰ : 1 Pinball',
    subtitle: 'True Physical Fermi-to-Drift Ratio',
    difficulty: 'Advanced',
    accent: '#f59e0b',
    simpleSummary:
      'In real copper at room temperature, random quantum Fermi speed is 10 billion times faster than forward drift! Watch the frantic zig-zagging—only the gold drift arrow reveals the tiny net progress.',
    watchFor: [
      'Compare the glowing gold Drift Arrow against the frantic cyan zig-zag trail.',
      'Try "Raw Co-Moving POV" to feel every violent collision directly from the electron’s eyes!',
    ],
    setup: {
      topology: 'simple-r',
      sourceMode: 'dc',
      voltage: 6.0,
      resistance: 10.0,
      temperature: 300,
      scaleCompression: 0.92,
      timeDilation: 0.35,
      cameraMode: 'locked-drift',
      heroAnchor: 'wire-before-r1',
      layers: {
        electricField: true,
        surfaceCharge: true,
        potentialLandscape: false,
        phononGlow: true,
        magneticField: false,
      },
    },
    quickActions: [
      { label: 'Raw Co-Moving POV', apply: { cameraMode: 'raw-pov' } },
      { label: 'Smooth Drift Cam', apply: { cameraMode: 'locked-drift' } },
    ],
  },
];

export const SCENE_STUDY_NOTES: Record<HoverTargetKind | 'surface' | 'potential', StudyNote> = {
  battery: {
    key: 'battery',
    title: 'Battery (Chemical Energy Escalator)',
    badge: 'EMF SOURCE',
    accent: '#10b981',
    simple:
      'Acts like an escalator for energy: chemical forces carry electrons from the (+) end up to the high-energy (−) end against the battery’s own electric field.',
    deeper:
      'Net force F = −eE_int + F_chem sustains current I against internal resistance r_int = 0.2 Ω, raising electron potential energy U = −eV.',
  },
  wire: {
    key: 'wire',
    title: 'Copper Interconnect',
    badge: 'LOW RESISTANCE',
    accent: '#00f0ff',
    simple:
      'Wide, low-friction highway for electrons. A tiny electric field (~millivolts/meter) is enough to nudge a steady stream forward.',
    deeper:
      'Copper has ρ = 1.68×10⁻⁸ Ω·m at 300 K and ~8.49×10²⁸ free electrons/m³, giving a room-temp mean free time τ ≈ 25 fs.',
  },
  resistor: {
    key: 'resistor',
    title: 'Load Resistor R₁ (Joule Heating)',
    badge: 'ENERGY DROP',
    accent: '#ff3b30',
    simple:
      'A tight, crowded bottleneck where electrons scatter much more frequently, dumping electrical energy into shaking atoms (glowing red!).',
    deeper:
      'Smaller cross-section A raises drift speed (v_d = I / nAe) while steep surface-charge gradients create intense axial E = Iρ/A, dissipating P = I²R.',
  },
  resistor2: {
    key: 'resistor2',
    title: 'Series Divider Resistor R₂',
    badge: 'SECOND STEP',
    accent: '#f59e0b',
    simple:
      'The second step of our voltage waterfall. The ratio R₂ / (R₁ + R₂) sets how much of the battery’s energy drops here versus in R₁.',
    deeper:
      'Same loop current I flows through both R₁ and R₂, so ΔV₂ / ΔV₁ = R₂ / R₁ and the copper interconnect between them sits at a flat mid-potential plateau.',
  },
  capacitor: {
    key: 'capacitor',
    title: 'Parallel-Plate Capacitor (Glass Gap)',
    badge: 'INSULATING BARRIER',
    accent: '#a855f7',
    simple:
      'A glass wall that electrons CANNOT cross! Instead, charges pile up on one plate and push electrons off the opposite plate via electric field lines.',
    deeper:
      'Changing electric flux creates Maxwell displacement current J_D = ε₀ ∂E/∂t across the gap, maintaining continuity I(t) = C dV_C/dt around the loop.',
  },
  inductor: {
    key: 'inductor',
    title: 'Helical Inductor Coil (Magnetic Flywheel)',
    badge: 'MAGNETIC INERTIA',
    accent: '#38bdf8',
    simple:
      'A coiled wire that stores momentum-like energy in swirling magnetic loops. It resists sudden speed-ups or stops, causing RLC sloshing!',
    deeper:
      'Varying current induces a non-conservative electric field E_ind = −∂A/∂t and Faraday back-EMF ε = −L dI/dt opposing changes in current.',
  },
  corner: {
    key: 'corner',
    title: '90° Wire Bend (Surface-Charge Steering)',
    badge: 'CORNER STEERING',
    accent: '#3b82f6',
    simple:
      'Tiny extra negative charges build up on the outer wall of the bend, gently tilting the electric field so electrons glide around smoothly.',
    deeper:
      'Unlike water slamming into a pipe elbow, steady current turns corners because asymmetric surface charge σ(θ) bends E tangentially along the wire axis.',
  },
  hero: {
    key: 'hero',
    title: 'Tagged Hero Electron',
    badge: 'YOUR POV',
    accent: '#fbbf24',
    simple:
      'The single conduction electron you are riding! Its glowing trail reveals chaotic random bounces plus the gentle forward drift.',
    deeper:
      'Follows Drude-Sommerfeld stochastic dynamics: v_total = v_Fermi + v_drift with Poisson scattering P = 1 − e^(−Δt/τ).',
  },
  surface: {
    key: 'surface',
    title: 'Surface Charge Rings (±σ)',
    badge: 'FIELD CREATOR',
    accent: '#ef4444',
    simple:
      'Blue (−) dots near the battery negative terminal and red (+) dots near the positive terminal actually create the electric field inside the wire!',
    deeper:
      'A linear surface-charge gradient dσ/ds along the outer boundary produces the uniform axial E-field inside every straight conductor segment.',
  },
  potential: {
    key: 'potential',
    title: 'Potential Energy Landscape U(x) = −eV(x)',
    badge: 'ENERGY CURTAIN',
    accent: '#00f0ff',
    simple:
      'Think of curtain height as the electron’s altitude! High leaving the battery (−) end, coasting flat on copper, plunging steeply down resistors.',
    deeper:
      'Because electrons carry negative charge (−e), higher electric potential V corresponds to lower electron potential energy U = −eV.',
  },
};

export const UI_STUDY_NOTES: Record<string, { title: string; text: string }> = {
  voltage: {
    title: 'Applied EMF (Battery Push)',
    text: 'Sets how tall the energy hill is inside the battery (0–12 V). Drop to 0 V to watch pure thermal chaos with zero net current.',
  },
  r1: {
    title: 'Load Resistance R₁',
    text: 'Controls how strongly atoms inside R₁ scatter electrons. Lower resistance lets more current flow and heats the resistor hotter!',
  },
  r2: {
    title: 'Divider Resistance R₂',
    text: 'Second series resistor on the right rail. Changes how voltage splits between R₁ and R₂.',
  },
  temp: {
    title: 'Lattice Temperature (10 K – 800 K)',
    text: 'Controls how violently crystal atoms shake. Freezing to 10 K gives smooth near-ballistic flight; 800 K causes fierce scattering.',
  },
  scale: {
    title: 'Pedagogical ↔ True Physical Scale',
    text: 'In real copper, random speed is 10 billion times faster than drift! Slide right to morph from easy-to-follow motion to realistic violent pinballing.',
  },
  time: {
    title: 'Time Dilation (Slow-Mo ↔ Fast-Forward)',
    text: 'Slow down to 0.01× to watch individual atomic bounces, or speed up to 10× to observe RC charging and full circuit laps.',
  },
  'layer-e': {
    title: 'Electric Field Vectors (E)',
    text: 'Purple-magenta arrows pointing from (+) to (−). Electrons always accelerate strictly OPPOSITE to these arrows (F = −eE).',
  },
  'layer-sigma': {
    title: 'Surface Charge Rings (±σ)',
    text: 'Excess charges on the outer wire skin: red (+) and blue (−). Their gradient is what actually creates the E-field inside the wire.',
  },
  'layer-u': {
    title: 'Potential Energy Curtain U(x)',
    text: '3D altitude map of electron potential energy U = −eV. Watch electrons climb inside the battery and roll downhill through resistors.',
  },
  'layer-phonon': {
    title: 'Lattice Vibrations & Phonon Ripples',
    text: 'Shows crystal atoms shaking hotter (amber → glowing red) and emitting expanding thermal ripple rings as electrons lose kinetic energy.',
  },
  'layer-b': {
    title: 'Magnetic Field Lines (B)',
    text: 'Swirling sky-blue rings with curl arrowheads encircling moving current (right-hand rule), plus flux loops and back-EMF arrows inside the inductor.',
  },
  'tel-e': {
    title: 'Local Electric Push (E)',
    text: 'Electric field strength right where your hero electron sits. Tiny (mV/m) in copper wire, huge (tens to hundreds of V/m) inside resistors.',
  },
  'tel-i': {
    title: 'Loop Current (I)',
    text: 'Total conventional charge flow around the closed loop in Amperes (solved exactly by Modified Nodal Analysis every 1/120 s).',
  },
  'tel-vinst': {
    title: 'Instantaneous Speed (v_inst)',
    text: 'How fast the electron is zipping right now (~1.57 million m/s due to quantum Fermi energy—even when battery voltage is 0 V!).',
  },
  'tel-vdrift': {
    title: 'Forward Drift Speed (v_d)',
    text: 'Average forward march along the wire (fractions of a mm/s in real copper!). Speeds up by 1/A inside narrow resistors.',
  },
  'tel-v': {
    title: 'Local Potential (V)',
    text: 'Voltage at the hero electron’s current spot relative to ground (0 V at the battery negative terminal).',
  },
  'tel-u': {
    title: 'Electron Energy (U = −eV)',
    text: 'Potential energy in electron-volts (eV). Highest (0 eV) leaving the battery (−) end; lowest (−eV_src) arriving at the (+) end.',
  },
  'tel-tau': {
    title: 'Mean Free Time (τ)',
    text: 'Average time between atomic collisions (in femtoseconds = 10⁻¹⁵ s). Drops sharply inside hot or high-resistance materials.',
  },
  'tel-coll': {
    title: 'Collision Counter',
    text: 'Live tally of stochastic phonon/impurity bounces experienced by your hero electron.',
  },
  'tel-p': {
    title: 'Heat Power (P = I²R)',
    text: 'Total electrical energy converted into lattice heat per second (Watts) across the entire circuit.',
  },
  'tel-ratio': {
    title: 'Thermal / Drift Scale Ratio',
    text: 'Current ratio of random thermal speed to forward drift speed set by the Scale Compression slider.',
  },
  minimap: {
    title: 'Interactive Eulerian Circuit Map',
    text: 'Top-down schematic colored by potential V(s), plus your colored study pins. Click anywhere on the loop to teleport your electron there!',
  },
  oscilloscope: {
    title: 'Live 3-Channel Oscilloscope',
    text: 'Plots real-time Voltage V(t) in amber, Current I(t) in cyan, and your hero electron’s Potential Energy U(t) in pink as it travels the loop.',
  },
};
