"""Thermodynamics & Statistical Mechanics lab models."""
import math
from lib import (M_ACCENT, M_BRASS, M_BRUSHED, M_DARKMETAL, M_RUBBER, M_STEEL,
                 box, cylinder, sphere, torus)


def piston_plate():
    # Placeholder is BoxGeometry(0.28, 6.0, 6.0) -> thin along X, tall/wide in Y/Z.
    # Blender: X=0.28, Y=6.0, Z=6.0.
    box((0.24, 5.85, 5.85), mat=M_BRUSHED(), bevel=0.04)
    # Recessed Accent thermal indicator frame on the inner face (-X)
    box((0.06, 5.1, 5.1), loc=(-0.12, 0, 0), mat=M_ACCENT(), bevel=0.02)
    # Perimeter rubber O-ring gasket seal
    for sy in (-2.94, 2.94):
        box((0.28, 0.1, 5.95), loc=(0, sy, 0), mat=M_RUBBER(), bevel=0.02)
    for sz in (-2.94, 2.94):
        box((0.28, 5.95, 0.1), loc=(0, 0, sz), mat=M_RUBBER(), bevel=0.02)
    # Machined actuator rod boss on the outer face (+X)
    cylinder(0.55, 0.18, loc=(0.18, 0, 0), rot=(0, math.pi / 2, 0), mat=M_DARKMETAL(), verts=24, bevel=0.02)
    cylinder(0.24, 0.36, loc=(0.35, 0, 0), rot=(0, math.pi / 2, 0), mat=M_STEEL(), verts=20, bevel=0.015)


def chamber_divider():
    # Placeholder is BoxGeometry(0.14, 6.1, 6.1) -> thin partition wall with top handle.
    box((0.12, 5.95, 5.95), mat=M_DARKMETAL(), bevel=0.02)
    # Accent translucent/glowing thermal barrier panel insets
    box((0.15, 5.2, 5.2), mat=M_ACCENT(), bevel=0.015)
    # Brass corner rivets
    for sy in (-2.65, 2.65):
        for sz in (-2.65, 2.65):
            cylinder(0.12, 0.18, loc=(0, sy, sz), rot=(0, math.pi / 2, 0), mat=M_BRASS(), verts=10)
    # Top pull handle bar
    box((0.16, 1.8, 0.16), loc=(0, 0, 3.22), mat=M_BRASS(), bevel=0.03)
    for sy in (-0.72, 0.72):
        cylinder(0.08, 0.32, loc=(0, sy, 3.06), mat=M_STEEL(), verts=12)


def carnot_piston():
    # Placeholder is CylinderGeometry(2.2, 2.2, 0.45) -> axis along Blender Z (three Y).
    R = 2.2
    cylinder(R - 0.04, 0.44, mat=M_BRUSHED(), verts=48, bevel=0.04)
    # Twin dark compression rings around the skirt
    for z in (-0.11, 0.11):
        torus(R, 0.045, loc=(0, 0, z), mat=M_RUBBER(), major_seg=48, minor_seg=8)
    # Glowing Accent thermal crown plate on top
    cylinder(R * 0.78, 0.08, loc=(0, 0, 0.23), mat=M_ACCENT(), verts=40, bevel=0.02)
    # Central steel connecting rod stub rising upward
    cylinder(0.32, 0.55, loc=(0, 0, 0.48), mat=M_STEEL(), verts=20, bevel=0.02)
    cylinder(0.48, 0.14, loc=(0, 0, 0.28), mat=M_DARKMETAL(), verts=24, bevel=0.02)


def pollen_grain():
    # Organic micro-botanical pollen grain: golden Accent core with evenly distributed
    # spherical bumps (echinate pollen morphology) for realistic Brownian motion.
    sphere(0.46, mat=M_ACCENT(), seg=28, rings=16)
    # Golden-angle Fibonacci lattice of 26 surface nodules
    n = 26
    golden = math.pi * (3.0 - math.sqrt(5.0))
    for i in range(n):
        y = 1.0 - (i / float(n - 1)) * 2.0
        r = math.sqrt(max(0.0, 1.0 - y * y))
        theta = golden * i
        x = math.cos(theta) * r
        z = math.sin(theta) * r
        sphere(0.11, loc=(x * 0.47, y * 0.47, z * 0.47), mat=M_BRASS(), seg=10, rings=6)


def pv_marker():
    # Precision instrument bead for Carnot P-V cycle state
    sphere(0.38, mat=M_ACCENT(), seg=24, rings=12)
    torus(0.46, 0.06, mat=M_STEEL(), major_seg=32, minor_seg=8)
    torus(0.46, 0.06, rot=(math.pi / 2, 0, 0), mat=M_BRASS(), major_seg=32, minor_seg=8)


MODELS = {
    "piston_plate": piston_plate,
    "chamber_divider": chamber_divider,
    "carnot_piston": carnot_piston,
    "pollen_grain": pollen_grain,
    "pv_marker": pv_marker,
}
