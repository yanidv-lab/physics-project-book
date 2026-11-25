import type { BookActionParams } from './bookCatalog';
import type { TopicId } from '../types/simulation';

export interface AudioTourCue {
  id: string;
  chapterId: string;
  title: string;
  actionLabel: string;
  narration: string;
  /** Optional custom clip URL; defaults to ./audio/tours/<id>.mp3 */
  audioUrl?: string;
  /** Optional minimum caption hold time in ms when speech synthesis is unavailable or muted. */
  minDurationMs?: number;
  apply?: BookActionParams;
}

export interface VolumeAudioTour {
  topicId: TopicId;
  title: string;
  cues: AudioTourCue[];
}

export const VOLUME_AUDIO_TOURS: VolumeAudioTour[] = [
  {
    topicId: 'circuits',
    title: 'Vol. I — Electron POV & Circuits',
    cues: [
      {
        id: 'tour-cir-1',
        chapterId: 'ch1-zero-volt',
        title: 'Copper Wire Drift',
        actionLabel: 'Loading 0 V copper lattice at 300 K',
        narration:
          'Welcome to Volume One. Inside a zero-volt copper wire, free electrons bounce randomly at huge thermal speeds with zero net drift.',
        apply: {
          voltage: 0,
          temperature: 300,
          sourceMode: 'dc',
          heroAnchor: 'wire-before-r1',
          cameraMode: 'locked-drift',
        },
      },
      {
        id: 'tour-cir-2',
        chapterId: 'ch2-bottleneck-heat',
        title: 'Ohmic Heating Bottleneck',
        actionLabel: 'Raising DC drive to 9 V across R1',
        narration:
          'Turning up the battery voltage drives electrons into the resistor lattice. Collisions transfer energy to ions, heating up R1.',
        apply: {
          voltage: 9,
          resistance: 220,
          temperature: 340,
          sourceMode: 'dc',
          heroAnchor: 'inside-r1',
          cameraMode: 'locked-drift',
        },
      },
      {
        id: 'tour-cir-3',
        chapterId: 'ch5-cryo-vs-furnace',
        title: 'Cryo Cold vs Furnace Hot',
        actionLabel: 'Cooling lattice to 60 K cryo',
        narration:
          'Watch what happens when we cool the lattice down to sixty Kelvin. Ion vibrations shrink, so mean free paths open wide.',
        apply: {
          voltage: 9,
          temperature: 60,
          sourceMode: 'dc',
          heroAnchor: 'inside-r1',
          cameraMode: 'locked-drift',
        },
      },
      {
        id: 'tour-cir-4',
        chapterId: 'ch3-battery-escalator',
        title: 'Battery Potential Lift',
        actionLabel: 'Inspecting 12 V battery pump',
        narration:
          'At the battery terminals, chemical work lifts electrons back up to high potential energy without creating or destroying charge.',
        apply: {
          voltage: 12,
          temperature: 300,
          sourceMode: 'dc',
          heroAnchor: 'battery-entry',
          cameraMode: 'side-cutaway',
        },
      },
      {
        id: 'tour-cir-5',
        chapterId: 'ch7-capacitor-wall',
        title: 'Dielectric Capacitor Stop',
        actionLabel: 'Discharging plates & switching camera',
        narration:
          'In an RC loop, electrons pile onto one plate and push charge off the other, shifting the field across the insulating gap.',
        apply: {
          voltage: 8,
          resistance: 180,
          rcDischarging: true,
          heroAnchor: 'before-cap',
          cameraMode: 'macro-overview',
        },
      },
      {
        id: 'tour-cir-6',
        chapterId: 'ch10-ac-wiggle',
        title: 'AC Back-and-Forth Wiggle',
        actionLabel: 'Switching source to 4 Hz AC',
        narration:
          'Finally, switch to alternating current. Rather than traveling laps around the loop, the entire electron sea sloshes back and forth in place.',
        apply: {
          sourceMode: 'ac',
          acFrequency: 4,
          voltage: 8,
          heroAnchor: 'wire-before-r1',
          cameraMode: 'locked-drift',
        },
      },
    ],
  },
  {
    topicId: 'em',
    title: 'Vol. II — Electromagnetism',
    cues: [
      {
        id: 'tour-em-1',
        chapterId: 'em-dipole',
        title: 'Electric Dipole Field Lines',
        actionLabel: 'Launching test charge in dipole E-field',
        narration:
          'Volume Two explores fields in empty space. Field vectors radiate from positive charge and sink into negative charge, steering the probe.',
        apply: { action: 'launchTestCharge' },
      },
      {
        id: 'tour-em-2',
        chapterId: 'em-dipole',
        title: 'Polarity Flip',
        actionLabel: 'Inverting dipole polarity',
        narration:
          'Flipping the dipole polarity reverses every electric field vector instantaneously along the axis, redirecting the test trajectory.',
        apply: { action: 'flipPolarity' },
      },
      {
        id: 'tour-em-3',
        chapterId: 'em-lorentz',
        title: 'Lorentz Cyclotron Orbits',
        actionLabel: 'Setting B = 1.6 T for tight gyration',
        narration:
          'A magnetic field pushes only perpendicular to velocity. Notice the helical cyclotron orbit shrinks tighter as we boost B to one point six Tesla.',
        apply: { bField: 1.6, ez: 0.4 },
      },
      {
        id: 'tour-em-4',
        chapterId: 'em-wave',
        title: 'Circularly Polarized Wave',
        actionLabel: 'Enabling circular polarization at 2 Hz',
        narration:
          'In an electromagnetic wave, perpendicular E and B fields regenerate each other at c. Enabling circular polarization twists the vector tip in a helix.',
        apply: { circular: true, freq: 2.0 },
      },
      {
        id: 'tour-em-5',
        chapterId: 'em-faraday',
        title: 'Faraday Magnetic Induction',
        actionLabel: 'Driving rapid 3.2 Hz flux oscillation',
        narration:
          'Changing magnetic flux through a coil induces an electromotive force, driving current waves strictly while the flux is changing.',
        apply: { freq: 3.2 },
      },
      {
        id: 'tour-em-6',
        chapterId: 'em-hall',
        title: 'Hall Effect Carrier Sign',
        actionLabel: 'Switching carriers to +1 holes & replaying',
        narration:
          'By deflecting moving charges sideways in a crossed magnetic field, the Hall voltage flips sign between electrons and positive holes.',
        apply: { carrierSign: 1, action: 'replayHall' },
      },
    ],
  },
  {
    topicId: 'gravity',
    title: 'Vol. III — Orbital & Relativistic Gravity',
    cues: [
      {
        id: 'tour-grav-1',
        chapterId: 'grav-well',
        title: 'Rubber-Sheet Potential Well',
        actionLabel: 'Launching circular orbit around central mass',
        narration:
          'In Volume Three, gravity bends spacetime into an inverse-r funnel. At exact circular speed, outward inertia balances the inward slope.',
        apply: { action: 'launchCircular' },
      },
      {
        id: 'tour-grav-2',
        chapterId: 'grav-well',
        title: 'Escape Velocity',
        actionLabel: 'Boosting probe onto escape trajectory',
        narration:
          'Kick the probe past root-two times circular speed and its total mechanical energy turns positive, climbing freely out of the well.',
        apply: { action: 'launchEscape' },
      },
      {
        id: 'tour-grav-3',
        chapterId: 'grav-kepler',
        title: 'Keplerian Sweep',
        actionLabel: 'Setting eccentricity e = 0.65',
        narration:
          'With eccentricity at zero point six five, angular momentum conservation forces the planet to whip faster near periapsis to sweep equal areas.',
        apply: { eccentricity: 0.65 },
      },
      {
        id: 'tour-grav-4',
        chapterId: 'grav-binary',
        title: 'Binary Barycenter & Slingshot',
        actionLabel: 'Firing gravity-assist slingshot probe',
        narration:
          'Two heavy stars orbit their shared center of mass. A spacecraft diving behind the moving secondary star steals orbital momentum.',
        apply: { massRatio: 0.35, action: 'launchSlingshot' },
      },
      {
        id: 'tour-grav-5',
        chapterId: 'grav-blackhole',
        title: 'Relativistic Precession',
        actionLabel: 'Raising central black hole mass to 2.2',
        narration:
          'Near a compact black hole, spacetime curvature strengthens past pure inverse-square gravity, causing elliptical orbits to precess in a rosette.',
        apply: { centralMass: 2.2 },
      },
      {
        id: 'tour-grav-6',
        chapterId: 'grav-lagrange',
        title: 'Lagrange Equilibrium L4',
        actionLabel: 'Deploying Trojan probe at L4',
        narration:
          'In the rotating two-body frame, gravity and centrifugal forces balance at five Lagrange points—let us park at stable Trojan point L4.',
        apply: { preset: 'L4' },
      },
    ],
  },
  {
    topicId: 'waves',
    title: 'Vol. IV — Waves & Quantum Physics',
    cues: [
      {
        id: 'tour-wav-1',
        chapterId: 'wave-interference',
        title: 'Two-Slit Interference',
        actionLabel: 'Activating twin coherent point sources',
        narration:
          'Volume Four enters waves and quantum mechanics. Two coherent sources create bright nodal highways where crests reinforce and quiet valleys where they cancel.',
        apply: { singleSource: false },
      },
      {
        id: 'tour-wav-2',
        chapterId: 'wave-standing',
        title: 'Quantized Standing Harmonic',
        actionLabel: 'Selecting 4th standing wave harmonic',
        narration:
          'Clamping both ends of a string restricts waves to integer half-wavelengths. Stepping to harmonic four carves three interior zero-motion nodes.',
        apply: { harmonic: 4 },
      },
      {
        id: 'tour-wav-3',
        chapterId: 'wave-tunneling',
        title: 'Quantum Tunneling Barrier',
        actionLabel: 'Lowering barrier & relaunching wavepacket',
        narration:
          'Instead of bouncing completely like a classical marble, a quantum wavepacket leaks exponentially through a finite barrier and emerges transmitted.',
        apply: { barrierHeight: 0.7, action: 'relaunchPacket' },
      },
      {
        id: 'tour-wav-4',
        chapterId: 'wave-vectorfield',
        title: 'Vector Calculus Curl',
        actionLabel: 'Switching vector topology to rotational Curl',
        narration:
          'Visualizing vector calculus: gradient points uphill, divergence measures outward sources, and curl reveals microscopic rotation around every vortex.',
        apply: { fieldMode: 'curl' },
      },
      {
        id: 'tour-wav-5',
        chapterId: 'wave-harmonic',
        title: 'Coherent Oscillator Wavepacket',
        actionLabel: 'Offsetting coherent state inside parabola',
        narration:
          'Finally, displace the harmonic oscillator ground packet. Unlike stationary eigenstates, this coherent superposition swings cleanly without spreading.',
        apply: { qhoMode: 'coherent', qhoOffset: 1.6 },
      },
    ],
  },
  {
    topicId: 'thermo',
    title: 'Vol. V — Thermodynamics & Statistical Mechanics',
    cues: [
      {
        id: 'tour-thm-1',
        chapterId: 'thermo-gas',
        title: 'Kinetic Theory Pressure',
        actionLabel: 'Compressing volume & heating gas to 650 K',
        narration:
          'Volume Five bridges microscopic collisions to macroscopic heat. Compressing volume while heating to six hundred fifty Kelvin spikes wall impact pressure.',
        apply: { temp: 650, vol: 0.6 },
      },
      {
        id: 'tour-thm-2',
        chapterId: 'thermo-carnot',
        title: 'Carnot Engine Cycle',
        actionLabel: 'Widening T_hot = 800 K vs T_cold = 200 K',
        narration:
          'A Carnot engine extracts mechanical work from heat flowing between reservoirs. Widening eight hundred against two hundred Kelvin pushes ideal efficiency toward seventy-five percent.',
        apply: { tHot: 800, tCold: 200 },
      },
      {
        id: 'tour-thm-3',
        chapterId: 'thermo-brownian',
        title: 'Hot Brownian Diffusion',
        actionLabel: 'Boosting solvent agitation to 700 K',
        narration:
          'A heavy pollen grain jitters endlessly under asymmetric impacts from invisible fluid molecules—crank the temperature and its random walk spreads rapidly.',
        apply: { temp: 700 },
      },
      {
        id: 'tour-thm-4',
        chapterId: 'thermo-entropy',
        title: 'Irreversible Entropy Arrow',
        actionLabel: 'Resetting ordered partition then removing divider',
        narration:
          'Start with two gases separated, then pull the divider. Even though every molecular collision is time-reversible, overwhelming probability drives irreversible mixing.',
        apply: { action: 'removeDivider' },
      },
    ],
  },
  {
    topicId: 'optics',
    title: 'Vol. VI — Optics & Photonics',
    cues: [
      {
        id: 'tour-opt-1',
        chapterId: 'opt-snell',
        title: 'Refraction & Critical Angle',
        actionLabel: 'Tilting glass-to-air beam past 48 deg TIR',
        narration:
          'Volume Six tracks light rays and polarization. Sending a ray from high-index glass into air past the critical angle triggers total internal reflection.',
        apply: { n1: 1.6, n2: 1.0, thetaIncDeg: 48 },
      },
      {
        id: 'tour-opt-2',
        chapterId: 'opt-prism',
        title: 'Chromatic Prism Dispersion',
        actionLabel: 'Rotating prism incidence to 46 deg',
        narration:
          'Because glass slows blue wavelengths slightly more than red ones, Snell refraction fans white light smoothly into a rainbow spectrum.',
        apply: { prismIncDeg: 46 },
      },
      {
        id: 'tour-opt-3',
        chapterId: 'opt-lens',
        title: 'Thin-Lens Image Inversion',
        actionLabel: 'Placing object outside focal length',
        narration:
          'Trace three principal rays through a converging lens: placed outside focal length f, they cross to form an inverted real image.',
        apply: { focalLength: 1.8, objectDist: 3.4 },
      },
      {
        id: 'tour-opt-4',
        chapterId: 'opt-polar',
        title: 'Crossed Polarizers Revival',
        actionLabel: 'Inserting 45 deg middle polarizer',
        narration:
          'Crossed zero- and ninety-degree polarizers block all light. Slide a forty-five-degree polarizer in between, and quantum projection lets light pass again!',
        apply: { pol3Deg: 90, useMiddlePol: true, pol2Deg: 45 },
      },
    ],
  },
  {
    topicId: 'mechanics',
    title: 'Vol. VII — Classical & Rotational Mechanics',
    cues: [
      {
        id: 'tour-mch-1',
        chapterId: 'mech-chaos',
        title: 'Double Pendulum Chaos',
        actionLabel: 'Relaunching nearly identical twin pendulums',
        narration:
          'Volume Seven explores nonlinear and rotating dynamics. Two double pendulums start a hair apart, yet trace completely divergent paths within seconds.',
        apply: { action: 'relaunchChaos' },
      },
      {
        id: 'tour-mch-2',
        chapterId: 'mech-coupled',
        title: 'Coupled Beat Resonance',
        actionLabel: 'Setting weak-spring beat mode',
        narration:
          'Strike just one oscillator in a coupled pair and energy sloshes rhythmically back and forth between left and right pendulums in clean beat cycles.',
        apply: { coupleMode: 'beat' },
      },
      {
        id: 'tour-mch-3',
        chapterId: 'mech-gyro',
        title: 'Gyroscopic Precession',
        actionLabel: 'Spinning rotor up to 16 rad/s',
        narration:
          'Gravity pulls the axle down, trying to topple the wheel, yet the cross-product torque swings the rapid spin vector sideways into steady horizontal precession.',
        apply: { gyroSpin: 16 },
      },
      {
        id: 'tour-mch-4',
        chapterId: 'mech-coriolis',
        title: 'Rotating Coriolis Frame',
        actionLabel: 'Viewing curved puck in rotating frame',
        narration:
          'A frictionless puck flies straight in inertial space—yet from the spinning turntable camera, fictitious Coriolis acceleration curves its path dramatically.',
        apply: { frame: 'rotating', action: 'relaunchPuck' },
      },
    ],
  },
  {
    topicId: 'fluids',
    title: 'Vol. VIII — Fluid Dynamics',
    cues: [
      {
        id: 'tour-fld-1',
        chapterId: 'fluid-venturi',
        title: 'Venturi Continuity & Bernoulli',
        actionLabel: 'Narrowing throat ratio to 0.35',
        narration:
          'Volume Eight visualizes incompressible flow. Squeezing the pipe throat forces streamlines closer together, trading static pressure for higher kinetic speed.',
        apply: { throatRatio: 0.35 },
      },
      {
        id: 'tour-fld-2',
        chapterId: 'fluid-airfoil',
        title: 'Kutta Circulation Lift',
        actionLabel: 'Increasing airfoil bound circulation to 2.2',
        narration:
          'Adding bound circulation around the airfoil accelerates upper-surface streamlines and lowers pressure above the wing, generating upward aerodynamic lift.',
        apply: { circulation: 2.2 },
      },
      {
        id: 'tour-fld-3',
        chapterId: 'fluid-vortex',
        title: 'Kelvin Vortex Pair',
        actionLabel: 'Boosting twin vortex circulation',
        narration:
          'Each vortex induces velocity on its neighbor. Watch how opposite-signed vortices propel forward as a pair, sweeping glowing tracer rings along.',
        apply: { circulation: 2.6 },
      },
      {
        id: 'tour-fld-4',
        chapterId: 'fluid-wave',
        title: 'Soliton Wave Collision',
        actionLabel: 'Colliding unequal KdV solitons',
        narration:
          'Tall shallow-water solitons travel faster than short ones, yet pass straight through each other without scrambling their shapes.',
        apply: { amp1: 1.5, action: 'relaunchSoliton' },
      },
    ],
  },
  {
    topicId: 'relativity',
    title: 'Vol. IX — Relativity & Nuclear Physics',
    cues: [
      {
        id: 'tour-rel-1',
        chapterId: 'rel-dilation',
        title: 'Relativistic Light Clock',
        actionLabel: 'Accelerating rocket to 0.85c (gamma = 1.90)',
        narration:
          'Volume Nine steps into high-speed spacetime and nuclei. At eighty-five percent light speed, the bouncing photon traces a longer diagonal, slowing ship time.',
        apply: { beta: 0.85 },
      },
      {
        id: 'tour-rel-2',
        chapterId: 'rel-lorentz',
        title: 'Minkowski Light Cone Tilt',
        actionLabel: 'Boosting spacetime axes to beta = 0.70',
        narration:
          'As a moving frame accelerates to zero point seven c, its space and time axes scissor symmetrically toward the invariant forty-five-degree light cone.',
        apply: { beta: 0.7 },
      },
      {
        id: 'tour-rel-3',
        chapterId: 'rel-decay',
        title: 'Stochastic Half-Life Decay',
        actionLabel: 'Resetting 400 nuclei with 4 s half-life',
        narration:
          'Each unstable nucleus decays randomly in time, yet across four hundred atoms the surviving count follows an exact exponential half-life curve.',
        apply: { halfLife: 4, action: 'resetDecay' },
      },
      {
        id: 'tour-rel-4',
        chapterId: 'rel-fission',
        title: 'Controlled Nuclear Chain Reaction',
        actionLabel: 'Withdrawing control rods to 15% & triggering neutron',
        narration:
          'Finally, pull the absorbing boron rods down to fifteen percent and fire a slow neutron. Secondary neutrons cascade cleanly into a self-sustaining chain reaction.',
        apply: { rodInsertion: 0.15, action: 'triggerFission' },
      },
    ],
  },
];

export function getAudioTourForVolume(topicId: TopicId): VolumeAudioTour {
  return VOLUME_AUDIO_TOURS.find((t) => t.topicId === topicId) ?? VOLUME_AUDIO_TOURS[0];
}
