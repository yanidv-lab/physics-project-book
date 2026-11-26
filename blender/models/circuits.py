"""Circuits & Electron POV (Vol I) hardware component models.

IMPORTANT: Electron POV flies the camera *inside* the copper wire, battery,
and resistor bore! Every collar/ring model here keeps its center bore wide open
so the camera never clips into solid geometry, while upgrading the external
hardware (capacitor plates, ferrite inductor core, battery/resistor collars).
"""
import math
from lib import (M_ACCENT, M_BRASS, M_BRUSHED, M_COPPER, M_DARKMETAL, M_STEEL,
                 box, cylinder, torus)


def capacitor_plate():
    # Placeholder is CylinderGeometry(2.18, 2.18, 0.14) rotated X=PI/2 -> axis along three Z (= Blender Y).
    # Machined aluminum/steel parallel-plate capacitor disc with bevelled rim,
    # rear terminal boss, and subtle radial stiffening ribs.
    rot = (math.pi / 2, 0, 0)
    cylinder(2.16, 0.14, rot=rot, mat=M_BRUSHED(), verts=56, bevel=0.025)
    torus(2.18, 0.075, rot=rot, mat=M_STEEL(), major_seg=56, minor_seg=10)
    # Recessed Accent ring on the plate perimeter
    torus(1.86, 0.035, rot=rot, mat=M_ACCENT(), major_seg=48, minor_seg=8)
    # Brass mounting lugs around the rim
    for i in range(6):
        a = i * math.pi / 3
        cylinder(0.1, 0.18, loc=(1.98 * math.cos(a), 0, 1.98 * math.sin(a)), rot=rot, mat=M_BRASS(), verts=10)


def inductor_core():
    # Placeholder is CylinderGeometry(0.7, 0.7, 13.0) rotated X=PI/2 -> axis along three Z (= Blender Y).
    # Laminated ferrite/iron inductor core rod with Accent flux-glow end caps and machined bands.
    rot = (math.pi / 2, 0, 0)
    cylinder(0.68, 12.6, rot=rot, mat=M_DARKMETAL(), verts=32, bevel=0.05)
    # Laminated core steel spacer rings along the length
    for y in (-5.0, -3.0, -1.0, 1.0, 3.0, 5.0):
        torus(0.71, 0.045, loc=(0, y, 0), rot=rot, mat=M_BRUSHED(), major_seg=32, minor_seg=8)
    # Accent magnetic-flux end-caps
    for sy in (-6.38, 6.38):
        cylinder(0.62, 0.24, loc=(0, sy, 0), rot=rot, mat=M_ACCENT(), verts=28, bevel=0.04)


def battery_collar():
    # Placeholder is TorusGeometry(1.8, 0.12) in three XY plane -> hole along three Z (= Blender Y).
    # Completely hollow machined brass/steel battery terminal flange with bolts & Accent indicator ring.
    rot = (math.pi / 2, 0, 0)
    torus(1.82, 0.14, rot=rot, mat=M_DARKMETAL(), major_seg=48, minor_seg=12)
    torus(1.82, 0.06, loc=(0, -0.09, 0), rot=rot, mat=M_ACCENT(), major_seg=48, minor_seg=8)
    for i in range(8):
        a = i * math.pi / 4
        cylinder(0.08, 0.28, loc=(1.96 * math.cos(a), 0, 1.96 * math.sin(a)), rot=rot, mat=M_BRASS(), verts=8)


def resistor_collar():
    # Placeholder is TorusGeometry(1.38, 0.14) in three XY plane -> hollow machined copper/ceramic end cap.
    rot = (math.pi / 2, 0, 0)
    torus(1.38, 0.15, rot=rot, mat=M_COPPER(), major_seg=40, minor_seg=12)
    torus(1.48, 0.045, rot=rot, mat=M_STEEL(), major_seg=40, minor_seg=8)
    for i in range(6):
        a = i * math.pi / 3
        box((0.1, 0.24, 0.14), loc=(1.5 * math.cos(a), 0, 1.5 * math.sin(a)),
            rot=(0, a, 0), mat=M_BRUSHED(), bevel=0.015)


MODELS = {
    "capacitor_plate": capacitor_plate,
    "inductor_core": inductor_core,
    "battery_collar": battery_collar,
    "resistor_collar": resistor_collar,
}
