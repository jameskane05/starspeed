import sys
import os
import json
import datetime
from math import radians, cos, sin, pi

import bpy
from mathutils import Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from spaceship_gen.generators import generate_spaceship, generate_starfighter
from spaceship_gen.export import OUTPUT_DIR, reset_scene, export_glb, next_available_index

TIERS = [
    ('midrange', 15),
]

if __name__ == "__main__":

    # When True: generate starfighters and export GLBs
    # When False: generate one ship and render buildout frames to video/gif
    export_glbs = False

    if export_glbs:
        os.makedirs(OUTPUT_DIR, exist_ok=True)

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

    else:
        script_dir = os.path.dirname(os.path.abspath(__file__))
        output_path = script_dir
        fps = 24
        res_x = 1920
        res_y = 1080
        fov = 60
        camera_distance = 4
        frames_per_step = 7
        completed_frames = 30
        num_ships = 10

        orbit_radius = 5.5
        orbit_height = 2.5
        orbit_revolutions = 1.0
        est_frames = 150

        scene = bpy.data.scenes['Scene']
        scene.render.resolution_x = res_x
        scene.render.resolution_y = res_y
        scene.render.fps = fps
        scene.camera.data.angle = radians(fov)
        cam = scene.camera

        timestamp = datetime.datetime.now().strftime('%Y%m%d_%H%M%S')
        buildout_base = os.path.join(output_path, 'buildout', timestamp)
        os.makedirs(buildout_base, exist_ok=True)

        for ship_idx in range(num_ships):
            reset_scene(delete_all=True)
            out_dir = os.path.join(buildout_base, f'ship{ship_idx}')
            os.makedirs(out_dir, exist_ok=True)

            for c in cam.constraints[:]:
                cam.constraints.remove(c)
            track_empty = bpy.data.objects.new('CameraTarget', None)
            scene.collection.objects.link(track_empty)
            track_empty.location = Vector((0.2, -0.2, -0.15))
            constraint = cam.constraints.new(type='TRACK_TO')
            constraint.target = track_empty
            constraint.track_axis = 'TRACK_NEGATIVE_Z'
            constraint.up_axis = 'UP_Y'

            frame = [0]

            def on_step(name, obj):
                for _ in range(frames_per_step):
                    angle = -pi / 4 + frame[0] * (2 * pi * orbit_revolutions / est_frames)
                    cam.location = track_empty.location + Vector((
                        orbit_radius * cos(angle),
                        orbit_radius * sin(angle),
                        orbit_height,
                    ))
                    bpy.context.view_layer.update()
                    filepath = os.path.join(out_dir, f'{frame[0]:05d}.png')
                    scene.render.filepath = filepath
                    bpy.ops.render.render(write_still=True)
                    frame[0] += 1

            obj = generate_starfighter(
                random_seed=str(ship_idx * 3333 + 7),
                style='extreme',
                on_step=on_step)

            for _ in range(completed_frames):
                angle = -pi / 4 + frame[0] * (2 * pi * orbit_revolutions / est_frames)
                cam.location = track_empty.location + Vector((
                    orbit_radius * cos(angle),
                    orbit_radius * sin(angle),
                    orbit_height,
                ))
                bpy.context.view_layer.update()
                filepath = os.path.join(out_dir, f'{frame[0]:05d}.png')
                scene.render.filepath = filepath
                bpy.ops.render.render(write_still=True)
                frame[0] += 1

            print(f'Ship {ship_idx}: rendered {frame[0]} frames to {out_dir}')

        import subprocess
        for ship_idx in range(num_ships):
            ship_dir = os.path.join(buildout_base, f'ship{ship_idx}')
            output_mp4 = os.path.join(ship_dir, '000buildout.mp4')
            subprocess.run([
                'ffmpeg', '-y', '-framerate', str(fps), '-i',
                os.path.join(ship_dir, '%05d.png'),
                '-c:v', 'libx264', '-pix_fmt', 'yuv420p', output_mp4
            ], check=True)
            print(f'Ship {ship_idx}: {output_mp4}')
