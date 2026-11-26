"""Build every Blender model into public/models/*.glb.

Usage:
    npm run models                         # build all
    npm run models -- pendulum_bob cart    # build selected models
    blender -b --factory-startup -P blender/build_models.py -- --list

Each file in blender/models/*.py exposes ``MODELS = {"name": build_fn, ...}``.
A build function creates geometry in the (empty) current scene; this script
then joins, applies modifiers and exports one .glb per model, and writes
public/models/manifest.json.
"""
import importlib.util
import json
import os
import sys
import traceback

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
OUT = os.path.join(ROOT, "public", "models")
sys.path.insert(0, HERE)

import lib  # noqa: E402


def discover():
    registry = {}
    mdir = os.path.join(HERE, "models")
    for fn in sorted(os.listdir(mdir)):
        if not fn.endswith(".py") or fn.startswith("_"):
            continue
        spec = importlib.util.spec_from_file_location(f"models.{fn[:-3]}", os.path.join(mdir, fn))
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)
        for name, fn_build in getattr(mod, "MODELS", {}).items():
            if name in registry:
                raise RuntimeError(f"duplicate model name {name!r} in {fn}")
            registry[name] = (fn[:-3], fn_build)
    return registry


def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    registry = discover()
    if "--list" in argv:
        for name, (group, _) in registry.items():
            print(f"{group:>12}  {name}")
        return

    selected = [a for a in argv if not a.startswith("--")] or list(registry)
    os.makedirs(OUT, exist_ok=True)
    manifest_path = os.path.join(OUT, "manifest.json")
    manifest = {}
    if os.path.exists(manifest_path):
        with open(manifest_path) as f:
            manifest = json.load(f)

    failures = []
    for name in selected:
        if name not in registry:
            failures.append((name, "unknown model"))
            continue
        group, build = registry[name]
        lib.reset_scene()
        lib.clear_material_cache()
        try:
            build()
            path = os.path.join(OUT, f"{name}.glb")
            stats = lib.finalize_and_export(path)
            stats["bytes"] = os.path.getsize(path)
            stats["group"] = group
            manifest[name] = stats
            print(f"[models] {name:<28} {stats['tris']:>6} tris  {stats['bytes'] / 1024:7.1f} KB")
        except Exception as exc:  # keep going, report at end
            traceback.print_exc()
            failures.append((name, str(exc)))

    # Drop entries whose source no longer exists
    manifest = {k: v for k, v in sorted(manifest.items()) if k in registry}
    with open(manifest_path, "w") as f:
        json.dump(manifest, f, indent=2)
        f.write("\n")

    if failures:
        for n, e in failures:
            print(f"[models] FAILED {n}: {e}")
        sys.exit(1)


main()
