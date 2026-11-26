"""Mechanics lab (Vol: Classical Mechanics) models."""
import math
from lib import (M_ACCENT, M_BRUSHED, M_DARKMETAL, M_RUBBER, M_STEEL, M_WHITEPLASTIC,
                 box, cylinder, sphere, torus, array_around)


def pendulum_bob():
    # Polished steel bob with coloured equatorial band (orientation-free so it
    # reads well at any swing angle).
    sphere(0.5, mat=M_STEEL(), seg=40, rings=20)
    torus(0.5, 0.07, mat=M_ACCENT(), major_seg=48, minor_seg=10)
    for z in (-0.3, 0.3):
        torus(0.4, 0.025, loc=(0, 0, z), mat=M_ACCENT(), major_seg=40, minor_seg=6)


def pivot_mount():
    # Ball-bearing pivot: housing + flange + bolt heads.
    sphere(0.38, mat=M_STEEL(), seg=28, rings=14)
    cylinder(0.5, 0.18, rot=(math.pi / 2, 0, 0), mat=M_DARKMETAL(), verts=32, bevel=0.03)
    for i in range(4):
        a = i * math.pi / 2 + math.pi / 4
        cylinder(0.06, 0.06, loc=(0.38 * math.cos(a), -0.11, 0.38 * math.sin(a)),
                 rot=(math.pi / 2, 0, 0), mat=M_BRUSHED(), verts=8)


def wall_mount():
    # Rigid wall plate (0.35 x 3.6 x 2.2 in three = X, Y-up, Z) with bolts.
    # Blender: X stays X, three Y = Blender Z, three Z = Blender -Y.
    box((0.35, 2.2, 3.6), mat=M_DARKMETAL(), bevel=0.04)
    box((0.08, 1.9, 3.3), loc=(0.2, 0, 0), mat=M_BRUSHED(), bevel=0.02)
    for y in (-0.75, 0.75):
        for z in (-1.4, 1.4):
            cylinder(0.09, 0.08, loc=(0.27, y, z), rot=(0, math.pi / 2, 0), mat=M_STEEL(), verts=6)
    # spring anchor eye
    torus(0.18, 0.05, loc=(0.32, 0, 0), rot=(0, math.pi / 2, 0), mat=M_STEEL(), major_seg=24, minor_seg=8)


def cart_block():
    # Laboratory mass: coloured body, brushed top plate, steel hooks both sides.
    box((1.5, 1.5, 1.32), loc=(0, 0, -0.09), mat=M_ACCENT(), bevel=0.08)
    box((1.36, 1.36, 0.16), loc=(0, 0, 0.66), mat=M_BRUSHED(), bevel=0.04)
    cylinder(0.22, 0.06, loc=(0, 0, 0.76), mat=M_STEEL(), verts=24, bevel=0.015)
    for sx in (-1, 1):
        torus(0.13, 0.035, loc=(sx * 0.83, 0, 0), rot=(math.pi / 2, 0, 0), mat=M_STEEL(), major_seg=20, minor_seg=6)
    # rubber feet
    for sx in (-0.55, 0.55):
        for sy in (-0.55, 0.55):
            cylinder(0.1, 0.06, loc=(sx, sy, -0.76), mat=M_RUBBER(), verts=12)


def gyro_stand():
    # Tapered pillar on a heavy disc base with a pivot cup on top.
    cylinder(0.28, 3.7, r2=0.14, loc=(0, 0, 0.1), mat=M_BRUSHED(), verts=24)
    cylinder(0.75, 0.22, loc=(0, 0, -1.99), mat=M_DARKMETAL(), verts=40, bevel=0.05)
    cylinder(0.2, 0.18, loc=(0, 0, 2.01), mat=M_STEEL(), verts=20, bevel=0.03)
    sphere(0.12, loc=(0, 0, 2.12), mat=M_STEEL(), seg=16, rings=8)


def gyro_axle():
    # Axle along Blender Z (= three Y, matching the CylinderGeometry placeholder).
    cylinder(0.1, 4.6, mat=M_STEEL(), verts=20)
    for z in (-2.2, 1.0):
        cylinder(0.16, 0.14, loc=(0, 0, z), mat=M_BRUSHED(), verts=20, bevel=0.02)


def gyro_flywheel():
    # Torus placeholder lies in three XY plane -> spin axis three Z = Blender -Y.
    rot = (math.pi / 2, 0, 0)
    torus(1.65, 0.22, rot=rot, mat=M_ACCENT(), major_seg=64, minor_seg=14)
    torus(1.42, 0.06, rot=rot, mat=M_STEEL(), major_seg=56, minor_seg=8)
    cylinder(0.32, 0.5, rot=rot, mat=M_BRUSHED(), verts=28, bevel=0.03)
    for i in range(3):
        s = box((0.08, 0.12, 2.9), mat=M_STEEL(), bevel=0.015)
        s.rotation_euler = (0, i * math.pi / 3, 0)


def turntable():
    # Carousel: dark deck, brushed rim, radial ribs, hub.
    cylinder(7.2, 0.24, mat=M_DARKMETAL(), verts=96, bevel=0.03)
    torus(7.2, 0.12, mat=M_BRUSHED(), major_seg=96, minor_seg=10)
    cylinder(0.7, 0.36, mat=M_BRUSHED(), verts=32, bevel=0.04)
    for r in (2.4, 4.8):
        torus(r, 0.025, loc=(0, 0, 0.12), mat=M_WHITEPLASTIC(), major_seg=72, minor_seg=6)
    rib = box((6.4, 0.06, 0.03), loc=(3.9, 0, 0.13), mat=M_WHITEPLASTIC())
    array_around(rib, 12)


def air_puck():
    cylinder(0.5, 0.22, mat=M_ACCENT(), verts=40, bevel=0.06)
    cylinder(0.32, 0.08, loc=(0, 0, 0.14), mat=M_STEEL(), verts=32, bevel=0.02)
    torus(0.5, 0.04, loc=(0, 0, -0.1), mat=M_RUBBER(), major_seg=40, minor_seg=6)


MODELS = {
    "pendulum_bob": pendulum_bob,
    "pivot_mount": pivot_mount,
    "wall_mount": wall_mount,
    "cart_block": cart_block,
    "gyro_stand": gyro_stand,
    "gyro_axle": gyro_axle,
    "gyro_flywheel": gyro_flywheel,
    "turntable": turntable,
    "air_puck": air_puck,
}
