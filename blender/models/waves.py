"""Waves, Fields & Quantum lab models."""
import math
from lib import (M_ACCENT, M_BRASS, M_BRUSHED, M_DARKMETAL, M_STEEL,
                 box, cone, cylinder, sphere, torus)


def wave_emitter():
    # Placeholder is CylinderGeometry(0.32, 0.32, 2.2) -> vertical wave transducer horn.
    R = 0.32
    H = 2.2
    # Main ribbed dark-metal transducer barrel
    cylinder(R * 0.9, H * 0.72, loc=(0, 0, 0.1), mat=M_DARKMETAL(), verts=28, bevel=0.02)
    for z in (-0.35, 0.0, 0.35, 0.65):
        torus(R * 0.96, 0.035, loc=(0, 0, z), mat=M_BRUSHED(), major_seg=28, minor_seg=6)
    # Tapered acoustic/optical emitter nozzle pointing down into the wave tank (-Z)
    cylinder(R * 0.55, 0.38, r2=R * 0.9, loc=(0, 0, -0.78), mat=M_BRASS(), verts=24)
    sphere(R * 0.52, loc=(0, 0, -0.96), mat=M_ACCENT(), seg=18, rings=10)
    # Top Accent phase-lock ring + cap
    torus(R * 0.98, 0.055, loc=(0, 0, 0.88), mat=M_ACCENT(), major_seg=28, minor_seg=8)
    cylinder(R * 0.72, 0.18, loc=(0, 0, 1.01), mat=M_STEEL(), verts=20, bevel=0.02)


def standing_clamp():
    # Placeholder is BoxGeometry(0.45, 7, 3.2) -> heavy optical-bench standing-wave boundary clamp.
    # Blender: X=0.45, Y=3.2 (three Z), Z=7.0 (three Y).
    box((0.42, 3.1, 6.8), mat=M_DARKMETAL(), bevel=0.05)
    # Machined steel face plate
    box((0.08, 2.7, 6.2), loc=(0.22, 0, 0), mat=M_BRUSHED(), bevel=0.02)
    # Top and bottom heavy mounting brackets with hex bolts
    for sz in (-2.9, 2.9):
        box((0.52, 2.9, 0.45), loc=(0, 0, sz), mat=M_STEEL(), bevel=0.03)
    # Central string-anchor tensioning chuck
    cylinder(0.28, 0.35, loc=(0.26, 0, 0), rot=(0, math.pi / 2, 0), mat=M_BRASS(), verts=20, bevel=0.02)
    cylinder(0.14, 0.5, loc=(0.32, 0, 0), rot=(0, math.pi / 2, 0), mat=M_STEEL(), verts=16)


def harmonic_pillar():
    # Placeholder is CylinderGeometry(0.085, 0.085, pillarH) -> classical turning-point post.
    # Authored cleanly so fit: 'stretch' or 'y' keeps it sleek.
    cylinder(0.08, 1.8, mat=M_ACCENT(), verts=18)
    cylinder(0.16, 0.1, loc=(0, 0, -0.9), mat=M_DARKMETAL(), verts=20, bevel=0.015)
    cylinder(0.13, 0.1, loc=(0, 0, 0.9), mat=M_STEEL(), verts=20, bevel=0.015)
    torus(0.12, 0.025, loc=(0, 0, 0.78), mat=M_BRASS(), major_seg=20, minor_seg=6)


def quantum_bead():
    # Precision gyroscope-ringed expectation-value / node marker bead
    sphere(0.38, mat=M_ACCENT(), seg=24, rings=12)
    torus(0.48, 0.045, mat=M_STEEL(), major_seg=32, minor_seg=8)
    torus(0.48, 0.045, rot=(math.pi / 2, 0, 0), mat=M_BRASS(), major_seg=32, minor_seg=8)


MODELS = {
    "wave_emitter": wave_emitter,
    "standing_clamp": standing_clamp,
    "harmonic_pillar": harmonic_pillar,
    "quantum_bead": quantum_bead,
}
