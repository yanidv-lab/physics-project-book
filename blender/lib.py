"""Shared helpers for authoring Physics Project Book models in Blender.

All models are built procedurally with bpy so they are reproducible and
reviewable in git. Run everything with:

    npm run models            # = blender -b --factory-startup -P blender/build_models.py

Conventions
-----------
* Units are metres-ish; the web loader re-fits each model to the procedural
  placeholder's bounding box, so absolute size does not matter. Proportions do.
* +Y is up in three.js. Blender's glTF exporter converts Blender +Z-up to +Y-up,
  so author with +Z up as usual.
* Name a material ``Accent`` (or ``Accent.<anything>``) for parts that should
  take on the lab's live colour (the placeholder material) at runtime.
* Keep it mobile friendly: modest segment counts, bevels with 2-3 segments.
"""
from __future__ import annotations

import math
import bpy
import bmesh

# --------------------------------------------------------------------------
# Scene
# --------------------------------------------------------------------------

def reset_scene() -> None:
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for coll in (bpy.data.meshes, bpy.data.materials, bpy.data.curves):
        for block in list(coll):
            if block.users == 0:
                coll.remove(block)


def _link(obj):
    bpy.context.collection.objects.link(obj)
    return obj


# --------------------------------------------------------------------------
# Materials (Principled BSDF -> glTF metallic/roughness)
# --------------------------------------------------------------------------

_MAT_CACHE: dict[str, bpy.types.Material] = {}


def material(name: str, color=(0.8, 0.8, 0.8), metallic=0.0, roughness=0.5,
             emission=None, emission_strength=1.0, alpha=1.0, transmission=0.0):
    key = name
    if key in _MAT_CACHE and _MAT_CACHE[key].name in bpy.data.materials:
        return _MAT_CACHE[key]
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (*color, 1.0)
    bsdf.inputs["Metallic"].default_value = metallic
    bsdf.inputs["Roughness"].default_value = roughness
    if transmission:
        bsdf.inputs["Transmission Weight"].default_value = transmission
    if emission is not None:
        bsdf.inputs["Emission Color"].default_value = (*emission, 1.0)
        bsdf.inputs["Emission Strength"].default_value = emission_strength
    if alpha < 1.0:
        bsdf.inputs["Alpha"].default_value = alpha
        mat.blend_method = "BLEND"
    _MAT_CACHE[key] = mat
    return mat


def clear_material_cache() -> None:
    _MAT_CACHE.clear()


# Palette tuned for the dark lab scene
def M_STEEL():      return material("Steel", (0.78, 0.80, 0.83), metallic=1.0, roughness=0.28)
def M_BRUSHED():    return material("Brushed", (0.62, 0.65, 0.70), metallic=1.0, roughness=0.42)
def M_DARKMETAL():  return material("DarkMetal", (0.12, 0.14, 0.18), metallic=0.9, roughness=0.35)
def M_COPPER():     return material("Copper", (0.95, 0.55, 0.35), metallic=1.0, roughness=0.3)
def M_BRASS():      return material("Brass", (0.92, 0.74, 0.38), metallic=1.0, roughness=0.3)
def M_GOLD():       return material("Gold", (1.0, 0.78, 0.34), metallic=1.0, roughness=0.22)
def M_PLASTIC():    return material("Plastic", (0.16, 0.19, 0.25), roughness=0.45)
def M_WHITEPLASTIC(): return material("WhitePlastic", (0.88, 0.90, 0.93), roughness=0.4)
def M_RUBBER():     return material("Rubber", (0.05, 0.05, 0.06), roughness=0.85)
def M_WOOD():       return material("Wood", (0.55, 0.36, 0.2), roughness=0.6)
def M_GLASS():      return material("Glass", (0.75, 0.9, 1.0), roughness=0.05, alpha=0.28, transmission=1.0)
def M_CERAMIC():    return material("Ceramic", (0.92, 0.88, 0.80), roughness=0.3)
def M_ACCENT():     return material("Accent", (0.0, 0.94, 1.0), metallic=0.2, roughness=0.35)
def M_ACCENT2():    return material("Accent.2", (0.98, 0.75, 0.14), metallic=0.2, roughness=0.35)


def assign(obj, mat):
    obj.data.materials.clear()
    obj.data.materials.append(mat)
    return obj


# --------------------------------------------------------------------------
# Primitives (return the created object; all smooth-shaded w/ auto smooth)
# --------------------------------------------------------------------------

def _finish(obj, mat=None, smooth=True, bevel=0.0, bevel_segments=2, name=None):
    if name:
        obj.name = name
    if mat is not None:
        assign(obj, mat)
    if smooth:
        for p in obj.data.polygons:
            p.use_smooth = True
        # Blender 4.1+ removed auto smooth; 4.0 still has it.
        if hasattr(obj.data, "use_auto_smooth"):
            obj.data.use_auto_smooth = True
            obj.data.auto_smooth_angle = math.radians(40)
    if bevel > 0:
        mod = obj.modifiers.new("Bevel", "BEVEL")
        mod.width = bevel
        mod.segments = bevel_segments
        mod.limit_method = "ANGLE"
        mod.angle_limit = math.radians(40)
        mod.harden_normals = False
    return obj


def box(size=(1, 1, 1), loc=(0, 0, 0), rot=(0, 0, 0), mat=None, bevel=0.0, name=None):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc, rotation=rot)
    o = bpy.context.active_object
    o.scale = size
    bpy.ops.object.transform_apply(scale=True)
    return _finish(o, mat, smooth=bevel > 0, bevel=bevel, name=name)


