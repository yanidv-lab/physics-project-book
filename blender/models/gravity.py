"""Gravity & Spacetime lab models."""
import math
from lib import (M_ACCENT, M_BRASS, M_BRUSHED, M_DARKMETAL, M_GOLD, M_STEEL,
                 box, cone, cylinder, lathe, sphere, torus)


def space_probe():
    # Deep-space Voyager/Cassini-style probe: octagonal gold-foil spacecraft bus,
    # high-gain parabolic dish antenna, dual solar/instrument booms, and Accent beacon.
    # Octagonal gold-foil bus
    cylinder(0.34, 0.26, mat=M_GOLD(), verts=8, bevel=0.02)
    # High-gain parabolic dish on top (+Z)
    dish_profile = [
        (0.0, 0.18),
        (0.15, 0.20),
        (0.32, 0.26),
        (0.46, 0.36),
        (0.48, 0.34),
        (0.32, 0.23),
        (0.14, 0.17),
        (0.0, 0.15),
    ]
    lathe(dish_profile, mat=M_BRUSHED(), steps=32, name="HighGainDish")
    # Dish feed horn + Accent telemetry beacon
    cylinder(0.035, 0.28, loc=(0, 0, 0.32), mat=M_STEEL(), verts=10)
    sphere(0.09, loc=(0, 0, 0.46), mat=M_ACCENT(), seg=14, rings=8)
    # Twin solar array wings along +/-X
    for sx in (-1, 1):
        cylinder(0.03, 0.45, loc=(sx * 0.45, 0, 0), rot=(0, math.pi / 2, 0), mat=M_STEEL(), verts=10)
        box((0.55, 0.32, 0.035), loc=(sx * 0.72, 0, 0), mat=M_DARKMETAL(), bevel=0.008)
        box((0.46, 0.24, 0.042), loc=(sx * 0.72, 0, 0), mat=M_ACCENT(), bevel=0.005)
    # Bottom thruster nozzle
    cone(0.14, 0.2, loc=(0, 0, -0.22), rot=(0, 0, 0), mat=M_DARKMETAL(), verts=16)


def lagrange_telescope():
    # JWST-inspired space telescope marker for Lagrange points (L1-L5):
    # diamond sunshield, hexagonal gold mirror array, secondary mirror tripod, Accent beacon.
    # Layered metallic sunshield
    for i, dz in enumerate((-0.14, -0.09, -0.04)):
        s = 1.0 - i * 0.08
        box((0.88 * s, 0.56 * s, 0.02), loc=(0, 0, dz), rot=(0, 0, math.pi / 4), mat=M_BRUSHED(), bevel=0.006)
    # Primary hexagonal gold mirror (tilted slightly)
    cylinder(0.32, 0.06, loc=(0, 0, 0.22), rot=(math.pi / 2, 0, 0), mat=M_GOLD(), verts=6, bevel=0.01)
    # Accent optical core / status beacon
    sphere(0.11, loc=(0, -0.14, 0.22), mat=M_ACCENT(), seg=16, rings=8)
    # Support mast
    cylinder(0.045, 0.26, loc=(0, 0.05, 0.06), mat=M_DARKMETAL(), verts=12)


def ringed_planet():
    # Stylized realistic planet for the Lagrange M2 body: smooth Accent sphere +
    # subtle brushed/brass planetary ring collar so it stands out cleanly from stars.
    sphere(0.48, mat=M_ACCENT(), seg=36, rings=18)
    torus(0.76, 0.045, rot=(0.32, 0.15, 0), mat=M_BRASS(), major_seg=48, minor_seg=8)
    torus(0.64, 0.025, rot=(0.32, 0.15, 0), mat=M_BRUSHED(), major_seg=44, minor_seg=6)


MODELS = {
    "space_probe": space_probe,
    "lagrange_telescope": lagrange_telescope,
    "ringed_planet": ringed_planet,
}
