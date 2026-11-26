"""Volume X: Nuclear Fission & Atomic Energy Blender models."""
import math
from lib import (M_ACCENT, M_BRASS, M_BRUSHED, M_COPPER, M_DARKMETAL, M_GLASS,
                 M_GOLD, M_STEEL,
                 box, cone, cylinder, lathe, sphere, torus)


def neutron_emitter():
    # Laboratory slow-neutron beam source pointing along +X toward the U-235 target.
    # Placeholder is BoxGeometry(2.6, 1.2, 1.2) -> aligned along +X.
    rot_x = (0, math.pi / 2, 0)
    # Main heavy cylindrical radiation-shielded barrel along X
    cylinder(0.46, 1.8, loc=(-0.25, 0, 0), rot=rot_x, mat=M_DARKMETAL(), verts=32, bevel=0.04)
    # Ribbed cooling / collimator rings
    for x in (-0.85, -0.45, -0.05, 0.35):
        torus(0.5, 0.045, loc=(x, 0, 0), rot=rot_x, mat=M_BRUSHED(), major_seg=32, minor_seg=8)
    # Tapered brass collimator nozzle pointing +X
    cylinder(0.32, 0.55, r2=0.18, loc=(0.92, 0, 0), rot=rot_x, mat=M_BRASS(), verts=24)
    # Glowing Accent aperture ring at tip (+X)
    torus(0.2, 0.045, loc=(1.2, 0, 0), rot=rot_x, mat=M_ACCENT(), major_seg=24, minor_seg=8)
    # Rear high-voltage cap + mounting foot
    cylinder(0.38, 0.24, loc=(-1.22, 0, 0), rot=rot_x, mat=M_STEEL(), verts=24, bevel=0.03)
    box((1.2, 0.72, 0.16), loc=(-0.2, 0, -0.52), mat=M_DARKMETAL(), bevel=0.02)


def fissile_core():
    # Machined metallic fissile sphere with cutaway equatorial diagnostic ring and
    # precision neutron-reflector cage bands (educational physics model).
    sphere(0.86, mat=M_BRUSHED(), seg=40, rings=20)
    # Accent Cherenkov / fission-activity equatorial & meridian rings
    torus(0.92, 0.055, mat=M_ACCENT(), major_seg=48, minor_seg=10)
    torus(0.92, 0.035, rot=(math.pi / 2, 0, 0), mat=M_GOLD(), major_seg=48, minor_seg=8)
    torus(0.92, 0.035, rot=(math.pi / 2, 0, math.pi / 2), mat=M_GOLD(), major_seg=48, minor_seg=8)
    # Polar alignment caps
    for sz in (-1, 1):
        cylinder(0.26, 0.12, loc=(0, 0, sz * 0.88), mat=M_DARKMETAL(), verts=24, bevel=0.02)


def compression_shell():
    # Abstract geometric symmetric compression array (educational cutaway ring of 12
    # inward-facing pressure-lens segments surrounding the core without obstructing the view).
    # Placeholder is SphereGeometry(4.2) -> radial shell at R ~ 1.0.
    R = 1.0
    # Equatorial and tilted structural frame rings
    torus(R, 0.035, mat=M_DARKMETAL(), major_seg=64, minor_seg=8)
    torus(R, 0.03, rot=(math.pi / 3, 0, 0), mat=M_STEEL(), major_seg=56, minor_seg=8)
    torus(R, 0.03, rot=(-math.pi / 3, 0, 0), mat=M_STEEL(), major_seg=56, minor_seg=8)
    # 12 symmetric inward-pointing compression lens pads arranged on an icosahedral-like ring
    for i in range(8):
        a = i * math.pi / 4
        x, y = R * math.cos(a), R * math.sin(a)
        box((0.12, 0.24, 0.24), loc=(x, y, 0), rot=(0, 0, a), mat=M_DARKMETAL(), bevel=0.02)
        box((0.05, 0.18, 0.18), loc=(x * 0.93, y * 0.93, 0), rot=(0, 0, a), mat=M_ACCENT(), bevel=0.01)
    for sz in (-1, 1):
        for i in range(4):
            a = i * math.pi / 2 + math.pi / 4
            r_xy = R * 0.68
            z = sz * R * 0.72
            x, y = r_xy * math.cos(a), r_xy * math.sin(a)
            box((0.2, 0.2, 0.1), loc=(x, y, z), rot=(sz * 0.65 * math.sin(a), -sz * 0.65 * math.cos(a), 0),
                mat=M_BRASS(), bevel=0.015)


def blast_calorimeter():
    # Scientific ground-zero telemetry ring & blast-pressure sensor array sitting on the
    # lab grid floor around the fireball/shockwave simulation.
    # Placeholder is CylinderGeometry(9.0, 9.0, 0.35).
    R = 9.0
    # Outer dark-metal telemetry base ring + inner graduated distance rings
    torus(R, 0.18, mat=M_DARKMETAL(), major_seg=84, minor_seg=10)
    torus(R * 0.66, 0.08, mat=M_BRUSHED(), major_seg=72, minor_seg=8)
    torus(R * 0.33, 0.06, mat=M_ACCENT(), major_seg=56, minor_seg=8)
    # 8 radial pressure-sensor pylons mounted around the outer ring
    for i in range(8):
        a = i * math.pi / 4
        x, y = R * math.cos(a), R * math.sin(a)
        cylinder(0.22, 0.7, loc=(x, y, 0.35), mat=M_STEEL(), verts=16, bevel=0.02)
        sphere(0.16, loc=(x, y, 0.76), mat=M_ACCENT(), seg=14, rings=8)
    # Radial distance spokes
    for i in range(4):
        a = i * math.pi / 4
        box((R * 2.0, 0.08, 0.06), rot=(0, 0, a), mat=M_DARKMETAL())


MODELS = {
    "neutron_emitter": neutron_emitter,
    "fissile_core": fissile_core,
    "compression_shell": compression_shell,
    "blast_calorimeter": blast_calorimeter,
}
