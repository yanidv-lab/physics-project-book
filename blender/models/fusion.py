"""Volume XI: Stellar Fusion & Tokamak Plasma Blender models."""
import math
from lib import (M_ACCENT, M_BRASS, M_BRUSHED, M_COPPER, M_DARKMETAL, M_GOLD, M_STEEL,
                 box, cone, cylinder, torus)


def tokamak_vessel():
    # Cutaway toroidal magnetic confinement fusion tokamak!
    # Built in Blender XY plane (three XZ plane) so the glowing GLSL plasma torus
    # floats cleanly inside the D-shaped superconducting field coils.
    # Leave front 90-degree sector open (cutaway) so the swirling plasma is clearly visible!
    R = 4.2
    r_coil = 1.65

    # 10 superconducting toroidal D-coils arranged around 270 degrees (cutaway in front -Y/+Z)
    for i in range(10):
        # Skip front-facing window around angle = -pi/2 (Blender -Y = three +Z camera side)
        a = -math.pi * 0.22 + (i / 9) * (math.pi * 1.44)
        cx, cy = R * math.cos(a), R * math.sin(a)
        # Toroidal field coil ring perpendicular to torus tangent
        torus(r_coil, 0.14, loc=(cx, cy, 0), rot=(math.pi / 2, 0, a),
              mat=M_DARKMETAL(), major_seg=20, minor_seg=6)
        # Copper inner superconducting winding trim
        torus(r_coil - 0.12, 0.05, loc=(cx, cy, 0), rot=(math.pi / 2, 0, a),
              mat=M_COPPER(), major_seg=18, minor_seg=6)

    # Central solenoid column in the middle of the torus
    cylinder(1.15, 3.8, mat=M_BRUSHED(), verts=24, bevel=0.05)
    for z in (-1.25, 0.0, 1.25):
        torus(1.2, 0.06, loc=(0, 0, z), mat=M_COPPER(), major_seg=24, minor_seg=6)
    cylinder(1.35, 0.24, loc=(0, 0, 1.95), mat=M_DARKMETAL(), verts=24, bevel=0.03)
    cylinder(1.35, 0.24, loc=(0, 0, -1.95), mat=M_DARKMETAL(), verts=24, bevel=0.03)

    # Upper and lower poloidal field (PF) stabilizing rings + Accent status trim
    for sz in (-1, 1):
        torus(R + 1.5, 0.13, loc=(0, 0, sz * 1.55), mat=M_STEEL(), major_seg=36, minor_seg=6)
        torus(R - 0.9, 0.11, loc=(0, 0, sz * 1.85), mat=M_ACCENT(), major_seg=32, minor_seg=6)

    # Heavy circular cryostat base pedestal below the vessel
    torus(R + 1.7, 0.22, loc=(0, 0, -2.25), mat=M_DARKMETAL(), major_seg=40, minor_seg=6)


def fusion_hohlraum():
    # Gold NIF-style laser inertial confinement hohlraum cavity (open at both ends
    # so converging laser beams enter cleanly and illuminate the central cryogenic capsule!)
    # Placeholder is CylinderGeometry(1.6, 1.6, 3.6) rotated along X -> build along Blender Z.
    R = 1.55
    H = 3.2
    # Open-ended gold hohlraum rings + longitudinal diagnostic struts (cutaway cage)
    for z in (-H / 2, -H / 4, H / 4, H / 2):
        torus(R, 0.11, loc=(0, 0, z), mat=M_GOLD(), major_seg=44, minor_seg=10)
    # 6 golden structural ribs connecting the end rings
    for i in range(6):
        a = i * math.pi / 3
        cylinder(0.065, H, loc=(R * math.cos(a), R * math.sin(a), 0), mat=M_BRASS(), verts=12)
    # Laser entrance hole (LEH) Accent collimator rings at top and bottom
    for sz in (-1, 1):
        torus(R * 0.68, 0.06, loc=(0, 0, sz * (H / 2 + 0.08)), mat=M_ACCENT(), major_seg=36, minor_seg=8)


def laser_injector():
    # High-power NIF-style UV laser final-optics focusing cone pointing inward along -Z.
    cylinder(0.32, 0.7, r2=0.14, mat=M_DARKMETAL(), verts=20, bevel=0.02)
    torus(0.34, 0.045, loc=(0, 0, -0.3), mat=M_BRUSHED(), major_seg=24, minor_seg=6)
    torus(0.18, 0.04, loc=(0, 0, 0.32), mat=M_ACCENT(), major_seg=20, minor_seg=6)


MODELS = {
    "tokamak_vessel": tokamak_vessel,
    "fusion_hohlraum": fusion_hohlraum,
    "laser_injector": laser_injector,
}