def cylinder(r=0.5, depth=1.0, loc=(0, 0, 0), rot=(0, 0, 0), mat=None, verts=32,
             bevel=0.0, name=None, r2=None):
    if r2 is None:
        bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=r, depth=depth, location=loc, rotation=rot)
    else:
        bpy.ops.mesh.primitive_cone_add(vertices=verts, radius1=r, radius2=r2, depth=depth, location=loc, rotation=rot)
    return _finish(bpy.context.active_object, mat, bevel=bevel, name=name)


def sphere(r=0.5, loc=(0, 0, 0), mat=None, seg=32, rings=16, name=None, scale=(1, 1, 1)):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=seg, ring_count=rings, radius=r, location=loc)
    o = bpy.context.active_object
    o.scale = scale
    bpy.ops.object.transform_apply(scale=True)
    return _finish(o, mat, name=name)


def torus(R=1.0, r=0.1, loc=(0, 0, 0), rot=(0, 0, 0), mat=None, major_seg=48, minor_seg=12, name=None):
    bpy.ops.mesh.primitive_torus_add(major_radius=R, minor_radius=r, major_segments=major_seg,
                                     minor_segments=minor_seg, location=loc, rotation=rot)
    return _finish(bpy.context.active_object, mat, name=name)


def cone(r=0.5, depth=1.0, loc=(0, 0, 0), rot=(0, 0, 0), mat=None, verts=32, name=None):
    bpy.ops.mesh.primitive_cone_add(vertices=verts, radius1=r, radius2=0, depth=depth, location=loc, rotation=rot)
    return _finish(bpy.context.active_object, mat, name=name)


def lathe(profile, mat=None, steps=40, name=None, loc=(0, 0, 0)):
    """Revolve a 2D (r, z) profile around Z. Great for lenses, beakers, bulbs."""
    mesh = bpy.data.meshes.new(name or "Lathe")
    obj = _link(bpy.data.objects.new(name or "Lathe", mesh))
    bm = bmesh.new()
    rings = []
    for i in range(steps):
        a = 2 * math.pi * i / steps
        ca, sa = math.cos(a), math.sin(a)
        rings.append([bm.verts.new((r * ca, r * sa, z)) for r, z in profile])
    for i in range(steps):
        a, b = rings[i], rings[(i + 1) % steps]
        for j in range(len(profile) - 1):
            bm.faces.new((a[j], b[j], b[j + 1], a[j + 1]))
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(mesh)
    bm.free()
    obj.location = loc
    return _finish(obj, mat, name=name)


def helix(radius=0.4, length=2.0, turns=10, wire=0.04, mat=None, name=None, axis="Z"):
    """Coil spring along an axis, centred at origin."""
    curve = bpy.data.curves.new(name or "Helix", "CURVE")
    curve.dimensions = "3D"
    curve.bevel_depth = wire
    curve.bevel_resolution = 3
    spl = curve.splines.new("POLY")
    n = max(16, int(turns * 16))
    spl.points.add(n - 1)
    for i in range(n):
        t = i / (n - 1)
        a = t * turns * 2 * math.pi
        x, y, z = radius * math.cos(a), radius * math.sin(a), (t - 0.5) * length
        if axis == "X":
            x, y, z = z, x, y
        elif axis == "Y":
            x, y, z = x, z, y
        spl.points[i].co = (x, y, z, 1)
    obj = _link(bpy.data.objects.new(name or "Helix", curve))
    if mat is not None:
        curve.materials.append(mat)
    return obj


def tube_path(points, wire=0.04, mat=None, name=None, smooth=True):
    curve = bpy.data.curves.new(name or "Tube", "CURVE")
    curve.dimensions = "3D"
    curve.bevel_depth = wire
    curve.bevel_resolution = 3
    spl = curve.splines.new("BEZIER" if smooth else "POLY")
    if smooth:
        spl.bezier_points.add(len(points) - 1)
        for bp, p in zip(spl.bezier_points, points):
            bp.co = p
            bp.handle_left_type = bp.handle_right_type = "AUTO"
    else:
        spl.points.add(len(points) - 1)
        for sp, p in zip(spl.points, points):
            sp.co = (*p, 1)
    obj = _link(bpy.data.objects.new(name or "Tube", curve))
    if mat is not None:
        curve.materials.append(mat)
    return obj


def array_around(obj, count, axis="Z"):
    """Duplicate obj `count` times evenly around the origin on `axis`."""
    out = [obj]
    for i in range(1, count):
        d = obj.copy()
        d.data = obj.data.copy()
        _link(d)
        ang = 2 * math.pi * i / count
        idx = "XYZ".index(axis)
        rot = list(d.rotation_euler)
        rot[idx] += ang
        d.rotation_euler = rot
        loc = list(obj.location)
        if axis == "Z":
            x, y = loc[0], loc[1]
            loc[0], loc[1] = x * math.cos(ang) - y * math.sin(ang), x * math.sin(ang) + y * math.cos(ang)
        d.location = loc
        out.append(d)
    return out


# --------------------------------------------------------------------------
# Export
# --------------------------------------------------------------------------

def finalize_and_export(path: str) -> dict:
    """Convert curves, apply modifiers, join into one object, export .glb."""
    objs = [o for o in bpy.context.scene.objects if o.type in {"MESH", "CURVE"}]
    if not objs:
        raise RuntimeError("model produced no geometry")
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.convert(target="MESH")  # applies modifiers + curves
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    if len(objs) > 1:
        bpy.ops.object.join()
    obj = bpy.context.active_object
    tris = sum(len(p.vertices) - 2 for p in obj.data.polygons)

    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format="GLB",
        use_selection=True,
        export_apply=True,
        export_yup=True,
        export_normals=True,
        export_texcoords=False,
        export_materials="EXPORT",
        export_cameras=False,
        export_lights=False,
        export_animations=False,
    )
    return {"tris": tris}
