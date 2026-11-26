"""Electromagnetism & Light lab models."""
import math
from lib import (M_ACCENT, M_BRASS, M_BRUSHED, M_CERAMIC, M_COPPER, M_DARKMETAL,
                 M_GLASS, M_GOLD, M_STEEL,
                 box, cone, cylinder, lathe, sphere, torus)


def charge_emitter():
    # Van de Graaff / electrostatic terminal sphere with machined equatorial collar
    # and glowing Accent charge core.
    sphere(0.46, mat=M_ACCENT(), seg=32, rings=16)
    torus(0.48, 0.055, mat=M_STEEL(), major_seg=40, minor_seg=8)
    for sz in (-1, 1):
        cylinder(0.18, 0.07, loc=(0, 0, sz * 0.46), mat=M_BRUSHED(), verts=20, bevel=0.015)


def magnet_pole():
    # Placeholder is BoxGeometry(1.15, 1.15, 2.2) -> half of a bar magnet along three Z (= Blender Y).
    # Bevelled lab bar-magnet pole block with Accent painted body & chamfered steel pole face.
    box((1.12, 2.12, 1.12), mat=M_ACCENT(), bevel=0.08)
    # Chamfered steel collar band near the pole tip
    box((1.16, 0.18, 1.16), loc=(0, 0, 0), mat=M_STEEL(), bevel=0.03)
    # Recessed brushed end trim
    for sy in (-1.06, 1.06):
        box((0.92, 0.04, 0.92), loc=(0, sy, 0), mat=M_BRUSHED(), bevel=0.01)


def incandescent_bulb():
    # Realistic Edison lab indicator lamp! Placeholder is SphereGeometry(0.85) at (0, 4.4, 0).
    # Accent material on the glowing filament core & inner glass glow so faradayBulbMat
    # dynamically brightens the filament when EMF is induced!
    # Lathe glass bulb envelope (centered near Z=0.15)
    profile = [
        (0.24, -0.45),
        (0.28, -0.25),
        (0.42, -0.05),
        (0.55, 0.15),
        (0.56, 0.35),
        (0.48, 0.52),
        (0.30, 0.64),
        (0.0, 0.68),
    ]
    lathe(profile, mat=M_GLASS(), steps=36, name="BulbGlass")

    # Glowing Accent filament core + dual support wires inside the glass
    sphere(0.22, loc=(0, 0, 0.22), mat=M_ACCENT(), seg=20, rings=10)
    torus(0.24, 0.03, loc=(0, 0, 0.22), rot=(math.pi / 2, 0, 0), mat=M_ACCENT(), major_seg=24, minor_seg=6)
    for sx in (-0.09, 0.09):
        cylinder(0.018, 0.45, loc=(sx, 0, -0.02), mat=M_STEEL(), verts=8)

    # Brass Edison screw base + ribs + ceramic bottom insulator
    cylinder(0.24, 0.34, loc=(0, 0, -0.6), mat=M_BRASS(), verts=28, bevel=0.02)
    for z in (-0.48, -0.56, -0.64, -0.71):
        torus(0.245, 0.022, loc=(0, 0, z), mat=M_GOLD(), major_seg=28, minor_seg=6)
    cylinder(0.16, 0.1, r2=0.22, loc=(0, 0, -0.8), mat=M_CERAMIC(), verts=20)
    sphere(0.08, loc=(0, 0, -0.86), mat=M_STEEL(), seg=12, rings=6)


def hall_voltmeter():
    # Placeholder is BoxGeometry(1.7, 0.72, 1.1) -> benchtop Hall digital voltmeter head.
    box((1.68, 1.06, 0.7), mat=M_DARKMETAL(), bevel=0.06)
    # Recessed Accent OLED display panel on front face (-Y in Blender = +Z in three)
    box((1.32, 0.06, 0.42), loc=(0, -0.53, 0.04), mat=M_ACCENT(), bevel=0.015)
    # Brushed bezel frame around front
    box((1.48, 0.04, 0.54), loc=(0, -0.51, 0.04), mat=M_BRUSHED(), bevel=0.015)
    # Twin brass/copper banana-plug binding posts on bottom
    for sx in (-0.42, 0.42):
        cylinder(0.09, 0.14, loc=(sx, 0, -0.4), mat=M_BRASS(), verts=16, bevel=0.015)
    # Top carrying handle rib
    box((0.9, 0.18, 0.08), loc=(0, 0, 0.4), mat=M_STEEL(), bevel=0.02)


def probe_tip():
    # Gold-plated contact probe tip with knurled brass collar
    sphere(0.32, mat=M_ACCENT(), seg=20, rings=10)
    cylinder(0.36, 0.24, rot=(math.pi / 2, 0, 0), mat=M_BRASS(), verts=20, bevel=0.03)
    cone(0.22, 0.32, loc=(0, 0.28, 0), rot=(-math.pi / 2, 0, 0), mat=M_GOLD(), verts=16)


MODELS = {
    "charge_emitter": charge_emitter,
    "magnet_pole": magnet_pole,
    "incandescent_bulb": incandescent_bulb,
    "hall_voltmeter": hall_voltmeter,
    "probe_tip": probe_tip,
}
