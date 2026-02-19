import sys
import os
import json
import datetime
from math import radians, cos, sin

import bpy
from mathutils import Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from spaceship_gen.generators import generate_spaceship, generate_starfighter
from spaceship_gen.export import OUTPUT_DIR, reset_scene, export_glb, next_available_index

TIERS = [
    ('midrange', 15),
]

if __name__ == "__main__":

    os.makedirs(OUTPUT_DIR, exist_ok=True)

    # Delete existing starfighter GLBs
    for f in os.listdir(OUTPUT_DIR):
        if f.startswith('starfighter-') and f.endswith('.glb'):
            os.remove(os.path.join(OUTPUT_DIR, f))

    idx = 0
    manifest = []
    total = sum(count for _, count in TIERS)

    for style, count in TIERS:
        print(f'\n=== {style.upper()} ({count} ships) ===')
        for i in range(count):
            reset_scene()
            obj = generate_starfighter(
                random_seed=str(idx * 7777 + 42),
                style=style)
            filename = f'starfighter-{idx}.glb'
            output_path = os.path.join(OUTPUT_DIR, filename)
            export_glb(obj, output_path)
            manifest.append(f'./ships/{filename}')
            idx += 1
            print(f'  Exported {idx}/{total} to {output_path}')

    manifest_path = os.path.join(OUTPUT_DIR, 'shipData.json')
    with open(manifest_path, 'w') as f:
        json.dump(manifest, f, indent=2)
    print(f'\nWrote {manifest_path} with {len(manifest)} entries')
