"""Optics & Photonics lab models."""
import math
import bpy
import bmesh
from lib import (M_ACCENT, M_BRASS, M_BRUSHED, M_DARKMETAL, M_GLASS, M_STEEL,
                 box, cylinder, lathe, sphere, torus, _finish, _link)


def optical_prism():
    # Equilateral crown-glass prism matching ExtrudeGeometry(r=2.6, depth=3.2 along three Z = Blender Y).
    # Plus machined anodized end-caps on front/back faces so it reads as a precision lab prism
    # while leaving the triangular glass body clear for refracted rays.
    r = 2.6
    d = 3.2
    pts = [
        (0.0, r),
        (-r * math.cos(math.pi / 6), -r * math.sin(math.pi / 6)),
        (r * math.cos(math.pi / 6), -r * math.sin(math.pi / 6)),
    ]

    # Glass triangular prism body along Blender Y (three Z)
    mesh = bpy.data.meshes.new("PrismGlass")
    obj = _link(bpy.data.objects.new("PrismGlass", mesh))
    bm = bmesh.new()
    v_front = [bm.verts.new((x, -d / 2, z)) for x, z in pts]
    v_back = [bm.verts.new((x, d / 2, z)) for x, z in pts]
    bm.faces.new(v_front)
    bm.faces.new(list(reversed(v_back)))
    for i in range(3):
        j = (i + 1) % 3
        bm.faces.new((v_front[i], v_front[j], v_back[j], v_back[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(mesh)
    bm.free()
    _finish(obj, M_GLASS(), smooth=False, bevel=0.06, bevel_segments=2, name="PrismGlass")

    # Corner-edge anodized metal clips at front & back
    for sy in (-d / 2 + 0.08, d / 2 - 0.08):
        for x, z in pts:
            sphere(0.14, loc=(x * 0.96, sy, z * 0.96), mat=M_DARKMETAL(), seg=14, rings=8)

    # Low optical-bench pedestal base under the bottom face
    base_z = -r * math.sin(math.pi / 6) - 0.14
    box((r * 1.65, d * 0.92, 0.24), loc=(0, 0, base_z), mat=M_DARKMETAL(), bevel=0.04)
    box((r * 1.45, d * 0.78, 0.06), loc=(0, 0, base_z + 0.14), mat=M_BRUSHED(), bevel=0.015)


def convex_lens():
    # Placeholder is CylinderGeometry(3.2, 3.2, 0.25) -> axis along Blender Z (three Y),
    # then rotated onto three X by lensMesh.rotation.z = PI/2.
    # Build with optical axis along Blender Z so it aligns with the placeholder!
    R = 3.2
    # Double-convex glass element via lathe profile (r, z)
    profile = [(0.0, -0.34)]
    steps = 12
    for i in range(1, steps + 1):
        t = i / steps
        rad = (R - 0.18) * t
        z = -0.34 * (1.0 - t * t) - 0.06
        profile.append((rad, z))
    for i in range(steps, -1, -1):
        t = i / steps
        rad = (R - 0.18) * t
        z = 0.34 * (1.0 - t * t) + 0.06
        profile.append((rad, z))
    lathe(profile, mat=M_GLASS(), steps=48, name="LensGlass")

    # Machined anodized aluminum lens ring housing + retaining ring
    torus(R, 0.18, mat=M_DARKMETAL(), major_seg=56, minor_seg=12)
    torus(R - 0.16, 0.06, loc=(0, 0, 0.1), mat=M_ACCENT(), major_seg=48, minor_seg=8)
    torus(R - 0.16, 0.06, loc=(0, 0, -0.1), mat=M_ACCENT(), major_seg=48, minor_seg=8)

    # Knurled thumbscrew collar at the bottom (-X in local frame -> -Y after rotation.z = PI/2)
    cylinder(0.22, 0.65, loc=(-R - 0.32, 0, 0), rot=(0, math.pi / 2, 0), mat=M_STEEL(), verts=16, bevel=0.02)
    cylinder(0.32, 0.18, loc=(-R - 0.1, 0, 0), rot=(0, math.pi / 2, 0), mat=M_BRASS(), verts=20, bevel=0.02)


def focal_marker():
    # Precision brass/steel optical focal point marker pin
    sphere(0.45, mat=M_ACCENT(), seg=24, rings=12)
    torus(0.55, 0.06, mat=M_BRASS(), major_seg=32, minor_seg=8)
    torus(0.55, 0.06, rot=(math.pi / 2, 0, 0), mat=M_STEEL(), major_seg=32, minor_seg=8)


def polarizer_ring():
    # Placeholder is CylinderGeometry(2.6, 2.6, 0.14) -> axis along Blender Z (three Y),
    # rotated onto three X by m.rotation.z = PI/2.
    R = 2.6
    # Outer anodized aluminum mount ring
    torus(R, 0.18, mat=M_DARKMETAL(), major_seg=56, minor_seg=12)
    # Inner accent degree bezel
    torus(R - 0.18, 0.065, mat=M_ACCENT(), major_seg=48, minor_seg=8)
    # Translucent polarizing filter glass disc
    cylinder(R - 0.22, 0.05, mat=M_GLASS(), verts=48)
    # Degree tick lugs around perimeter
    for i in range(12):
        a = i * math.pi / 6
        box((0.18, 0.06, 0.24), loc=((R + 0.12) * math.cos(a), (R + 0.12) * math.sin(a), 0),
            rot=(0, 0, a), mat=M_BRUSHED(), bevel=0.01)
    # Optical post stem at bottom (-X local -> -Y world after rotation.z = PI/2)
    cylinder(0.18, 0.55, loc=(-R - 0.3, 0, 0), rot=(0, math.pi / 2, 0), mat=M_STEEL(), verts=16)


MODELS = {
    "optical_prism": optical_prism,
    "convex_lens": convex_lens,
    "focal_marker": focal_marker,
    "polarizer_ring": polarizer_ring,
}
