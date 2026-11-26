# Blender models

The 3D objects in the labs are made with Blender, driven by Python scripts. The scripts live in this folder, so every model can be rebuilt and every change can be reviewed in git.

```
blender/
  lib.py              shared helpers: PBR materials, bevelled primitives, lathe/helix/tube, GLB export
  build_models.py     headless build entry point -> public/models/<name>.glb + manifest.json
  render_preview.py   Cycles thumbnails for QA -> blender/.previews/<name>.png
  contact_sheet.py    joins the thumbnails into a single image
  models/<lab>.py     one file per lab, each with MODELS = {"name": build_fn}
src/render/modelLibrary.ts   runtime loader (attachModel)
```

## Rebuild

```bash
sudo apt-get install blender python3-numpy   # one-time setup (Blender 4.x)
npm run models                                # build all models
npm run models -- pendulum_bob cart_block     # build only the named models
blender -b --factory-startup -P blender/render_preview.py -- pendulum_bob
python3 blender/contact_sheet.py
```

## How the models get into the labs

The labs still build their simple three.js meshes. Those meshes keep handling physics, animation and click/hover detection. `attachModel(mesh, 'name')`:

1. loads `public/models/name.glb` (cached and shared),
2. scales it to fit the mesh's local bounding box (`fit: 'contain' | 'stretch' | 'none'`),
3. adds it as a child, so it follows every transform the lab applies,
4. hides the simple mesh's surface and keeps that mesh as the click/hover target,
5. replaces Blender materials named `Accent*` with the lab's own material on that mesh. Colour or glow changes the lab makes while running (hot, charged, selected) still show on the model.

If a model fails to load (for example offline or in tests), the simple mesh stays visible. Add `?models=off` to the URL to compare against the original meshes, and use `?chapter=<chapter-id>` (for example `?chapter=mech-gyro`) to open a lab directly.

## Authoring rules

- Blender is +Z up; the exporter converts to three.js +Y up. three.js Z = Blender −Y.
- Build each model in the same orientation as the mesh it dresses (a `CylinderGeometry` is along three.js Y, which is Blender Z).
- Only proportions matter, because each model is scaled to fit its mesh. Match the mesh's aspect ratio, or use `fit: 'stretch'`.
- Name parts that should take the lab's live colour with `M_ACCENT()` (or `M_ACCENT2()`).
- Keep files small enough for phones: aim for under 4k triangles and under 120 KB per model.
