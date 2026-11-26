"""Relativity & Nuclear Physics lab models."""
import math
from lib import (M_ACCENT, M_BRASS, M_BRUSHED, M_DARKMETAL, M_GLASS, M_GOLD, M_STEEL,
                 box, cone, cylinder, sphere, torus)


def clock_mirror():
    # Placeholder is BoxGeometry(2.2, 0.25, 1.5) -> X=2.2, Blender Z=0.25 (three Y), Blender Y=1.5 (three Z).
    # Precision laser-interferometer mirror housing.
    box((2.15, 1.45, 0.16), mat=M_DARKMETAL(), bevel=0.03)
    # Reflective silvered mirror surface slab
    box((1.92, 1.24, 0.06), loc=(0, 0, 0.08), mat=M_STEEL(), bevel=0.01)
    box((1.92, 1.24, 0.06), loc=(0, 0, -0.08), mat=M_STEEL(), bevel=0.01)
    # Accent laser-lock edge trim bars
    for sy in (-0.74, 0.74):
        box((2.05, 0.05, 0.12), loc=(0, sy, 0), mat=M_ACCENT(), bevel=0.01)
    # Corner micrometer adjustment screws
    for sx in (-0.92, 0.92):
        for sy in (-0.56, 0.56):
            cylinder(0.07, 0.26, loc=(sx, sy, 0), mat=M_BRASS(), verts=10)


def photon_pulse():
    # Compact relativistic light-pulse emitter core with orthogonal phase rings
    sphere(0.36, mat=M_ACCENT(), seg=24, rings=12)
    torus(0.5, 0.045, mat=M_GOLD(), major_seg=32, minor_seg=8)
    torus(0.5, 0.045, rot=(math.pi / 2, 0, 0), mat=M_ACCENT(), major_seg=32, minor_seg=8)


def relativistic_craft():
    # Placeholder is BoxGeometry(lCont, 0.7, 1.4) -> flies along +X (nose at +X, engine at -X).
    # Authored at rest length ~6.0 along X, height 0.7 along Blender Z, width 1.4 along Blender Y.
    # Uses fit: 'stretch' so Lorentz contraction along X compresses the entire starship naturally!
    # Main sleek fuselage cylinder along X
    cylinder(0.32, 3.6, loc=(-0.1, 0, 0), rot=(0, math.pi / 2, 0), mat=M_BRUSHED(), verts=28, bevel=0.03)
    # Tapered aerodynamic nose cone pointing +X
    cone(0.32, 1.5, loc=(2.45, 0, 0), rot=(0, math.pi / 2, 0), mat=M_STEEL(), verts=28)
    # Cockpit canopy glass blister
    sphere(0.24, loc=(1.15, 0, 0.22), mat=M_GLASS(), seg=20, rings=10, scale=(2.2, 0.85, 0.75))
    # Delta radiator / solar wings along +/-Y
    for sy in (-1, 1):
        box((2.1, 0.55, 0.06), loc=(-0.55, sy * 0.45, 0), rot=(0, 0, sy * -0.18), mat=M_DARKMETAL(), bevel=0.015)
        box((1.6, 0.06, 0.08), loc=(-0.6, sy * 0.72, 0), mat=M_ACCENT(), bevel=0.01)
    # Rear fusion thruster bell + Accent plasma core at -X
    cylinder(0.36, 0.55, r2=0.22, loc=(-2.15, 0, 0), rot=(0, math.pi / 2, 0), mat=M_DARKMETAL(), verts=24)
    sphere(0.24, loc=(-2.35, 0, 0), mat=M_ACCENT(), seg=18, rings=10)
    # Hull Accent stripe
    torus(0.34, 0.035, loc=(0.4, 0, 0), rot=(0, math.pi / 2, 0), mat=M_ACCENT(), major_seg=28, minor_seg=8)


def control_rod():
    # Placeholder is CylinderGeometry(0.28, 0.28, 6.2) -> axis along Blender Z (three Y).
    R = 0.28
    H = 6.2
    cylinder(R * 0.9, H - 0.4, mat=M_DARKMETAL(), verts=24, bevel=0.02)
    # Ribbed boron-carbide cladding rings
    for i in range(9):
        z = -2.4 + i * 0.6
        torus(R, 0.035, loc=(0, 0, z), mat=M_BRUSHED(), major_seg=24, minor_seg=6)
    # Top grapple head + Accent status collar
    cylinder(R * 1.15, 0.26, loc=(0, 0, H / 2 - 0.13), mat=M_STEEL(), verts=16, bevel=0.02)
    torus(R * 1.05, 0.045, loc=(0, 0, H / 2 - 0.34), mat=M_ACCENT(), major_seg=24, minor_seg=8)
    # Tapered bottom guide nose
    cone(R * 0.9, 0.35, loc=(0, 0, -H / 2 + 0.05), rot=(math.pi, 0, 0), mat=M_STEEL(), verts=20)


MODELS = {
    "clock_mirror": clock_mirror,
    "photon_pulse": photon_pulse,
    "relativistic_craft": relativistic_craft,
    "control_rod": control_rod,
}
