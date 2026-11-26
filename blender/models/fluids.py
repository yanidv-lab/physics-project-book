"""Fluid Dynamics lab models."""
import math
from lib import (M_ACCENT, M_BRASS, M_BRUSHED, M_DARKMETAL, M_GLASS, M_STEEL,
                 box, cylinder, torus)


def pressure_column():
    # Placeholder is BoxGeometry(0.55, 1, 0.55) shifted +0.5 on Y, scaled dynamically in Y.
    # Build a clean lab manometer tube centred in [-0.5, 0.5] Z (auto-fitted to [0, 1] Y).
    # Inner glowing liquid column (Accent takes the gauge color!)
    cylinder(0.16, 0.88, loc=(0, 0, 0.0), mat=M_ACCENT(), verts=24)
    # Outer glass tube
    cylinder(0.24, 0.92, loc=(0, 0, 0.0), mat=M_GLASS(), verts=28)
    # Brass fitting collar at bottom and cap at top
    cylinder(0.28, 0.09, loc=(0, 0, -0.455), mat=M_BRASS(), verts=24, bevel=0.015)
    cylinder(0.27, 0.07, loc=(0, 0, 0.465), mat=M_DARKMETAL(), verts=24, bevel=0.015)
    # Graduated scale ticks along the side
    for i in range(5):
        z = -0.32 + i * 0.16
        box((0.06, 0.03, 0.018), loc=(0.25, 0, z), mat=M_STEEL())


def flow_cylinder():
    # Placeholder is CylinderGeometry(1.5, 1.5, 3.2) rotated X=PI/2 (axis along three Z).
    # Author along Blender Z (three Y) to match the unrotated CylinderGeometry!
    R = 1.5
    H = 3.2
    # Main brushed-metal wind-tunnel test cylinder with Accent aerodynamic bands
    cylinder(R, H - 0.24, mat=M_BRUSHED(), verts=48, bevel=0.04)
    # Accent spin-indicator stripes around the body
    for z in (-0.85, 0.0, 0.85):
        torus(R, 0.055, loc=(0, 0, z), mat=M_ACCENT(), major_seg=48, minor_seg=8)
    # Machined dark-metal end-flanges + pressure-tap bolts
    for sz in (-1, 1):
        z_end = sz * (H / 2 - 0.09)
        cylinder(R + 0.12, 0.16, loc=(0, 0, z_end), mat=M_DARKMETAL(), verts=48, bevel=0.03)
        for i in range(6):
            a = i * math.pi / 3
            cylinder(0.08, 0.08, loc=((R - 0.35) * math.cos(a), (R - 0.35) * math.sin(a), z_end + sz * 0.08),
                     mat=M_STEEL(), verts=8)
    # Center axle hub on ends
    cylinder(0.32, H + 0.18, mat=M_STEEL(), verts=20, bevel=0.02)


MODELS = {
    "pressure_column": pressure_column,
    "flow_cylinder": flow_cylinder,
}
