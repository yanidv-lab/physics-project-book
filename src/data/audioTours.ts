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
          'Welcome to Volume One. Inside a zero-volt copper wire, free electrons bounce randomly at huge thermal speeds with zero net drift. Even without a battery connected, every conduction electron is zipping around at roughly one hundred kilometers per second due to room-temperature heat. Because those collisions scatter electrons equally in every direction, the average net drift cancels to zero—so no electric current flows yet.',
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
          'Turning up the battery voltage drives electrons into the resistor lattice. Collisions transfer energy to ions, heating up R1. Notice how the steady electric field nudges the entire electron swarm slowly forward while each violent bounce against a vibrating copper ion dumps kinetic energy into the metal. That microscopic friction is Joule heating, P equals I squared R, which makes toaster coils and light filaments glow.',
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
          'Watch what happens when we cool the lattice down to sixty Kelvin. Ion vibrations shrink, so mean free paths open wide. At cryogenic temperatures, the atomic lattice barely jiggles, so conduction electrons glide much farther between collisions. Resistance drops dramatically, drift velocity surges, and far less electrical energy is wasted as heat—the same physics that powers MRI magnets and deep-space sensors.',
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
          'At the battery terminals, chemical work lifts electrons back up to high potential energy without creating or destroying charge. Think of the battery like a ski lift for electrons: chemical reactions inside the cell do work to raise charge carriers against the internal electric field. Every electron leaving the negative terminal carries fresh potential energy ready to be spent around the external circuit.',
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
          'In an RC loop, electrons pile onto one plate and push charge off the other, shifting the field across the insulating gap. Notice that no electron ever crosses the insulating dielectric gap between the two metal plates. Instead, charge accumulating on one plate repels like charges off the opposite plate, storing energy in the electric field between them and letting displacement current bridge the gap.',
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
          'Finally, switch to alternating current. Rather than traveling laps around the loop, the entire electron sea sloshes back and forth in place. In your home wall outlets, this reversal happens fifty or sixty times every second. Even though individual electrons barely move a fraction of a millimeter, the electromagnetic wave pushes the entire loop in unison, delivering continuous power to every appliance.',
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
          'Volume Two explores fields in empty space. Field vectors radiate from positive charge and sink into negative charge, steering the probe. Every field line starts on the positive source charge and curves smoothly into the negative sink charge. Where the arrows pack tightly together, the electric force is strongest; drop a test charge anywhere in this space and it immediately accelerates tangent to those invisible curves.',
        apply: { action: 'launchTestCharge' },
      },
      {
        id: 'tour-em-2',
        chapterId: 'em-dipole',
        title: 'Polarity Flip',
        actionLabel: 'Inverting dipole polarity',
        narration:
          'Flipping the dipole polarity reverses every electric field vector instantaneously along the axis, redirecting the test trajectory. Because the magnetic Lorentz force is always perpendicular to velocity, a pure magnetic field can never speed a particle up or slow it down—it can only bend its trajectory into a circle. Combine that circular orbit with steady forward drift along the field lines, and you get a crisp cyclotron helix.',
        apply: { action: 'flipPolarity' },
      },
      {
        id: 'tour-em-3',
        chapterId: 'em-lorentz',
        title: 'Lorentz Cyclotron Orbits',
        actionLabel: 'Setting B = 1.6 T for tight gyration',
        narration:
          'A magnetic field pushes only perpendicular to velocity. Notice the helical cyclotron orbit shrinks tighter as we boost B to one point six Tesla. Notice how the oscillating electric wave and the magnetic wave stay perfectly locked in phase, perpendicular to each other and to the direction of travel. Changing electric fields regenerate magnetic fields and vice versa, allowing light to race across empty space at three hundred thousand kilometers per second.',
        apply: { bField: 1.6, ez: 0.4 },
      },
      {
        id: 'tour-em-4',
        chapterId: 'em-wave',
        title: 'Circularly Polarized Wave',
        actionLabel: 'Enabling circular polarization at 2 Hz',
        narration:
          'In an electromagnetic wave, perpendicular E and B fields regenerate each other at c. Enabling circular polarization twists the vector tip in a helix. Watch the Edison indicator lamp above the copper coil: it shines brightest right when the bar magnet moves fastest through the mouth of the coil, and goes completely dark the moment the magnet pauses. Faraday discovered that only changing magnetic flux—never a static magnet—generates electrical voltage.',
        apply: { circular: true, freq: 2.0 },
      },
      {
        id: 'tour-em-5',
        chapterId: 'em-faraday',
        title: 'Faraday Magnetic Induction',
        actionLabel: 'Driving rapid 3.2 Hz flux oscillation',
        narration:
          'Changing magnetic flux through a coil induces an electromotive force, driving current waves strictly while the flux is changing. As the magnetic field deflects moving charge carriers sideways toward one edge of the conducting strip, charge piles up until the sideways electric force balances the magnetic push. That measurable Hall voltage lets engineers detect magnetic fields, wheel speeds, and even determine whether carriers are positive or negative.',
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
          'In Volume Three, gravity bends spacetime into an inverse-r funnel. At exact circular speed, outward inertia balances the inward slope. Einstein showed that gravity is not a mysterious invisible rope pulling across space, but the curvature of spacetime itself. The heavier the central star, the deeper the funnel it carves, forcing passing marbles, moons, and even beams of starlight to follow curved geodesics.',
        apply: { action: 'launchCircular' },
      },
      {
        id: 'tour-grav-2',
        chapterId: 'grav-well',
        title: 'Escape Velocity',
        actionLabel: 'Boosting probe onto escape trajectory',
        narration:
          'Kick the probe past root-two times circular speed and its total mechanical energy turns positive, climbing freely out of the well. Watch the orbiting probe whip rapidly around closest approach at perihelion, then coast slowly out at aphelion. Because gravity pulls strictly toward the center of mass, angular momentum stays conserved—meaning the line from star to planet sweeps out equal areas in equal times.',
        apply: { action: 'launchEscape' },
      },
      {
        id: 'tour-grav-3',
        chapterId: 'grav-kepler',
        title: 'Keplerian Sweep',
        actionLabel: 'Setting eccentricity e = 0.65',
        narration:
          'With eccentricity at zero point six five, angular momentum conservation forces the planet to whip faster near periapsis to sweep equal areas. In reality, a planet never orbits a stationary star; both bodies dance around their shared center of mass, called the barycenter. When two stars have comparable masses, they swirl in interlocking ellipses and radiate tiny ripples in spacetime known as gravitational waves.',
        apply: { eccentricity: 0.65 },
      },
      {
        id: 'tour-grav-4',
        chapterId: 'grav-binary',
        title: 'Binary Barycenter & Slingshot',
        actionLabel: 'Firing gravity-assist slingshot probe',
        narration:
          'Two heavy stars orbit their shared center of mass. A spacecraft diving behind the moving secondary star steals orbital momentum. Inside the photon sphere, gravity bends light so severely that rays can loop right around the black hole before escaping, creating that bright glowing photon ring. Anything that crosses the dark event horizon inside can never accelerate fast enough to climb back out.',
        apply: { massRatio: 0.35, action: 'launchSlingshot' },
      },
      {
        id: 'tour-grav-5',
        chapterId: 'grav-blackhole',
        title: 'Relativistic Precession',
        actionLabel: 'Raising central black hole mass to 2.2',
        narration:
          'Near a compact black hole, spacetime curvature strengthens past pure inverse-square gravity, causing elliptical orbits to precess in a rosette. At these five Lagrange points, the gravitational pull of the star and planet combines with the outward centrifugal effect of the rotating frame to balance out completely. Real observatories like the James Webb Space Telescope park near L2, while thousands of Trojan asteroids gather naturally inside the stable L4 and L5 basins.',
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
          'Volume Four enters waves and quantum mechanics. Two coherent sources create bright nodal highways where crests reinforce and quiet valleys where they cancel. Where crests from both slits arrive in step, they add together into tall bright ridges of constructive interference. Half a wavelength to the side, a crest meets a trough and cancels completely into quiet nodal lines—the unmistakable fingerprint of wave behavior.',
        apply: { singleSource: false },
      },
      {
        id: 'tour-wav-2',
        chapterId: 'wave-standing',
        title: 'Quantized Standing Harmonic',
        actionLabel: 'Selecting 4th standing wave harmonic',
        narration:
          'Clamping both ends of a string restricts waves to integer half-wavelengths. Stepping to harmonic four carves three interior zero-motion nodes. Because the two clamped ends cannot move, only whole numbers of half-wavelengths fit cleanly between the walls. Every guitar string, flute column, and even electron orbital inside an atom obeys this exact same standing-wave quantization rule.',
        apply: { harmonic: 4 },
      },
      {
        id: 'tour-wav-3',
        chapterId: 'wave-tunneling',
        title: 'Quantum Tunneling Barrier',
        actionLabel: 'Lowering barrier & relaunching wavepacket',
        narration:
          'Instead of bouncing completely like a classical marble, a quantum wavepacket leaks exponentially through a finite barrier and emerges transmitted. Classically, a ball with less energy than the hill height must always bounce back one hundred percent of the time. In quantum mechanics, the probability wave decays exponentially inside the barrier rather than dropping straight to zero, letting a real fraction tunnel right through—powering nuclear fusion in the Sun and modern flash memory.',
        apply: { barrierHeight: 0.7, action: 'relaunchPacket' },
      },
      {
        id: 'tour-wav-4',
        chapterId: 'wave-vectorfield',
        title: 'Vector Calculus Curl',
        actionLabel: 'Switching vector topology to rotational Curl',
        narration:
          'Visualizing vector calculus: gradient points uphill, divergence measures outward sources, and curl reveals microscopic rotation around every vortex. Divergence measures how strongly arrows erupt outward from a source or drain into a sink, while curl measures how much the field swirls around a tiny paddlewheel. Together, these two local geometric operators write all four of Maxwell equations and the laws of fluid dynamics.',
        apply: { fieldMode: 'curl' },
      },
      {
        id: 'tour-wav-5',
        chapterId: 'wave-harmonic',
        title: 'Coherent Oscillator Wavepacket',
        actionLabel: 'Offsetting coherent state inside parabola',
        narration:
          'Finally, displace the harmonic oscillator ground packet. Unlike stationary eigenstates, this coherent superposition swings cleanly without spreading. Notice that even in the lowest possible ground state, the quantum wave packet never sits completely still at the bottom of the bowl—zero-point energy keeps it vibrating forever. Look past the pink classical turning pillars to see probability tails leaking into classically forbidden space.',
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
          'Volume Five bridges microscopic collisions to macroscopic heat. Compressing volume while heating to six hundred fifty Kelvin spikes wall impact pressure. Temperature is simply a macroscopic thermometer for the average kinetic energy of microscopic molecules slamming into the walls. Compressing the piston squeezes the same atoms into a smaller box, making collisions against the walls far more frequent and driving pressure straight up.',
        apply: { temp: 650, vol: 0.6 },
      },
      {
        id: 'tour-thm-2',
        chapterId: 'thermo-carnot',
        title: 'Carnot Engine Cycle',
        actionLabel: 'Widening T_hot = 800 K vs T_cold = 200 K',
        narration:
          'A Carnot engine extracts mechanical work from heat flowing between reservoirs. Widening eight hundred against two hundred Kelvin pushes ideal efficiency toward seventy-five percent. Every heat engine absorbs energy from a hot reservoir, converts a fraction into useful piston work, and must reject the rest to a cold reservoir. Carnot proved that no engine in the universe—no matter how cleverly built—can ever beat the efficiency limit set purely by the ratio of those two temperatures.',
        apply: { tHot: 800, tCold: 200 },
      },
      {
        id: 'tour-thm-3',
        chapterId: 'thermo-brownian',
        title: 'Hot Brownian Diffusion',
        actionLabel: 'Boosting solvent agitation to 700 K',
        narration:
          'A heavy pollen grain jitters endlessly under asymmetric impacts from invisible fluid molecules—crank the temperature and its random walk spreads rapidly. Even though the surrounding water molecules are completely invisible to the naked eye, millions of uneven random impacts every second jostle this heavy pollen grain along a jagged drunkard walk. Albert Einstein used this exact motion in nineteen oh five to prove that atoms are physically real.',
        apply: { temp: 700 },
      },
      {
        id: 'tour-thm-4',
        chapterId: 'thermo-entropy',
        title: 'Irreversible Entropy Arrow',
        actionLabel: 'Resetting ordered partition then removing divider',
        narration:
          'Start with two gases separated, then pull the divider. Even though every molecular collision is time-reversible, overwhelming probability drives irreversible mixing. Before we lift the divider, hot fast atoms stay neatly separated from cold slow ones in a rare, low-entropy arrangement. The instant the wall vanishes, random motion mixes them irreversibly because there are overwhelmingly more mixed microstates than separated ones—giving time its one-way thermodynamic arrow.',
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
          'Volume Six tracks light rays and polarization. Sending a ray from high-index glass into air past the critical angle triggers total internal reflection. Light slows down inside dense materials like glass or water, forcing the wavefront to pivot sharply at the boundary according to Snell law. Tilt the incoming laser past the critical angle inside the denser medium and zero light escapes—every photon reflects cleanly, which is how fiber-optic cables carry the internet across oceans.',
        apply: { n1: 1.6, n2: 1.0, thetaIncDeg: 48 },
      },
      {
        id: 'tour-opt-2',
        chapterId: 'opt-prism',
        title: 'Chromatic Prism Dispersion',
        actionLabel: 'Rotating prism incidence to 46 deg',
        narration:
          'Because glass slows blue wavelengths slightly more than red ones, Snell refraction fans white light smoothly into a rainbow spectrum. Because glass slows short-wavelength violet light slightly more than long-wavelength red light, each color bends through a slightly different angle twice—once entering the prism and once leaving. That subtle spread in refractive index fans a single white beam out into a continuous rainbow spectrum.',
        apply: { prismIncDeg: 46 },
      },
      {
        id: 'tour-opt-3',
        chapterId: 'opt-lens',
        title: 'Thin-Lens Image Inversion',
        actionLabel: 'Placing object outside focal length',
        narration:
          'Trace three principal rays through a converging lens: placed outside focal length f, they cross to form an inverted real image. Watch the three principal rays: the ray arriving parallel bends through the far focal point, while the center ray shoots straight through undeflected. Moving the object outside the focal point forms a real inverted image like a camera, while sliding inside turns the lens into an upright magnifying glass.',
        apply: { focalLength: 1.8, objectDist: 3.4 },
      },
      {
        id: 'tour-opt-4',
        chapterId: 'opt-polar',
        title: 'Crossed Polarizers Revival',
        actionLabel: 'Inserting 45 deg middle polarizer',
        narration:
          'Crossed zero- and ninety-degree polarizers block all light. Slide a forty-five-degree polarizer in between, and quantum projection lets light pass again! Two crossed polarizers at zero and ninety degrees block one hundred percent of incoming light. Remarkably, slipping a third polarizer at forty-five degrees in between projects the electric field onto a new diagonal axis, allowing a quarter of the light to pass right through the final filter.',
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
          'Volume Seven explores nonlinear and rotating dynamics. Two double pendulums start a hair apart, yet trace completely divergent paths within seconds. Both double pendulums start almost on top of each other—separated by just a tiny fraction of a degree—and obey the exact same deterministic equations with zero randomness. Yet within seconds their paths diverge wildly, demonstrating why long-range weather forecasting has a fundamental horizon.',
        apply: { action: 'relaunchChaos' },
      },
      {
        id: 'tour-mch-2',
        chapterId: 'mech-coupled',
        title: 'Coupled Beat Resonance',
        actionLabel: 'Setting weak-spring beat mode',
        narration:
          'Strike just one oscillator in a coupled pair and energy sloshes rhythmically back and forth between left and right pendulums in clean beat cycles. Instead of bouncing chaotically, any motion of these coupled masses is a clean blend of two pure normal modes: moving together in unison or swinging in opposite directions. When you excite one block alone, those two frequencies drift in and out of phase, passing all the energy back and forth like a slow rhythmic beat.',
        apply: { coupleMode: 'beat' },
      },
      {
        id: 'tour-mch-3',
        chapterId: 'mech-gyro',
        title: 'Gyroscopic Precession',
        actionLabel: 'Spinning rotor up to 16 rad/s',
        narration:
          'Gravity pulls the axle down, trying to topple the wheel, yet the cross-product torque swings the rapid spin vector sideways into steady horizontal precession. Intuition says the spinning flywheel should simply tip over and crash downward under gravity. Instead, gravity applies a sideways torque that continuously twists the giant angular momentum vector horizontally, holding the axle aloft in smooth, graceful precession—and the faster it spins, the slower it precesses.',
        apply: { gyroSpin: 16 },
      },
      {
        id: 'tour-mch-4',
        chapterId: 'mech-coriolis',
        title: 'Rotating Coriolis Frame',
        actionLabel: 'Viewing curved puck in rotating frame',
        narration:
          'A frictionless puck flies straight in inertial space—yet from the spinning turntable camera, fictitious Coriolis acceleration curves its path dramatically. From an inertial viewpoint hovering above, the gliding puck travels in a completely straight line at constant speed. Switch into the rotating turntable frame and that same straight path appears to curve dramatically sideways—the exact Coriolis deflection that spins hurricanes and ocean gyres on Earth.',
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
          'Volume Eight visualizes incompressible flow. Squeezing the pipe throat forces streamlines closer together, trading static pressure for higher kinetic speed. Because the same volume of incompressible fluid must squeeze through the narrow throat every second, the flow has to speed up sharply. Bernoulli principle tells us that gaining kinetic energy costs internal static pressure, which is why the middle manometer column dips noticeably lower than the wide inlet and outlet.',
        apply: { throatRatio: 0.35 },
      },
      {
        id: 'tour-fld-2',
        chapterId: 'fluid-airfoil',
        title: 'Kutta Circulation Lift',
        actionLabel: 'Increasing airfoil bound circulation to 2.2',
        narration:
          'Adding bound circulation around the airfoil accelerates upper-surface streamlines and lowers pressure above the wing, generating upward aerodynamic lift. Spinning the cylinder drags a thin boundary layer of air along with it, accelerating flow over the top surface while slowing air underneath. That pressure imbalance pushes the cylinder sharply upward—the exact Magnus lift that curves a spinning soccer free kick and underlies airplane wing circulation.',
        apply: { circulation: 2.2 },
      },
      {
        id: 'tour-fld-3',
        chapterId: 'fluid-vortex',
        title: 'Kelvin Vortex Pair',
        actionLabel: 'Boosting twin vortex circulation',
        narration:
          'Each vortex induces velocity on its neighbor. Watch how opposite-signed vortices propel forward as a pair, sweeping glowing tracer rings along. At higher flow speeds, fluid can no longer hug the back of the cylinder smoothly and peels off into alternating clockwise and counterclockwise whirlpools. Those rhythmic Kármán vortices push the obstacle side to side, a resonance engineers must carefully damp on suspension bridges and smokestacks.',
        apply: { circulation: 2.6 },
      },
      {
        id: 'tour-fld-4',
        chapterId: 'fluid-wave',
        title: 'Soliton Wave Collision',
        actionLabel: 'Colliding unequal KdV solitons',
        narration:
          'Tall shallow-water solitons travel faster than short ones, yet pass straight through each other without scrambling their shapes. Ordinary water ripples spread out and fade away because different wavelengths travel at different speeds. In a soliton, nonlinear steepening balances dispersion so perfectly that a solitary hump holds its shape indefinitely—and even survives head-on collisions intact.',
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
          'Volume Nine steps into high-speed spacetime and nuclei. At eighty-five percent light speed, the bouncing photon traces a longer diagonal, slowing ship time. Because every observer measures the exact same speed of light, a photon bouncing between mirrors on a fast-moving ship must cover a longer diagonal distance than one at rest. Longer distance at the same light speed means each tick takes longer—so moving clocks genuinely run slower, a real effect GPS satellites must correct every single day.',
        apply: { beta: 0.85 },
      },
      {
        id: 'tour-rel-2',
        chapterId: 'rel-lorentz',
        title: 'Minkowski Light Cone Tilt',
        actionLabel: 'Boosting spacetime axes to beta = 0.70',
        narration:
          'As a moving frame accelerates to zero point seven c, its space and time axes scissor symmetrically toward the invariant forty-five-degree light cone. Notice that no matter how close to light speed you boost the spacecraft, the forty-five-degree golden light cone stays completely unchanged. Meanwhile, events that look simultaneous in one frame tilt out of sync in another, and the moving ship itself Lorentz-contracts along its direction of flight.',
        apply: { beta: 0.7 },
      },
      {
        id: 'tour-rel-3',
        chapterId: 'rel-decay',
        title: 'Stochastic Half-Life Decay',
        actionLabel: 'Resetting 400 nuclei with 4 s half-life',
        narration:
          'Each unstable nucleus decays randomly in time, yet across four hundred atoms the surviving count follows an exact exponential half-life curve. Quantum tunneling inside each unstable nucleus means it is fundamentally impossible to predict which specific atom will decay next. Yet across hundreds of identical nuclei, the statistical half-life is so rock-solid that geologists can date ancient rocks and fossils across billions of years.',
        apply: { halfLife: 4, action: 'resetDecay' },
      },
      {
        id: 'tour-rel-4',
        chapterId: 'rel-fission',
        title: 'Controlled Nuclear Chain Reaction',
        actionLabel: 'Withdrawing control rods to 15% & triggering neutron',
        narration:
          'Finally, pull the absorbing boron rods down to fifteen percent and fire a slow neutron. Secondary neutrons cascade cleanly into a self-sustaining chain reaction. Each Uranium-235 split releases fresh fast neutrons that can trigger neighboring nuclei. In a nuclear power reactor, boron control rods absorb just enough extra neutrons to hold the multiplication factor right at one point zero—producing steady, controlled thermal power without running away.',
        apply: { rodInsertion: 0.15, action: 'triggerFission' },
      },
    ],
  },
  {
    topicId: 'nuclear',
    title: 'Vol. X — Atomic Fission & Energy',
    cues: [
      {
        id: 'tour-nuc-1',
        chapterId: 'nuc-liquiddrop',
        title: 'Liquid-Drop Nuclear Fission',
        actionLabel: 'Firing slow thermal neutron into U-235',
        narration:
          'Welcome to Volume Ten, where we unpack the physics of nuclear fission and how an atomic reaction unfolds from a single atom to a macroscopic shockwave. Watch the slow, uncharged neutron glide straight into the Uranium-235 nucleus with no electric repulsion to stop it. Absorbing that extra neutron excites the nucleus into wobbling like a stretched water droplet until electric repulsion between its ninety-two protons snaps the thin neck apart—flinging Barium, Krypton, and three fresh neutrons outward with two hundred million electron-volts of energy.',
        apply: { fireNeutron: true, dropSpeed: 0.22 },
      },
      {
        id: 'tour-nuc-2',
        chapterId: 'nuc-critical',
        title: 'Critical Mass & Chain Reaction',
        actionLabel: 'Crossing critical mass (72 kg + neutron reflector)',
        narration:
          'Splitting one atom is tiny, so how does an atomic reaction release colossal energy in microseconds? In a small lump of Uranium-235, most of those three newborn neutrons leak right out through the surface before striking another nucleus, so the reaction fizzles out. Once you assemble more than a critical mass—and surround it with a dense neutron reflector that bounces stray neutrons back inside—the multiplication factor k climbs above one, doubling the number of fissions every few nanoseconds in an unstoppable exponential cascade.',
        apply: { coreMassKg: 72, reflectorEff: 0.65 },
      },
      {
        id: 'tour-nuc-3',
        chapterId: 'nuc-implosion',
        title: 'Density Compression (M_c ∝ 1/ρ²)',
        actionLabel: 'Compressing core uniformly to 2.3× normal density',
        narration:
          'There is an even faster physical way to jump from safely subcritical to deeply supercritical: compress the metal core uniformly from every direction. Squeezing a sphere to double its normal density packs the atomic nuclei much closer together along every neutron path, cutting the required critical mass by a factor of four because critical mass scales inversely with density squared. Watch the core shift from cool subcritical blue to blazing supercritical orange the instant density crosses the threshold.',
        apply: { compressionRatio: 2.3 },
      },
      {
        id: 'tour-nuc-4',
        chapterId: 'nuc-fireball',
        title: 'E = mc² Fireball & Shockwave',
        actionLabel: 'Releasing 15 kt yield from 0.77 g of mass defect',
        narration:
          'Finally, zoom out to the macroscopic energy release governed by Einstein equation E equals delta m times c squared. When roughly eight hundred fifty grams of Uranium-235 completely fission, less than a single gram of matter—lighter than a paperclip—disappears into pure energy equal to fifteen thousand tons of TNT. Soft X-rays instantly superheat the surrounding air into a blinding blackbody plasma fireball, launching a Sedov-Taylor shockwave that carries half the yield as blast, thirty-five percent as intense thermal flash, and fifteen percent as nuclear radiation.',
        apply: { fissionedMassKg: 0.85, triggerBlast: true },
      },
    ],
  },
  {
    topicId: 'fusion',
    title: 'Vol. XI — Stellar Fusion & Tokamak Plasma',
    cues: [
      {
        id: 'tour-fus-1',
        chapterId: 'fus-tokamak',
        title: 'Tokamak Magnetic Plasma Cage',
        actionLabel: 'Energizing 12 T superconducting coils at 160 MK',
        narration:
          'Welcome to Volume Eleven, exploring nuclear fusion—the clean stellar engine that powers every star in the universe. Inside this cutaway superconducting tokamak, deuterium and tritium plasma burns at one hundred sixty million Kelvin, ten times hotter than the center of the Sun. Because no solid material could ever touch that plasma without vaporizing, powerful toroidal and poloidal magnets twist the field lines into a helical bottle that levitates the glowing plasma cleanly away from every wall.',
        apply: { bTesla: 12.0, tokamakTempMK: 160, confinementSec: 4.5 },
      },
      {
        id: 'tour-fus-2',
        chapterId: 'fus-tunnel',
        title: 'Quantum Tunneling D-T Fusion',
        actionLabel: 'Colliding Deuterium & Tritium at 160 MK',
        narration:
          'Why does fusion require such extraordinary temperatures in the first place? Every atomic nucleus is positively charged, so Deuterium and Tritium fiercely repel each other behind a steep electrostatic Coulomb barrier. At one hundred sixty million degrees, their thermal speeds bring them close enough for quantum wave functions to overlap and tunnel straight through the barrier—snapping into a Helium-4 alpha particle and a fourteen-point-one million electron-volt fast neutron.',
        apply: { tunnelTempMK: 160, triggerFusion: true },
      },
      {
        id: 'tour-fus-3',
        chapterId: 'fus-icf',
        title: 'Laser Inertial Confinement (ICF)',
        actionLabel: 'Firing 16 synchronized UV lasers (2.4 MJ)',
        narration:
          'There is a second, completely different way to ignite fusion on Earth: inertial confinement. Watch sixteen synchronized ultraviolet laser beams fire into this tiny golden hohlraum cavity, turning laser energy into a uniform bath of X-rays that crushes the frozen fuel capsule in billionths of a second. Above two megajoules of laser drive, alpha self-heating crosses the ignition cliff so fusion energy output surpasses the laser energy put in.',
        apply: { laserMJ: 2.4, fireLasers: true },
      },
      {
        id: 'tour-fus-4',
        chapterId: 'fus-stellar',
        title: 'Solar Core & Magnetic Corona',
        actionLabel: 'Inspecting 1.0 M☉ boiling photosphere & coronal loops',
        narration:
          'Finally, zoom out to nature’s original fusion reactor: a living star. Deep inside our Sun, immense gravitational pressure sustains proton-proton fusion continuously for ten billion years, converting four point two six million tonnes of hydrogen mass into pure radiant starlight every single second. Above the boiling convective photosphere, twisted magnetic arches channel incandescent plasma across the solar corona.',
        apply: { solarMasses: 1.0 },
      },
    ],
  },
];

export function getAudioTourForVolume(topicId: TopicId): VolumeAudioTour {
  return VOLUME_AUDIO_TOURS.find((t) => t.topicId === topicId) ?? VOLUME_AUDIO_TOURS[0];
}
