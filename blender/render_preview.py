"""Render quick QA thumbnails of built models (Cycles CPU, headless).

    blender -b --factory-startup -P blender/render_preview.py -- [names...]

Writes blender/.previews/<name>.png (git-ignored).
"""
import math
import os
import sys

import bpy
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
SRC = os.path.join(ROOT, "public", "models")
OUT = os.path.join(HERE, ".previews")

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
names = argv or sorted(f[:-4] for f in os.listdir(SRC) if f.endswith(".glb"))
os.makedirs(OUT, exist_ok=True)

scene = bpy.context.scene
scene.render.engine = "CYCLES"
scene.cycles.device = "CPU"
scene.cycles.samples = 24
scene.cycles.use_denoising = False
scene.render.resolution_x = scene.render.resolution_y = 320
scene.render.film_transparent = False

world = bpy.data.worlds.new("W")
scene.world = world
world.use_nodes = True
world.node_tree.nodes["Background"].inputs[0].default_value = (0.03, 0.045, 0.08, 1)
world.node_tree.nodes["Background"].inputs[1].default_value = 1.0

for name in names:
    for o in list(bpy.data.objects):
        bpy.data.objects.remove(o, do_unlink=True)
    bpy.ops.import_scene.gltf(filepath=os.path.join(SRC, f"{name}.glb"))
    meshes = [o for o in scene.objects if o.type == "MESH"]
    pts = [o.matrix_world @ Vector(c) for o in meshes for c in o.bound_box]
    lo = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    hi = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    center, size = (lo + hi) / 2, max((hi - lo).length, 1e-3)

    cam_data = bpy.data.cameras.new("C")
    cam = bpy.data.objects.new("C", cam_data)
    scene.collection.objects.link(cam)
    d = size * 1.25
    cam.location = center + Vector((d * 0.8, -d, d * 0.6))
    cam.rotation_euler = (center - cam.location).to_track_quat("-Z", "Y").to_euler()
    scene.camera = cam

    for loc, energy in (((1, -1, 1.5), 4.0), ((-1.5, 0.5, 0.8), 1.5)):
        ld = bpy.data.lights.new("L", "SUN")
        ld.energy = energy
        lo_ = bpy.data.objects.new("L", ld)
        scene.collection.objects.link(lo_)
        lo_.rotation_euler = (-Vector(loc)).to_track_quat("-Z", "Y").to_euler()

    scene.render.filepath = os.path.join(OUT, f"{name}.png")
    bpy.ops.render.render(write_still=True)
    print(f"[preview] {name}")
