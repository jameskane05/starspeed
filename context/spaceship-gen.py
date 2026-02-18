#
# spaceship_generator.py
#
# Blender script: procedural 3D starfighter generation.
# michael@spaceduststudios.com
# https://github.com/a1studmuffin/SpaceshipGenerator
#
# Run (Windows, from starspeed repo root):
#   "C:\Program Files\Blender Foundation\Blender 4.3\blender.exe" --background --python context/spaceship-gen.py
# Optionally add after --: --subdir <folder> (e.g. varied) to output to public/ships/<folder>/
# Optionally add: --extreme for weirder high-variance ships
#
# Example:
#   "C:\Program Files\Blender Foundation\Blender 4.3\blender.exe" --background --python context/spaceship-gen.py -- --subdir varied --extreme
#

import sys
import os
import os.path
import bpy
import bmesh
import datetime
from math import sqrt, radians, pi, cos, sin
from mathutils import Vector, Matrix
from random import random, seed, uniform, randint, randrange, choice
from enum import IntEnum
from colorsys import hls_to_rgb

DIR = os.path.dirname(os.path.abspath(__file__))

def resource_path(*path_components):
    return os.path.join(DIR, *path_components)

# Deletes all existing spaceships and unused materials from the scene
def reset_scene():
    for item in bpy.data.objects:
        item.select_set(item.name.startswith('Spaceship'))
    bpy.ops.object.delete()
    for material in bpy.data.materials:
        if not material.users:
            bpy.data.materials.remove(material)
    for texture in bpy.data.textures:
        if not texture.users:
            bpy.data.textures.remove(texture)

# Extrudes a face along its normal by translate_forwards units.
# Returns the new face, and optionally fills out extruded_face_list
# with all the additional side faces created from the extrusion.
def extrude_face(bm, face, translate_forwards=0.0, extruded_face_list=None):
    new_faces = bmesh.ops.extrude_discrete_faces(bm, faces=[face])['faces']
    if extruded_face_list != None:
        extruded_face_list += new_faces[:]
    new_face = new_faces[0]
    bmesh.ops.translate(bm,
                        vec=new_face.normal * translate_forwards,
                        verts=new_face.verts)
    return new_face

# Similar to extrude_face, except corrigates the geometry to create "ribs".
# Returns the new face.
def ribbed_extrude_face(bm, face, translate_forwards, num_ribs=3, rib_scale=0.9):
    translate_forwards_per_rib = translate_forwards / float(num_ribs)
    new_face = face
    for i in range(num_ribs):
        new_face = extrude_face(bm, new_face, translate_forwards_per_rib * 0.25)
        new_face = extrude_face(bm, new_face, 0.0)
        scale_face(bm, new_face, rib_scale, rib_scale, rib_scale)
        new_face = extrude_face(bm, new_face, translate_forwards_per_rib * 0.5)
        new_face = extrude_face(bm, new_face, 0.0)
        scale_face(bm, new_face, 1 / rib_scale, 1 / rib_scale, 1 / rib_scale)
        new_face = extrude_face(bm, new_face, translate_forwards_per_rib * 0.25)
    return new_face

# Scales a face in local face space. Ace!
def scale_face(bm, face, scale_x, scale_y, scale_z):
    face_space = get_face_matrix(face)
    face_space.invert()
    bmesh.ops.scale(bm,
                    vec=Vector((scale_x, scale_y, scale_z)),
                    space=face_space,
                    verts=face.verts)

# Returns a rough 4x4 transform matrix for a face (doesn't handle
# distortion/shear) with optional position override.
def get_face_matrix(face, pos=None):
    x_axis = (face.verts[1].co - face.verts[0].co).normalized()
    z_axis = -face.normal
    y_axis = z_axis.cross(x_axis)
    if not pos:
        pos = face.calc_center_bounds()

    # Construct a 4x4 matrix from axes + position:
    # http://i.stack.imgur.com/3TnQP.png
    mat = Matrix()
    mat[0][0] = x_axis.x
    mat[1][0] = x_axis.y
    mat[2][0] = x_axis.z
    mat[3][0] = 0
    mat[0][1] = y_axis.x
    mat[1][1] = y_axis.y
    mat[2][1] = y_axis.z
    mat[3][1] = 0
    mat[0][2] = z_axis.x
    mat[1][2] = z_axis.y
    mat[2][2] = z_axis.z
    mat[3][2] = 0
    mat[0][3] = pos.x
    mat[1][3] = pos.y
    mat[2][3] = pos.z
    mat[3][3] = 1
    return mat

# Returns the rough length and width of a quad face.
# Assumes a perfect rectangle, but close enough.
def get_face_width_and_height(face):
    if not face.is_valid or len(face.verts[:]) < 4:
        return -1, -1
    width = (face.verts[0].co - face.verts[1].co).length
    height = (face.verts[2].co - face.verts[1].co).length
    return width, height

# Returns the rough aspect ratio of a face. Always >= 1.
def get_aspect_ratio(face):
    if not face.is_valid:
        return 1.0
    face_aspect_ratio = max(0.01, face.edges[0].calc_length() / face.edges[1].calc_length())
    if face_aspect_ratio < 1.0:
        face_aspect_ratio = 1.0 / face_aspect_ratio
    return face_aspect_ratio

# Returns true if this face is pointing behind the ship
def is_rear_face(face):
    return face.normal.x < -0.95

def add_point_marker(parent, name, pos_final):
    eps = 1e-6
    verts = [Vector((0, 0, 0)), Vector((eps, 0, 0)), Vector((0, eps, 0))]
    faces = [[0, 1, 2]]
    me = bpy.data.meshes.new(name)
    me.from_pydata(verts, [], faces)
    marker = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(marker)
    marker.parent = parent
    marker.location = pos_final
    return marker

def create_engine_child(parent, name, pos_final, radius, length, scale, materials):
    bm_e = bmesh.new()
    result = bmesh.ops.create_cone(bm_e, cap_ends=True, cap_tris=False,
        segments=6, radius1=radius, radius2=radius * 0.7, depth=length,
        matrix=Matrix.Rotation(radians(90), 4, 'Y'))
    for v in result['verts']:
        for f in v.link_faces:
            f.material_index = 0
    result = bmesh.ops.create_cone(bm_e, cap_ends=True, cap_tris=False,
        segments=6, radius1=radius * 0.6, radius2=radius * 0.3, depth=length * 0.25,
        matrix=Matrix.Translation(Vector((-length * 0.55, 0, 0))) @ Matrix.Rotation(radians(90), 4, 'Y'))
    for v in result['verts']:
        for f in v.link_faces:
            f.material_index = 1
    rot = Matrix.Rotation(radians(-90), 4, 'Z')
    for v in bm_e.verts:
        v.co = rot @ v.co
        v.co *= scale
    me = bpy.data.meshes.new(name)
    bm_e.to_mesh(me)
    bm_e.free()
    me.materials.append(materials[Material.hull_dark])
    me.materials.append(materials[Material.exhaust_burn])
    obj = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(obj)
    obj.parent = parent
    obj.location = pos_final
    return obj

def create_turret_child(parent, name, pos_final, t_size, b_len, scale, materials):
    bm_t = bmesh.new()
    result = bmesh.ops.create_cone(bm_t, cap_ends=True, cap_tris=False,
        segments=6, radius1=t_size * 0.4, radius2=t_size * 0.5, depth=t_size * 1.2,
        matrix=Matrix.Rotation(radians(90), 4, 'Y'))
    for v in result['verts']:
        for f in v.link_faces:
            f.material_index = 0
    result = bmesh.ops.create_cone(bm_t, cap_ends=True, cap_tris=False,
        segments=6, radius1=t_size * 0.15, radius2=t_size * 0.15, depth=b_len,
        matrix=Matrix.Translation(Vector((t_size * 0.6 + b_len * 0.5, 0, 0))) @ Matrix.Rotation(radians(90), 4, 'Y'))
    for v in result['verts']:
        for f in v.link_faces:
            f.material_index = 0
    rot = Matrix.Rotation(radians(-90), 4, 'Z')
    for v in bm_t.verts:
        v.co = rot @ v.co
        v.co *= scale
    me = bpy.data.meshes.new(name)
    bm_t.to_mesh(me)
    bm_t.free()
    me.materials.append(materials[Material.hull_dark])
    obj = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(obj)
    obj.parent = parent
    obj.location = pos_final
    return obj

# Given a face, splits it into a uniform grid and extrudes each grid face
# out and back in again, making an exhaust shape.
def add_exhaust_to_face(bm, face):
    if not face.is_valid:
        return

    # The more square the face is, the more grid divisions it might have
    num_cuts = randint(1, max(1, int(3 - get_aspect_ratio(face))))
    result = bmesh.ops.subdivide_edges(bm,
                                    edges=face.edges[:],
                                    cuts=num_cuts,
                                    fractal=0.02,
                                    use_grid_fill=True)

    exhaust_length = uniform(0.1, 0.2)
    scale_outer = 1 / uniform(1.3, 1.6)
    scale_inner = 1 / uniform(1.05, 1.1)
    for face in result['geom']:
        if isinstance(face, bmesh.types.BMFace):
            if is_rear_face(face):
                face.material_index = Material.hull_dark
                face = extrude_face(bm, face, exhaust_length)
                scale_face(bm, face, scale_outer, scale_outer, scale_outer)
                extruded_face_list = []
                face = extrude_face(bm, face, -exhaust_length * 0.9, extruded_face_list)
                for extruded_face in extruded_face_list:
                    extruded_face.material_index = Material.exhaust_burn
                scale_face(bm, face, scale_inner, scale_inner, scale_inner)

# Given a face, splits it up into a smaller uniform grid and extrudes each grid cell.
def add_grid_to_face(bm, face, scale=1.0):
    if not face.is_valid:
        return
    result = bmesh.ops.subdivide_edges(bm,
                                    edges=face.edges[:],
                                    cuts=randint(1, 2),
                                    fractal=0.02,
                                    use_grid_fill=True,
                                    use_single_edge=False)
    grid_length = uniform(0.025, 0.15) * scale
    scale = 0.8
    for face in result['geom']:
        if isinstance(face, bmesh.types.BMFace):
            material_index = Material.hull_lights if random() > 0.5 else Material.hull
            extruded_face_list = []
            face = extrude_face(bm, face, grid_length, extruded_face_list)
            for extruded_face in extruded_face_list:
                if abs(face.normal.z) < 0.707: # side face
                    extruded_face.material_index = material_index
            scale_face(bm, face, scale, scale, scale)

# Given a face, adds some cylinders along it in a grid pattern.
def add_cylinders_to_face(bm, face):
    if not face.is_valid or len(face.verts[:]) < 4:
        return
    horizontal_step = randint(1, 3)
    vertical_step = randint(1, 3)
    num_segments = randint(4, 6)
    face_width, face_height = get_face_width_and_height(face)
    cylinder_depth = 1.3 * min(face_width / (horizontal_step + 2),
                               face_height / (vertical_step + 2))
    cylinder_size = cylinder_depth * 0.5
    for h in range(horizontal_step):
        top = face.verts[0].co.lerp(
            face.verts[1].co, (h + 1) / float(horizontal_step + 1))
        bottom = face.verts[3].co.lerp(
            face.verts[2].co, (h + 1) / float(horizontal_step + 1))
        for v in range(vertical_step):
            pos = top.lerp(bottom, (v + 1) / float(vertical_step + 1))
            cylinder_matrix = get_face_matrix(face, pos) @ \
                Matrix.Rotation(radians(90), 3, 'X').to_4x4()
            bmesh.ops.create_cone(bm,
                                  cap_ends=True,
                                  cap_tris=False,
                                  segments=num_segments,
                                  radius1=cylinder_size,
                                  radius2=cylinder_size,
                                  depth=cylinder_depth,
                                  matrix=cylinder_matrix)

# Given a face, adds some weapon turrets to it in a grid pattern.
# Each turret will have a random orientation.
def add_weapons_to_face(bm, face):
    if not face.is_valid or len(face.verts[:]) < 4:
        return
    horizontal_step = randint(1, 2)
    vertical_step = randint(1, 2)
    num_segments = 6
    face_width, face_height = get_face_width_and_height(face)
    weapon_size = 0.5 * min(face_width / (horizontal_step + 2),
                            face_height / (vertical_step + 2))
    weapon_depth = weapon_size * 0.2
    for h in range(horizontal_step):
        top = face.verts[0].co.lerp(
            face.verts[1].co, (h + 1) / float(horizontal_step + 1))
        bottom = face.verts[3].co.lerp(
            face.verts[2].co, (h + 1) / float(horizontal_step + 1))
        for v in range(vertical_step):
            pos = top.lerp(bottom, (v + 1) / float(vertical_step + 1))
            face_matrix = get_face_matrix(face, pos + face.normal * weapon_depth * 0.5) @ \
                Matrix.Rotation(radians(uniform(0, 90)), 3, 'Z').to_4x4()

            # Turret foundation
            bmesh.ops.create_cone(bm,
                                  cap_ends=True,
                                  cap_tris=False,
                                  segments=num_segments,
                                  radius1=weapon_size * 0.45,
                                  radius2=weapon_size * 0.5,
                                  depth=weapon_depth,
                                  matrix=face_matrix)

            # Turret left guard
            left_guard_mat = face_matrix @ \
                Matrix.Rotation(radians(90), 3, 'Y').to_4x4() @ \
                Matrix.Translation(Vector((0, 0, weapon_size * 0.6))).to_4x4()
            bmesh.ops.create_cone(bm,
                                  cap_ends=True,
                                  cap_tris=False,
                                  segments=num_segments,
                                  radius1=weapon_size * 0.3,
                                  radius2=weapon_size * 0.25,
                                  depth=weapon_depth * 2,
                                  matrix=left_guard_mat)

            # Turret right guard
            right_guard_mat = face_matrix @ \
                Matrix.Rotation(radians(90), 3, 'Y').to_4x4() @ \
                Matrix.Translation(Vector((0, 0, weapon_size * -0.6))).to_4x4()
            bmesh.ops.create_cone(bm,
                                  cap_ends=True,
                                  cap_tris=False,
                                  segments=num_segments,
                                  radius1=weapon_size * 0.25,
                                  radius2=weapon_size * 0.3,
                                  depth=weapon_depth * 2,
                                  matrix=right_guard_mat)

            # Turret housing
            upward_angle = uniform(0, 45)
            turret_house_mat = face_matrix @ \
                Matrix.Rotation(radians(upward_angle), 3, 'X').to_4x4() @ \
                Matrix.Translation(Vector((0, weapon_size * -0.4, 0))).to_4x4()
            bmesh.ops.create_cone(bm,
                                  cap_ends=True,
                                  cap_tris=False,
                                  segments=8,
                                  radius1=weapon_size * 0.2,
                                  radius2=weapon_size * 0.2,
                                  depth=weapon_depth * 5,
                                  matrix=turret_house_mat)

            # Turret barrels L + R
            bmesh.ops.create_cone(bm,
                                  cap_ends=True,
                                  cap_tris=False,
                                  segments=8,
                                  radius1=weapon_size * 0.05,
                                  radius2=weapon_size * 0.05,
                                  depth=weapon_depth * 6,
                                  matrix=turret_house_mat @ \
                                         Matrix.Translation(Vector((weapon_size * 0.2, 0, -weapon_size))).to_4x4())
            bmesh.ops.create_cone(bm,
                                  cap_ends=True,
                                  cap_tris=False,
                                  segments=8,
                                  radius1=weapon_size * 0.05,
                                  radius2=weapon_size * 0.05,
                                  depth=weapon_depth * 6,
                                  matrix=turret_house_mat @ \
                                         Matrix.Translation(Vector((weapon_size * -0.2, 0, -weapon_size))).to_4x4())

# Starfighter nose guns - small barrels protruding from front
def add_nose_guns_to_face(bm, face, scale=1.0):
    if not face.is_valid or len(face.verts[:]) < 4:
        return
    face_width, face_height = get_face_width_and_height(face)
    gun_spread = 0.35 * min(face_width, face_height) * scale
    gun_length = uniform(0.15, 0.35) * scale
    gun_radius = uniform(0.01, 0.03) * scale
    num_guns = randint(1, 3)
    top = face.verts[0].co.lerp(face.verts[1].co, 0.5)
    bottom = face.verts[3].co.lerp(face.verts[2].co, 0.5)
    offset_dir = (top - bottom).normalized() if (top - bottom).length > 0.001 else Vector((0, 1, 0))
    for i in range(num_guns):
        t = (i - (num_guns - 1) / 2) * gun_spread
        pos = face.calc_center_bounds() + face.normal * gun_radius + offset_dir * t
        face_matrix = get_face_matrix(face, pos) @ Matrix.Rotation(radians(90), 3, 'X').to_4x4()
        result = bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False,
            segments=6, radius1=gun_radius, radius2=gun_radius, depth=gun_length, matrix=face_matrix)
        for v in result['verts']:
            for f in v.link_faces:
                f.material_index = Material.hull_dark

# Given a face, adds a sphere on the surface, partially inset.
def add_sphere_to_face(bm, face):
    if not face.is_valid:
        return
    face_width, face_height = get_face_width_and_height(face)
    sphere_size = uniform(0.4, 1.0) * min(face_width, face_height)
    sphere_matrix = get_face_matrix(face,
                                    face.calc_center_bounds() - face.normal * \
                                    uniform(0, sphere_size * 0.5))
    result = bmesh.ops.create_icosphere(bm,
                                        subdivisions=2,
                                        radius=sphere_size * 0.5,
                                        matrix=sphere_matrix)
    for vert in result['verts']:
        for face in vert.link_faces:
            face.material_index = Material.hull

# Given a face, adds some pointy intimidating antennas.
def add_surface_antenna_to_face(bm, face, scale=1.0):
    if not face.is_valid or len(face.verts[:]) < 4:
        return
    horizontal_step = randint(2, 5) if scale < 1 else randint(4, 10)
    vertical_step = randint(2, 5) if scale < 1 else randint(4, 10)
    for h in range(horizontal_step):
        top = face.verts[0].co.lerp(
            face.verts[1].co, (h + 1) / float(horizontal_step + 1))
        bottom = face.verts[3].co.lerp(
            face.verts[2].co, (h + 1) / float(horizontal_step + 1))
        for v in range(vertical_step):
            if random() > (0.7 if scale < 1 else 0.9):
                pos = top.lerp(bottom, (v + 1) / float(vertical_step + 1))
                face_size = sqrt(face.calc_area())
                depth = uniform(0.1, 0.5) * face_size * scale
                depth_short = depth * uniform(0.05, 0.2)
                base_diameter = uniform(0.01, 0.06) * scale

                material_index = Material.hull if random() > 0.5 else Material.hull_dark

                # Spire
                num_segments = randint(3, 6)
                result = bmesh.ops.create_cone(bm,
                                               cap_ends=True,
                                               cap_tris=False,
                                               segments=num_segments,
                                               radius1=0,
                                               radius2=base_diameter,
                                               depth=depth,
                                               matrix=get_face_matrix(face, pos + face.normal * depth * 0.5))
                for vert in result['verts']:
                    for vert_face in vert.link_faces:
                        vert_face.material_index = material_index

                # Base
                result = bmesh.ops.create_cone(bm,
                                               cap_ends=True,
                                               cap_tris=False,
                                               segments=num_segments,
                                               radius1=base_diameter * uniform(0.5, 0.75),
                                               radius2=base_diameter * uniform(0.75, 1),
                                               depth=depth_short,
                                               matrix=get_face_matrix(face, pos + face.normal * depth_short * 0.45))
                for vert in result['verts']:
                    for vert_face in vert.link_faces:
                        vert_face.material_index = material_index

# Given a face, adds a glowing "landing pad" style disc.
def add_disc_to_face(bm, face):
    if not face.is_valid:
        return
    face_width, face_height = get_face_width_and_height(face)
    depth = 0.125 * min(face_width, face_height)
    bmesh.ops.create_cone(bm,
                          cap_ends=True,
                          cap_tris=False,
                          segments=8,
                          radius1=depth * 1.5,
                          radius2=depth * 2,
                          depth=depth,
                          matrix=get_face_matrix(face, face.calc_center_bounds() + face.normal * depth * 0.5))
    result = bmesh.ops.create_cone(bm,
                                   cap_ends=False,
                                   cap_tris=False,
                                   segments=8,
                                   radius1=depth * 0.625,
                                   radius2=depth * 1.125,
                                   depth=0.0,
                                   matrix=get_face_matrix(face, face.calc_center_bounds() + face.normal * depth * 1.05))
    for vert in result['verts']:
        for face in vert.link_faces:
            face.material_index = Material.glow_disc

class Material(IntEnum):
    hull = 0            # Plain spaceship hull
    hull_lights = 1     # Spaceship hull with emissive windows
    hull_dark = 2       # Plain Spaceship hull, darkened
    exhaust_burn = 3    # Emissive engine burn material
    glow_disc = 4       # Emissive landing pad disc material


# Returns shader node
def getShaderNode(mat):
    ntree = mat.node_tree
    node_out = ntree.get_output_node('EEVEE')
    shader_node = node_out.inputs['Surface'].links[0].from_node
    return shader_node

def getShaderInput(mat, name):
    shaderNode = getShaderNode(mat)
    return shaderNode.inputs[name]

def add_hull_normal_map(mat, hull_normal_map):
    ntree = mat.node_tree
    shader = getShaderNode(mat)
    links = ntree.links

    teximage_node = ntree.nodes.new('ShaderNodeTexImage')
    teximage_node.image = hull_normal_map
    teximage_node.image.colorspace_settings.name = 'Non-Color'
    tex_coords_node = ntree.nodes.new('ShaderNodeTexCoord')
    mapping_node = ntree.nodes.new('ShaderNodeMapping')
    mapping_node.inputs['Scale'].default_value = (3.0, 3.0, 3.0)
    links.new(tex_coords_node.outputs['UV'], mapping_node.inputs['Vector'])
    links.new(mapping_node.outputs['Vector'], teximage_node.inputs['Vector'])
    normalMap_node = ntree.nodes.new('ShaderNodeNormalMap')
    links.new(teximage_node.outputs[0], normalMap_node.inputs['Color'])
    links.new(normalMap_node.outputs['Normal'], shader.inputs['Normal'])
    return tex_coords_node, mapping_node



def set_hull_mat_basics(mat, color, hull_normal_map=None, metallic=0.4, roughness=0.55):
    shader_node = getShaderNode(mat)
    shader_node.inputs["Base Color"].default_value = color
    shader_node.inputs["Metallic"].default_value = metallic
    shader_node.inputs["Roughness"].default_value = roughness
    if hull_normal_map:
        return add_hull_normal_map(mat, hull_normal_map)
    return None, None

# Creates all our materials and returns them as a list.
def create_materials():
    ret = []

    for material in Material:
        mat = bpy.data.materials.new(name=material.name)
        mat.use_nodes = True
        ret.append(mat)

    hull_base_color = hls_to_rgb(
        random(), uniform(0.04, 0.15), uniform(0.05, 0.3))
    hull_base_color = (hull_base_color[0], hull_base_color[1], hull_base_color[2], 1.0)

    hull_normal_map = None
    textures_dir = resource_path('textures')
    if os.path.isdir(textures_dir):
        norm_path = os.path.join(textures_dir, 'hull_normal.png')
        if os.path.isfile(norm_path):
            hull_normal_map = bpy.data.images.load(norm_path, check_existing=True)


    mat = ret[Material.hull]
    tex_coords_node, mapping_node = set_hull_mat_basics(mat, hull_base_color, hull_normal_map,
        metallic=0.3, roughness=0.65)

    mat = ret[Material.hull_lights]
    tex_coords_node, mapping_node = set_hull_mat_basics(mat, hull_base_color, hull_normal_map,
        metallic=0.25, roughness=0.6)
    ntree = mat.node_tree
    shader_node = getShaderNode(mat)
    links = ntree.links

    emit_path = os.path.join(textures_dir, 'hull_lights_emit.png')
    if os.path.isfile(emit_path):
        if not tex_coords_node:
            tex_coords_node = ntree.nodes.new('ShaderNodeTexCoord')
            mapping_node = ntree.nodes.new('ShaderNodeMapping')
            mapping_node.inputs['Scale'].default_value = (3.0, 3.0, 3.0)
            links.new(tex_coords_node.outputs['UV'], mapping_node.inputs['Vector'])
        uv_out = mapping_node.outputs['Vector'] if mapping_node else tex_coords_node.outputs['UV']
        hull_lights_emit_map = bpy.data.images.load(emit_path, check_existing=True)
        teximage_emit_node = ntree.nodes.new('ShaderNodeTexImage')
        teximage_emit_node.image = hull_lights_emit_map
        links.new(uv_out, teximage_emit_node.inputs['Vector'])
        emit_input = shader_node.inputs.get("Emission Color") or shader_node.inputs.get("Emission")
        if emit_input:
            links.new(teximage_emit_node.outputs[0], emit_input)
        if "Emission Strength" in shader_node.inputs:
            shader_node.inputs["Emission Strength"].default_value = 2.5

    dark_color = [hull_base_color[0] * 0.12, hull_base_color[1] * 0.12,
                  hull_base_color[2] * 0.12, 1.0]
    mat = ret[Material.hull_dark]
    set_hull_mat_basics(mat, dark_color, hull_normal_map,
        metallic=0.4, roughness=0.55)

    # Choose a vivid glow color for the exhaust + glow discs
    glow_hue = choice([
        uniform(0.0, 0.12),   # red/orange
        uniform(0.25, 0.42),  # green/teal
        uniform(0.55, 0.72),  # blue/cyan
        uniform(0.8, 0.95),   # magenta/pink
    ])
    glow_color = hls_to_rgb(glow_hue, uniform(0.55, 0.8), 1.0)
    glow_color = (glow_color[0], glow_color[1], glow_color[2], 1.0)

    mat = ret[Material.exhaust_burn]
    shader_node = getShaderNode(mat)
    shader_node.inputs["Base Color"].default_value = glow_color
    if "Emission Color" in shader_node.inputs:
        shader_node.inputs["Emission Color"].default_value = glow_color
        shader_node.inputs["Emission Strength"].default_value = 12.0
    elif "Emission" in shader_node.inputs:
        shader_node.inputs["Emission"].default_value = glow_color

    mat = ret[Material.glow_disc]
    shader_node = getShaderNode(mat)
    shader_node.inputs["Base Color"].default_value = glow_color
    if "Emission Color" in shader_node.inputs:
        shader_node.inputs["Emission Color"].default_value = glow_color
        shader_node.inputs["Emission Strength"].default_value = 12.0
    elif "Emission" in shader_node.inputs:
        shader_node.inputs["Emission"].default_value = glow_color

    return ret

# Generates a textured spaceship mesh and returns the object.
# Just uses global cube texture coordinates rather than generating UVs.
# Takes an optional random seed value to generate a specific spaceship.
# Allows overriding of some parameters that affect generation.
def generate_spaceship(random_seed='',
                       num_hull_segments_min=3,
                       num_hull_segments_max=6,
                       create_asymmetry_segments=True,
                       num_asymmetry_segments_min=1,
                       num_asymmetry_segments_max=5,
                       create_face_detail=True,
                       allow_horizontal_symmetry=True,
                       allow_vertical_symmetry=False,
                       apply_bevel_modifier=True,
                       assign_materials=True):
    if random_seed:
        seed(random_seed)

    # Let's start with a unit BMesh cube scaled randomly
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1)
    scale_vector = Vector(
        (uniform(0.75, 2.0), uniform(0.75, 2.0), uniform(0.75, 2.0)))
    bmesh.ops.scale(bm, vec=scale_vector, verts=bm.verts)

    # Extrude out the hull along the X axis, adding some semi-random perturbations
    for face in bm.faces[:]:
        if abs(face.normal.x) > 0.5:
            hull_segment_length = uniform(0.3, 1)
            num_hull_segments = randrange(num_hull_segments_min, num_hull_segments_max)
            hull_segment_range = range(num_hull_segments)
            for i in hull_segment_range:
                is_last_hull_segment = i == hull_segment_range[-1]
                val = random()
                if val > 0.1:
                    # Most of the time, extrude out the face with some random deviations
                    face = extrude_face(bm, face, hull_segment_length)
                    if random() > 0.75:
                        face = extrude_face(
                            bm, face, hull_segment_length * 0.25)

                    # Maybe apply some scaling
                    if random() > 0.5:
                        sy = uniform(1.2, 1.5)
                        sz = uniform(1.2, 1.5)
                        if is_last_hull_segment or random() > 0.5:
                            sy = 1 / sy
                            sz = 1 / sz
                        scale_face(bm, face, 1, sy, sz)

                    # Maybe apply some sideways translation
                    if random() > 0.5:
                        sideways_translation = Vector(
                            (0, 0, uniform(0.1, 0.4) * scale_vector.z * hull_segment_length))
                        if random() > 0.5:
                            sideways_translation = -sideways_translation
                        bmesh.ops.translate(bm,
                                            vec=sideways_translation,
                                            verts=face.verts)

                    # Maybe add some rotation around Y axis
                    if random() > 0.5:
                        angle = 5
                        if random() > 0.5:
                            angle = -angle
                        bmesh.ops.rotate(bm,
                                         verts=face.verts,
                                         cent=(0, 0, 0),
                                         matrix=Matrix.Rotation(radians(angle), 3, 'Y'))
                else:
                    # Rarely, create a ribbed section of the hull
                    rib_scale = uniform(0.75, 0.95)
                    face = ribbed_extrude_face(
                        bm, face, hull_segment_length, randint(2, 4), rib_scale)

    # Add some large asymmetrical sections of the hull that stick out
    if create_asymmetry_segments:
        for face in bm.faces[:]:
            # Skip any long thin faces as it'll probably look stupid
            if get_aspect_ratio(face) > 4:
                continue
            if random() > 0.85:
                hull_piece_length = uniform(0.1, 0.4)
                for i in range(randrange(num_asymmetry_segments_min, num_asymmetry_segments_max)):
                    face = extrude_face(bm, face, hull_piece_length)

                    # Maybe apply some scaling
                    if random() > 0.25:
                        s = 1 / uniform(1.1, 1.5)
                        scale_face(bm, face, s, s, s)

    # Now the basic hull shape is built, let's categorize + add detail to all the faces
    if create_face_detail:
        engine_faces = []
        grid_faces = []
        antenna_faces = []
        weapon_faces = []
        sphere_faces = []
        disc_faces = []
        cylinder_faces = []
        for face in bm.faces[:]:
            # Skip any long thin faces as it'll probably look stupid
            if get_aspect_ratio(face) > 3:
                continue

            # Spin the wheel! Let's categorize + assign some materials
            val = random()
            if is_rear_face(face):  # rear face
                if not engine_faces or val > 0.75:
                    engine_faces.append(face)
                elif val > 0.5:
                    cylinder_faces.append(face)
                elif val > 0.25:
                    grid_faces.append(face)
                else:
                    face.material_index = Material.hull_lights
            elif face.normal.x > 0.9:  # front face
                if face.normal.dot(face.calc_center_bounds()) > 0 and val > 0.7:
                    antenna_faces.append(face)  # front facing antenna
                    face.material_index = Material.hull_lights
                elif val > 0.4:
                    grid_faces.append(face)
                else:
                    face.material_index = Material.hull_lights
            elif face.normal.z > 0.9:  # top face
                if face.normal.dot(face.calc_center_bounds()) > 0 and val > 0.7:
                    antenna_faces.append(face)  # top facing antenna
                elif val > 0.6:
                    grid_faces.append(face)
                elif val > 0.3:
                    cylinder_faces.append(face)
            elif face.normal.z < -0.9:  # bottom face
                if val > 0.75:
                    disc_faces.append(face)
                elif val > 0.5:
                    grid_faces.append(face)
                elif val > 0.25:
                    weapon_faces.append(face)
            elif abs(face.normal.y) > 0.9:  # side face
                if not weapon_faces or val > 0.75:
                    weapon_faces.append(face)
                elif val > 0.6:
                    grid_faces.append(face)
                elif val > 0.4:
                    sphere_faces.append(face)
                else:
                    face.material_index = Material.hull_lights

        # Now we've categorized, let's actually add the detail
        for face in engine_faces:
            add_exhaust_to_face(bm, face)

        for face in grid_faces:
            add_grid_to_face(bm, face)

        for face in antenna_faces:
            add_surface_antenna_to_face(bm, face)

        for face in weapon_faces:
            add_weapons_to_face(bm, face)

        for face in sphere_faces:
            add_sphere_to_face(bm, face)

        for face in disc_faces:
            add_disc_to_face(bm, face)

        for face in cylinder_faces:
            add_cylinders_to_face(bm, face)

    # Apply horizontal symmetry sometimes
    if allow_horizontal_symmetry and random() > 0.5:
        bmesh.ops.symmetrize(bm, input=bm.verts[:] + bm.edges[:] + bm.faces[:], direction="Y")

    # Apply vertical symmetry sometimes - this can cause spaceship "islands", so disabled by default
    if allow_vertical_symmetry and random() > 0.5:
        bmesh.ops.symmetrize(bm, input=bm.verts[:] + bm.edges[:] + bm.faces[:], direction="Z")

    # Finish up, write the bmesh into a new mesh
    me = bpy.data.meshes.new('Mesh')
    bm.to_mesh(me)
    bm.free()

    # Add the mesh to the scene
    scene = bpy.context.scene
    obj = bpy.data.objects.new('Spaceship', me)
    # scene.objects.link(obj)
    scene.collection.objects.link(obj)

    # Select and make active
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    # scene.objects.active = obj
    # obj.select = True

    # Recenter the object to its center of mass
    bpy.ops.object.origin_set(type='ORIGIN_CENTER_OF_MASS')
    ob = bpy.context.object
    ob.location = (0, 0, 0)

    # Add a fairly broad bevel modifier to angularize shape
    if apply_bevel_modifier:
        bevel_modifier = ob.modifiers.new('Bevel', 'BEVEL')
        bevel_modifier.width = uniform(5, 20)
        bevel_modifier.offset_type = 'PERCENT'
        bevel_modifier.segments = 2
        bevel_modifier.profile = 0.25
        bevel_modifier.limit_method = 'NONE'

    # Add materials to the spaceship
    me = ob.data
    materials = create_materials()
    # materials = []
    for mat in materials:
        if assign_materials:
            me.materials.append(mat)
        else:
            me.materials.append(bpy.data.materials.new(name="Material"))

    return obj

def generate_starfighter(random_seed='', export_path=None, extreme=False):
    if random_seed:
        seed(random_seed)

    bm = bmesh.new()
    hull_style = choice(['long', 'pointed', 'flat', 'stubby', 'hammerhead', 'wedge', 'diamond',
                         'arrowhead', 'arrowhead'])

    if hull_style == 'pointed':
        result = bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False,
            segments=6,
            radius1=uniform(0.15, 0.35),
            radius2=uniform(0.02, 0.08),
            depth=uniform(1.2, 2.0),
            matrix=Matrix.Rotation(radians(90), 4, 'Y'))
        bmesh.ops.scale(bm, vec=Vector((1, uniform(0.5, 0.8), uniform(0.6, 1.0))), verts=bm.verts)

    elif hull_style == 'flat':
        bmesh.ops.create_cube(bm, size=1)
        bmesh.ops.scale(bm, vec=Vector((
            uniform(0.8, 1.4),
            uniform(0.5, 0.9),
            uniform(0.08, 0.2))), verts=bm.verts)

    elif hull_style == 'stubby':
        bmesh.ops.create_cube(bm, size=1)
        bmesh.ops.scale(bm, vec=Vector((
            uniform(0.4, 0.8),
            uniform(0.3, 0.6),
            uniform(0.3, 0.6))), verts=bm.verts)

    elif hull_style == 'hammerhead':
        bmesh.ops.create_cube(bm, size=1)
        bmesh.ops.scale(bm, vec=Vector((
            uniform(0.3, 0.5),
            uniform(0.5, 0.9),
            uniform(0.15, 0.35))), verts=bm.verts)

    elif hull_style == 'diamond':
        bmesh.ops.create_cube(bm, size=1)
        bmesh.ops.scale(bm, vec=Vector((
            uniform(1.0, 1.6),
            uniform(0.25, 0.45),
            uniform(0.25, 0.45))), verts=bm.verts)
        bmesh.ops.rotate(bm, verts=bm.verts, cent=(0, 0, 0),
            matrix=Matrix.Rotation(radians(45), 3, 'X'))
        bmesh.ops.scale(bm, vec=Vector((1, 1, uniform(0.6, 0.9))), verts=bm.verts)

    elif hull_style == 'wedge':
        bmesh.ops.create_cube(bm, size=1)
        bmesh.ops.scale(bm, vec=Vector((
            uniform(0.8, 1.3),
            uniform(0.35, 0.7),
            uniform(0.2, 0.45))), verts=bm.verts)

    elif hull_style == 'arrowhead':
        bmesh.ops.create_cube(bm, size=1)
        rear_w = uniform(0.6, 1.0)
        bmesh.ops.scale(bm, vec=Vector((
            uniform(0.4, 0.7),
            rear_w,
            uniform(0.1, 0.25))), verts=bm.verts)

    else:  # 'long'
        bmesh.ops.create_cube(bm, size=1)
        bmesh.ops.scale(bm, vec=Vector((
            uniform(1.2, 2.0),
            uniform(0.15, 0.35),
            uniform(0.15, 0.4))), verts=bm.verts)

    seg_min, seg_max = (3, 8) if extreme else (1, 4)
    seg_len_min, seg_len_max = (0.15, 0.6) if extreme else (0.1, 0.4)

    for face in bm.faces[:]:
        if abs(face.normal.x) > 0.5:
            hull_segment_length = uniform(seg_len_min, seg_len_max)
            num_hull_segments = randint(seg_min, seg_max)
            for i in range(num_hull_segments):
                is_front = face.normal.x > 0
                face = extrude_face(bm, face, hull_segment_length)

                if random() > (0.2 if extreme else 0.4):
                    sy = uniform(1.1, 1.8 if extreme else 1.5)
                    sz = uniform(1.1, 1.8 if extreme else 1.5)
                    if is_front or random() > 0.5:
                        sy, sz = 1/sy, 1/sz
                    scale_face(bm, face, 1, sy, sz)

                if random() > (0.4 if extreme else 0.7):
                    bmesh.ops.translate(bm, vec=Vector((0, 0, uniform(-0.2 if extreme else -0.1, 0.2 if extreme else 0.1))), verts=face.verts[:])

                if random() > (0.5 if extreme else 0.8):
                    bmesh.ops.rotate(bm, verts=face.verts[:], cent=face.calc_center_bounds(),
                        matrix=Matrix.Rotation(radians(uniform(-15 if extreme else -8, 15 if extreme else 8)), 3, 'Y'))

            if hull_style == 'wedge' and face.normal.x > 0:
                scale_face(bm, face, 1, uniform(0.15, 0.4), uniform(0.2, 0.5))
            elif hull_style == 'hammerhead' and face.normal.x < 0:
                scale_face(bm, face, 1, uniform(0.3, 0.5), uniform(0.4, 0.7))
            elif hull_style == 'arrowhead' and face.normal.x > 0:
                scale_face(bm, face, 1, uniform(0.05, 0.2), uniform(0.3, 0.7))

    # Extreme mode: add asymmetry segments like the original repo
    if extreme:
        for face in bm.faces[:]:
            if get_aspect_ratio(face) > 4:
                continue
            if random() > 0.7:
                piece_len = uniform(0.1, 0.5)
                for _ in range(randint(1, 4)):
                    face = extrude_face(bm, face, piece_len)
                    if random() > 0.25:
                        s = 1 / uniform(1.1, 1.6)
                        scale_face(bm, face, s, s, s)

    raw_max_y = max(v.co.y for v in bm.verts)
    max_y = raw_max_y * 0.62
    max_x = max(v.co.x for v in bm.verts)
    min_x = min(v.co.x for v in bm.verts)
    fuselage_len = max_x - min_x
    fuselage_half_h = max(v.co.z for v in bm.verts)
    wing_base_z = fuselage_half_h * 0.12

    # Add triangular wings (only on +Y side, symmetrize later)
    wing_style = choice([
        'delta', 'swept', 'forward_swept',
        'x_wing', 'x_wing',
        'y_wing', 'y_wing',
        'plus', 'plus',
        'double_delta', 'arrow',
    ])
    wing_span = uniform(1.5, 3.5) if extreme else uniform(0.8, 1.8)
    wing_thickness = choice([
        uniform(0.04, 0.1),    # thin
        uniform(0.04, 0.1),    # thin
        uniform(0.12, 0.25),   # medium
        uniform(0.25, 0.5),    # chunky
    ])
    wing_mat = Material.hull_lights if random() > 0.5 else Material.hull

    def strong_dihedral():
        if random() > 0.5:
            return uniform(25, 55)
        else:
            return uniform(-55, -25)

    def sweep_jitter():
        return uniform(-0.15, 0.15)

    def chord_jitter(scale=0.15):
        return uniform(-scale, scale)

    def insert_bend_verts(verts, root_y, span, bend_y_frac):
        if bend_y_frac <= 0 or bend_y_frac >= 1 or span <= 0:
            return verts
        bend_y = root_y + span * bend_y_frac
        out = []
        for i in range(len(verts)):
            a, b = verts[i], verts[(i + 1) % len(verts)]
            out.append(a)
            ay, by = a[1], b[1]
            if (ay < bend_y < by) or (ay > bend_y > by):
                t = (bend_y - ay) / (by - ay) if abs(by - ay) > 1e-6 else 0.5
                mid = tuple(a[j] * (1 - t) + b[j] * t for j in range(3))
                out.append(mid)
        return out

    def make_wing(verts_coords, thickness, mat_idx, dihedral=0.0, bend=None):
        span = max(co[1] for co in verts_coords) - max_y if verts_coords else 0
        bend_y_frac, dihedral_outer = None, None
        if bend and span > 0.1 and len(verts_coords) >= 3:
            bend_y_frac, dihedral_outer = bend
            bend_y_frac = max(0.2, min(0.8, bend_y_frac))
            verts_coords = insert_bend_verts(verts_coords, max_y, span, bend_y_frac)

        rotated = []
        for co in verts_coords:
            y_off = co[1] - max_y
            if bend_y_frac is not None and span > 0.1:
                bend_off = span * bend_y_frac
                if y_off <= bend_off:
                    z_adj = sin(radians(dihedral)) * y_off
                else:
                    z_bend = sin(radians(dihedral)) * bend_off
                    z_adj = z_bend + sin(radians(dihedral_outer)) * (y_off - bend_off)
            else:
                z_adj = sin(radians(dihedral)) * y_off
            rotated.append(Vector((co[0], co[1], co[2] + z_adj)))

        top_verts = [bm.verts.new(co) for co in rotated]
        bot_verts = [bm.verts.new(co + Vector((0, 0, -thickness))) for co in rotated]
        n = len(top_verts)
        top_face = bm.faces.new(top_verts)
        top_face.material_index = mat_idx
        bot_face = bm.faces.new(list(reversed(bot_verts)))
        bot_face.material_index = mat_idx
        for i in range(n):
            j = (i + 1) % n
            side = bm.faces.new([top_verts[i], top_verts[j], bot_verts[j], bot_verts[i]])
            side.material_index = Material.hull_dark

    def maybe_bend(dihedral, num_verts=3):
        if random() > 0.5 or num_verts != 3:
            return None
        bend_y = uniform(0.35, 0.6)
        delta = uniform(-18, 18)
        outer = max(-60, min(60, dihedral + delta))
        return (bend_y, outer)

    def make_vertical_fin(xz_coords, half_thick, mat_idx):
        front_verts = [bm.verts.new(Vector((xz[0], half_thick, xz[1]))) for xz in xz_coords]
        back_verts = [bm.verts.new(Vector((xz[0], -half_thick, xz[1]))) for xz in xz_coords]
        n = len(front_verts)
        bm.faces.new(front_verts).material_index = mat_idx
        bm.faces.new(list(reversed(back_verts))).material_index = mat_idx
        for i in range(n):
            j = (i + 1) % n
            bm.faces.new([front_verts[i], front_verts[j], back_verts[j], back_verts[i]]).material_index = Material.hull_dark

    dihedral = 0.0
    engine_wing_dihedral = 0.0
    engine_wing_bend = None

    def wing_z_at_span(span_frac, d, bend):
        y_off = wing_span * span_frac
        if not bend or span_frac <= 0:
            return sin(radians(d)) * y_off
        by, outer = bend
        by = max(0.2, min(0.8, by))
        bend_off = wing_span * by
        if y_off <= bend_off:
            return sin(radians(d)) * y_off
        z_bend = sin(radians(d)) * bend_off
        return z_bend + sin(radians(outer)) * (y_off - bend_off)

    if wing_style == 'delta':
        lead = (uniform(0.05, 0.5) + chord_jitter()) * fuselage_len
        trail = (uniform(0.15, 0.55) + chord_jitter()) * fuselage_len
        tip_trail = trail * uniform(0.2, 0.8)
        dihedral = strong_dihedral() if random() > 0.3 else uniform(-15, 15)
        engine_wing_dihedral = dihedral
        engine_wing_bend = maybe_bend(dihedral, 3)
        make_wing([
            (lead, max_y, fuselage_half_h * uniform(0.05, 0.2)),
            (-trail, max_y, fuselage_half_h * uniform(0.05, 0.2)),
            (-tip_trail, max_y + wing_span, fuselage_half_h * uniform(0.05, 0.2)),
        ], wing_thickness, wing_mat, dihedral, engine_wing_bend)

    elif wing_style == 'swept':
        sweep = uniform(0.2, 0.85) + sweep_jitter()
        chord_root = (uniform(0.25, 0.65) + chord_jitter()) * fuselage_len
        chord_tip = chord_root * uniform(0.15, 0.55)
        dihedral = strong_dihedral() if random() > 0.3 else uniform(-15, 15)
        engine_wing_dihedral = dihedral
        engine_wing_bend = maybe_bend(dihedral, 4)
        x_base = (uniform(-0.15, 0.25) + chord_jitter(0.1)) * fuselage_len
        tip_x = x_base - chord_root * 0.5 - sweep * wing_span
        make_wing([
            (x_base + chord_root * (0.45 + chord_jitter(0.15)), max_y, fuselage_half_h * uniform(0.05, 0.2)),
            (x_base - chord_root * (0.45 + chord_jitter(0.15)), max_y, fuselage_half_h * uniform(0.05, 0.2)),
            (tip_x, max_y + wing_span, fuselage_half_h * uniform(0.05, 0.2)),
            (tip_x + chord_tip * (0.9 + chord_jitter(0.2)), max_y + wing_span, fuselage_half_h * uniform(0.05, 0.2)),
        ], wing_thickness, wing_mat, dihedral, engine_wing_bend)

    elif wing_style == 'forward_swept':
        sweep = uniform(0.15, 0.6) + sweep_jitter()
        chord = (uniform(0.2, 0.55) + chord_jitter()) * fuselage_len
        dihedral = strong_dihedral() if random() > 0.3 else uniform(-10, 10)
        engine_wing_dihedral = dihedral
        engine_wing_bend = maybe_bend(dihedral, 4)
        root_front = -chord * uniform(0.2, 0.45)
        root_back = root_front - chord
        tip_front = root_front + sweep * wing_span + chord * uniform(0.2, 0.4)
        tip_back = tip_front - chord * uniform(0.2, 0.5)
        make_wing([
            (root_front, max_y, fuselage_half_h * uniform(0.05, 0.2)),
            (root_back, max_y, fuselage_half_h * uniform(0.05, 0.2)),
            (tip_back, max_y + wing_span, fuselage_half_h * uniform(0.05, 0.2)),
            (tip_front, max_y + wing_span, fuselage_half_h * uniform(0.05, 0.2)),
        ], wing_thickness, wing_mat, dihedral, engine_wing_bend)

    elif wing_style == 'x_wing':
        spread = uniform(18, 55)
        chord = (uniform(0.1, 0.4) + chord_jitter()) * fuselage_len
        tip_chord_ratio = uniform(0.5, 0.9)
        engine_wing_dihedral = spread
        engine_wing_bend = maybe_bend(spread, 3)
        for angle in [spread, -spread]:
            make_wing([
                (chord * (0.5 + chord_jitter()), max_y, fuselage_half_h * uniform(-0.05, 0.15)),
                (-chord * (0.5 + chord_jitter()), max_y, fuselage_half_h * uniform(-0.05, 0.15)),
                (-chord * tip_chord_ratio, max_y + wing_span, fuselage_half_h * uniform(-0.05, 0.15)),
            ], wing_thickness, wing_mat, angle, engine_wing_bend if angle == spread else maybe_bend(angle, 3))

    elif wing_style == 'double_delta':
        dihedral = strong_dihedral() if random() > 0.3 else uniform(-15, 15)
        engine_wing_dihedral = dihedral
        engine_wing_bend = maybe_bend(dihedral, 3)
        root_lead = fuselage_len * (uniform(0.08, 0.25) + chord_jitter(0.08))
        root_trail = -fuselage_len * (uniform(0.2, 0.4) + chord_jitter(0.08))
        tip_trail = root_trail + wing_span * uniform(-0.15, 0.1)
        make_wing([
            (root_lead, max_y, fuselage_half_h * uniform(0.05, 0.2)),
            (root_trail, max_y, fuselage_half_h * uniform(0.05, 0.2)),
            (tip_trail, max_y + wing_span, fuselage_half_h * uniform(0.05, 0.2)),
        ], wing_thickness, wing_mat, dihedral, engine_wing_bend)
        canard_span = wing_span * uniform(0.25, 0.55)
        canard_x = (uniform(0.08, 0.35) + chord_jitter(0.08)) * fuselage_len
        canard_chord = fuselage_len * uniform(0.06, 0.15)
        make_wing([
            (canard_x + canard_chord, max_y, fuselage_half_h * uniform(0.1, 0.25)),
            (canard_x, max_y, fuselage_half_h * uniform(0.1, 0.25)),
            (canard_x - fuselage_len * (uniform(0.02, 0.08) + chord_jitter(0.03)), max_y + canard_span, fuselage_half_h * uniform(0.1, 0.25)),
        ], wing_thickness * 0.7, Material.hull_dark, -dihedral * uniform(0.25, 0.8))

    elif wing_style == 'arrow':
        arrow_sweep = uniform(0.35, 0.9) + sweep_jitter()
        dihedral = strong_dihedral()
        engine_wing_dihedral = dihedral
        engine_wing_bend = maybe_bend(dihedral, 4)
        root_lead = fuselage_len * (uniform(0.12, 0.3) + chord_jitter(0.06))
        root_trail = -fuselage_len * (uniform(0.05, 0.2) + chord_jitter(0.04))
        tip_sweep = arrow_sweep * wing_span * uniform(0.4, 0.6)
        tip_lead_sweep = arrow_sweep * wing_span * uniform(0.2, 0.4)
        make_wing([
            (root_lead, max_y, fuselage_half_h * uniform(0.02, 0.12)),
            (root_trail, max_y, fuselage_half_h * uniform(0.02, 0.12)),
            (root_trail - tip_sweep, max_y + wing_span, fuselage_half_h * uniform(0.02, 0.12)),
            (root_lead - tip_lead_sweep, max_y + wing_span * uniform(0.7, 0.95), fuselage_half_h * uniform(0.02, 0.12)),
        ], wing_thickness, wing_mat, dihedral, engine_wing_bend)

    elif wing_style == 'y_wing':
        dihedral = uniform(-55, -30)
        engine_wing_dihedral = dihedral
        engine_wing_bend = maybe_bend(dihedral, 4)
        chord = (uniform(0.15, 0.5) + chord_jitter()) * fuselage_len
        tip_te = -chord * uniform(0.5, 0.75)
        tip_le = chord * uniform(0.2, 0.45)
        make_wing([
            (chord * (0.45 + chord_jitter()), max_y, fuselage_half_h * uniform(-0.05, 0.1)),
            (-chord * (0.45 + chord_jitter()), max_y, fuselage_half_h * uniform(-0.05, 0.1)),
            (tip_te, max_y + wing_span, fuselage_half_h * uniform(-0.05, 0.1)),
            (tip_le, max_y + wing_span * uniform(0.8, 0.95), fuselage_half_h * uniform(-0.05, 0.1)),
        ], wing_thickness, wing_mat, dihedral, engine_wing_bend)

    elif wing_style == 'plus':
        chord = (uniform(0.18, 0.5) + chord_jitter()) * fuselage_len
        dihedral = uniform(-12, 12) if random() > 0.5 else 0.0
        engine_wing_dihedral = dihedral
        engine_wing_bend = maybe_bend(dihedral, 4) if dihedral != 0 else None
        tip_te = -chord * uniform(0.5, 0.75)
        tip_le = chord * uniform(0.2, 0.45)
        make_wing([
            (chord * (0.45 + chord_jitter()), max_y, fuselage_half_h * uniform(-0.05, 0.1)),
            (-chord * (0.45 + chord_jitter()), max_y, fuselage_half_h * uniform(-0.05, 0.1)),
            (tip_te, max_y + wing_span, fuselage_half_h * uniform(-0.05, 0.1)),
            (tip_le, max_y + wing_span * uniform(0.8, 0.95), fuselage_half_h * uniform(-0.05, 0.1)),
        ], wing_thickness, wing_mat, dihedral, engine_wing_bend)
        fin_h = wing_span * uniform(0.45, 0.95)
        fin_chord = chord * uniform(0.55, 1.1)
        fin_thick = wing_thickness * uniform(0.4, 0.65)
        fin_lead = fin_chord * (0.35 + chord_jitter(0.15))
        fin_trail = -fin_chord * (0.45 + chord_jitter(0.15))
        make_vertical_fin([
            (fin_lead, fuselage_half_h),
            (fin_trail, fuselage_half_h),
            (fin_trail * (1 + chord_jitter(0.15)), fuselage_half_h + fin_h),
            (fin_chord * (0.15 + chord_jitter(0.15)), fuselage_half_h + fin_h * uniform(0.75, 0.9)),
        ], fin_thick, wing_mat)
        make_vertical_fin([
            (fin_lead, -fuselage_half_h),
            (fin_trail, -fuselage_half_h),
            (fin_trail * (1 + chord_jitter(0.15)), -fuselage_half_h - fin_h),
            (fin_chord * (0.15 + chord_jitter(0.15)), -fuselage_half_h - fin_h * uniform(0.75, 0.9)),
        ], fin_thick, wing_mat)

    # Engine/turret parameters - geometry placed as child objects after all modifiers
    eng_r = uniform(0.04, 0.1)
    eng_len = uniform(0.15, 0.35)
    eng_placement = choice(['wing_tip', 'rear', 'both'])
    num_turrets = randint(1, 2)
    turret_size = uniform(0.04, 0.08)
    barrel_len = turret_size * 2.5
    rear_eng_r = eng_r * (0.7 if eng_placement == 'both' else 1.2)
    rear_eng_len = eng_len * 1.2

    bmesh.ops.symmetrize(bm, input=bm.verts[:] + bm.edges[:] + bm.faces[:], direction="Y")

    engine_faces = []
    grid_faces = []
    antenna_faces = []
    nose_gun_faces = []
    cylinder_faces = []
    detail_scale = 0.5

    for face in bm.faces[:]:
        if get_aspect_ratio(face) > 4:
            continue
        # Skip tiny faces
        if face.calc_area() < 0.005:
            continue
        val = random()
        if is_rear_face(face):
            if not engine_faces or val > 0.6:
                engine_faces.append(face)
            elif val > 0.3:
                grid_faces.append(face)
            else:
                face.material_index = Material.hull_lights
        elif face.normal.x > 0.9:
            if val > 0.5:
                nose_gun_faces.append(face)
            elif val > 0.3:
                grid_faces.append(face)
            else:
                face.material_index = Material.hull_lights
        elif abs(face.normal.z) > 0.7:
            if val > 0.55:
                grid_faces.append(face)
            elif val > 0.3:
                cylinder_faces.append(face)
            else:
                face.material_index = Material.hull_lights
        elif abs(face.normal.y) > 0.7:
            if val > 0.65:
                antenna_faces.append(face)
            elif val > 0.35:
                grid_faces.append(face)
            else:
                face.material_index = Material.hull_lights

    for face in engine_faces:
        add_exhaust_to_face(bm, face)
    for face in grid_faces:
        add_grid_to_face(bm, face, detail_scale)
    for face in antenna_faces:
        add_surface_antenna_to_face(bm, face, detail_scale)
    for face in nose_gun_faces:
        add_nose_guns_to_face(bm, face, detail_scale)
    for face in cylinder_faces:
        add_cylinders_to_face(bm, face)

    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=0.0001)

    me = bpy.data.meshes.new('Mesh')
    bm.to_mesh(me)
    bm.free()

    scene = bpy.context.scene
    obj = bpy.data.objects.new('Spaceship', me)
    scene.collection.objects.link(obj)
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)

    bpy.ops.object.origin_set(type='ORIGIN_CENTER_OF_MASS')
    ob = bpy.context.object
    ob.location = (0, 0, 0)

    ob.rotation_euler = (0, 0, radians(-90))
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=False)

    bevel_modifier = ob.modifiers.new('Bevel', 'BEVEL')
    bevel_modifier.width = uniform(3, 10)
    bevel_modifier.offset_type = 'PERCENT'
    bevel_modifier.segments = 1
    bevel_modifier.profile = 0.25
    bevel_modifier.limit_method = 'NONE'

    decimate = ob.modifiers.new('Decimate', 'DECIMATE')
    decimate.decimate_type = 'COLLAPSE'
    decimate.ratio = 0.12 if extreme else 0.35

    bpy.ops.object.modifier_apply(modifier='Bevel')
    bpy.ops.object.modifier_apply(modifier='Decimate')

    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.mesh.normals_make_consistent(inside=False)
    bpy.ops.uv.smart_project(angle_limit=radians(66), island_margin=0.01)
    bpy.ops.object.mode_set(mode='OBJECT')

    # Normalize scale so longest axis = TARGET_SIZE
    TARGET_SIZE = 4.0
    bbox = [ob.matrix_world @ Vector(corner) for corner in ob.bound_box]
    dims = Vector((
        max(v.x for v in bbox) - min(v.x for v in bbox),
        max(v.y for v in bbox) - min(v.y for v in bbox),
        max(v.z for v in bbox) - min(v.z for v in bbox),
    ))
    longest = max(dims)
    s = TARGET_SIZE / longest if longest > 0.001 else 1.0
    if longest > 0.001:
        ob.scale = (s, s, s)
        bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)

    # Re-center final mesh on lateral axis so mirrored attachments stay visually centered.
    fv = [v.co.copy() for v in ob.data.vertices]
    pre_sx_max = max(v.x for v in fv)
    pre_sx_min = min(v.x for v in fv)
    centerline_x = (pre_sx_max + pre_sx_min) * 0.5
    if abs(centerline_x) > 1e-4:
        ob.data.transform(Matrix.Translation(Vector((-centerline_x, 0, 0))))
        ob.data.update()

    materials = create_materials()
    for mat in materials:
        me.materials.append(mat)

    # Snap attachment points to the actual final mesh (post-bevel/decimate/scale)
    fv = [v.co.copy() for v in ob.data.vertices]
    sx_max = max(v.x for v in fv)
    sx_min = min(v.x for v in fv)
    sy_max = max(v.y for v in fv)
    sy_min = min(v.y for v in fv)
    sz_max = max(v.z for v in fv)
    centerline_x = (sx_max + sx_min) * 0.5
    span_half = max(abs(sx_max - centerline_x), abs(sx_min - centerline_x))
    er_s = eng_r * s
    el_s = eng_len * s
    ts_s = turret_size * s
    bl_s = barrel_len * s

    depsgraph = bpy.context.evaluated_depsgraph_get()
    eval_ob = ob.evaluated_get(depsgraph)

    def snap(point_local):
        hit, loc, normal, _ = eval_ob.closest_point_on_mesh(point_local)
        return (loc, normal) if hit else None

    def pick_best(candidates, normal_min_z=0.0, min_abs_x=0.0):
        best = None
        best_z = -1e9
        for p in candidates:
            hit = snap(p)
            if not hit:
                continue
            loc, normal = hit
            if normal.z < normal_min_z:
                continue
            if abs(loc.x - centerline_x) < min_abs_x:
                continue
            if loc.z > best_z:
                best_z = loc.z
                best = (loc, normal)
        return best

    eng_idx = 0
    thr_idx = 0

    def place_engine_pair(y_samples, x_frac, radius_s, normal_min_z, min_abs_x):
        best_pair = None
        best_score = -1e9
        for t in y_samples:
            y = sy_min + (sy_max - sy_min) * t
            x = span_half * x_frac
            right_hit = snap(Vector((centerline_x + x, y, sz_max + radius_s * 8)))
            left_hit = snap(Vector((centerline_x - x, y, sz_max + radius_s * 8)))
            if not right_hit or not left_hit:
                continue
            (r_loc, r_normal) = right_hit
            (l_loc, l_normal) = left_hit
            if r_normal.z < normal_min_z or l_normal.z < normal_min_z:
                continue
            if abs(r_loc.x - centerline_x) < min_abs_x or abs(l_loc.x - centerline_x) < min_abs_x:
                continue
            score = r_loc.z + l_loc.z + (r_loc.y + l_loc.y) * 0.15
            if score > best_score:
                best_score = score
                best_pair = ((r_loc, r_normal), (l_loc, l_normal))
        if not best_pair:
            return None

        (r_loc, r_normal), (l_loc, l_normal) = best_pair
        y_sym = (r_loc.y + l_loc.y) * 0.5
        z_sym = (r_loc.z + l_loc.z) * 0.5
        x_sym = max(abs(r_loc.x - centerline_x), abs(l_loc.x - centerline_x))
        right_pos = Vector((centerline_x + x_sym, y_sym, z_sym)) + Vector((radius_s * 0.55, 0, radius_s * 0.45))
        left_pos = Vector((centerline_x - x_sym, y_sym, z_sym)) + Vector((-radius_s * 0.55, 0, radius_s * 0.45))
        return (right_pos, left_pos)

    def fallback_engine_pair(y_min_frac, y_max_frac, x_min_frac, radius_s):
        y0 = sy_min + (sy_max - sy_min) * y_min_frac
        y1 = sy_min + (sy_max - sy_min) * y_max_frac
        right_pool = [
            v for v in fv
            if (v.x - centerline_x) > span_half * x_min_frac and y0 <= v.y <= y1
        ]
        if not right_pool:
            right_pool = [v for v in fv if (v.x - centerline_x) > span_half * x_min_frac]
        if not right_pool:
            right_pool = [max(fv, key=lambda v: v.x)]
        anchor = max(right_pool, key=lambda v: v.z)
        x_off = abs(anchor.x - centerline_x)
        right_pos = Vector((centerline_x + x_off, anchor.y, anchor.z)) + Vector((radius_s * 0.55, 0, radius_s * 0.45))
        left_pos = Vector((centerline_x - x_off, anchor.y, anchor.z)) + Vector((-radius_s * 0.55, 0, radius_s * 0.45))
        return (right_pos, left_pos)

    if eng_placement in ('wing_tip', 'both'):
        pair = place_engine_pair(
            y_samples=[0.22, 0.32, 0.42, 0.52, 0.62],
            x_frac=0.88,
            radius_s=er_s,
            normal_min_z=0.1,
            min_abs_x=span_half * 0.35,
        )
        if not pair:
            pair = fallback_engine_pair(
                y_min_frac=0.2,
                y_max_frac=0.65,
                x_min_frac=0.45,
                radius_s=er_s,
            )
        if pair:
            for pos in pair:
                create_engine_child(ob, f'engine_{eng_idx}', pos, eng_r, eng_len, s, materials)
                add_point_marker(ob, f'thruster_{thr_idx}', pos + Vector((0, el_s * 0.65, 0)))
                eng_idx += 1
                thr_idx += 1

    if eng_placement in ('rear', 'both'):
        rear_radius_s = rear_eng_r * s
        rear_len_s = rear_eng_len * s
        pair = place_engine_pair(
            y_samples=[0.72, 0.80, 0.88, 0.94],
            x_frac=0.28,
            radius_s=rear_radius_s,
            normal_min_z=-0.2,
            min_abs_x=span_half * 0.08,
        )
        if not pair:
            pair = fallback_engine_pair(
                y_min_frac=0.68,
                y_max_frac=0.98,
                x_min_frac=0.08,
                radius_s=rear_radius_s,
            )
        if pair:
            for pos in pair:
                create_engine_child(ob, f'engine_{eng_idx}', pos, rear_eng_r, rear_eng_len, s, materials)
                add_point_marker(ob, f'thruster_{thr_idx}', pos + Vector((0, rear_len_s * 0.65, 0)))
                eng_idx += 1
                thr_idx += 1

    if num_turrets == 1:
        candidates = [
            Vector((centerline_x, sy_min * 0.92, sz_max + ts_s * 5)),
            Vector((centerline_x, sy_min * 0.75, sz_max + ts_s * 5)),
        ]
        best = pick_best(candidates, normal_min_z=0.1, min_abs_x=0.0)
        if best:
            loc, normal = best
            pos = loc + normal * (ts_s * 0.5)
        else:
            pos = Vector((centerline_x, sy_min * 0.85, sz_max * 0.3 + ts_s * 0.5))
        create_turret_child(ob, f'turret_0', pos, turret_size, barrel_len, s, materials)
        add_point_marker(ob, f'weapon_0', pos + Vector((0, -(ts_s * 0.6 + bl_s), 0)))
    else:
        for i, side in enumerate([1, -1]):
            x_target = centerline_x + side * span_half * 0.58
            candidates = [
                Vector((x_target, sy_min + (sy_max - sy_min) * 0.35, sz_max + ts_s * 5)),
                Vector((x_target, sy_min + (sy_max - sy_min) * 0.5, sz_max + ts_s * 5)),
            ]
            best = pick_best(candidates, normal_min_z=0.12, min_abs_x=span_half * 0.25)
            if best:
                loc, normal = best
                pos = loc + normal * (ts_s * 0.5)
            else:
                pos = Vector((x_target, sy_min + (sy_max - sy_min) * 0.45, sz_max * 0.25 + ts_s * 0.5))
            create_turret_child(ob, f'turret_{i}', pos, turret_size, barrel_len, s, materials)
            add_point_marker(ob, f'weapon_{i}', pos + Vector((0, -(ts_s * 0.6 + bl_s), 0)))

    return obj

def get_output_dir():
    base = os.path.join(DIR, '..', 'public', 'ships')
    for i, arg in enumerate(sys.argv):
        if arg == '--subdir' and i + 1 < len(sys.argv):
            return os.path.join(base, sys.argv[i + 1])
    return base

OUTPUT_DIR = get_output_dir()

def export_glb(obj, filepath):
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    for child in obj.children_recursive:
        child.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.export_scene.gltf(
        filepath=filepath,
        export_format='GLB',
        use_selection=True,
        export_apply=True,
        export_materials='EXPORT',
        export_image_format='AUTO',
        export_texcoords=True,
        export_normals=True,
    )

def next_available_index(directory, prefix='starfighter-', ext='.glb'):
    existing = set()
    if os.path.isdir(directory):
        for f in os.listdir(directory):
            if f.startswith(prefix) and f.endswith(ext):
                try:
                    num = int(f[len(prefix):-len(ext)])
                    existing.add(num)
                except ValueError:
                    pass
    return max(existing) + 1 if existing else 0

# Parse flags from argv (after the -- separator blender uses)
EXTREME_MODE = '--extreme' in sys.argv
OVERWRITE_MODE = '--overwrite' in sys.argv

if __name__ == "__main__":

    generate_single_spaceship = True

    if generate_single_spaceship:
        os.makedirs(OUTPUT_DIR, exist_ok=True)
        start_idx = 0 if OVERWRITE_MODE else next_available_index(OUTPUT_DIR)
        num_ships = 10
        if EXTREME_MODE:
            print(f'=== EXTREME MODE ===')
        print(f'Starting at index {start_idx}')
        for i in range(num_ships):
            idx = start_idx + i
            reset_scene()
            obj = generate_starfighter(
                random_seed=str(idx * 7777 + 42),
                extreme=EXTREME_MODE)
            output_path = os.path.join(OUTPUT_DIR, f'starfighter-{idx}.glb')
            export_glb(obj, output_path)
            print(f'Exported {i + 1}/{num_ships} to {output_path}')
    else:
        # Export a movie showcasing many different kinds of ships

        # Settings
        output_path = '' # leave empty to use script folder
        total_movie_duration = 16
        total_spaceship_duration = 1
        yaw_rate = 45 # degrees/sec
        yaw_offset = 220 # degrees/sec
        camera_pole_rate = 1
        camera_pole_pitch_min = 15 # degrees
        camera_pole_pitch_max = 30 # degrees
        camera_pole_pitch_offset = 0 # degrees
        camera_pole_length = 10
        camera_refocus_object_every_frame = False
        fov = 60 # degrees
        fps = 30
        res_x = 1920
        res_y = 1080

        # Batch render the movie frames
        inv_fps = 1/float(fps)
        movie_duration = 0
        spaceship_duration = total_spaceship_duration
        scene = bpy.data.scenes["Scene"]
        scene.render.resolution_x = res_x
        scene.render.resolution_y = res_y
        scene.camera.rotation_mode = 'XYZ'
        scene.camera.data.angle = radians(fov)
        frame = 0
        timestamp = datetime.datetime.now().strftime('%Y%m%d_%H%M%S')
        while movie_duration < total_movie_duration:
            movie_duration += inv_fps
            spaceship_duration += inv_fps
            if spaceship_duration >= total_spaceship_duration:
                spaceship_duration -= total_spaceship_duration

                # Generate a new spaceship
                reset_scene()
                obj = generate_spaceship()

                # look for a mirror plane in the scene, and position it just underneath the ship if found
                lowest_z = centre = min((Vector(b).z for b in obj.bound_box))
                plane_obj = bpy.data.objects['Plane'] if 'Plane' in bpy.data.objects else None
                if plane_obj:
                    plane_obj.location.z = lowest_z - 0.3

            # Position and orient the camera
            rad = radians(yaw_offset + (yaw_rate * movie_duration))
            camera_pole_pitch_lerp = 0.5 * (1 + cos(camera_pole_rate * movie_duration)) # 0-1
            camera_pole_pitch = camera_pole_pitch_max * camera_pole_pitch_lerp + \
                                camera_pole_pitch_min * (1 - camera_pole_pitch_lerp)
            scene.camera.rotation_euler = (radians(90 - camera_pole_pitch + camera_pole_pitch_offset), 0, rad)
            scene.camera.location = (sin(rad) * camera_pole_length,
                                     cos(rad) * -camera_pole_length,
                                     sin(radians(camera_pole_pitch))*camera_pole_length)
            if camera_refocus_object_every_frame:
                bpy.ops.view3d.camera_to_view_selected()

            # Render the scene to disk
            script_path = bpy.context.space_data.text.filepath if bpy.context.space_data else __file__
            folder = output_path if output_path else os.path.split(os.path.realpath(script_path))[0]
            filename = os.path.join('renders', timestamp, timestamp + '_' + str(frame).zfill(5) + '.png')
            bpy.data.scenes['Scene'].render.filepath = os.path.join(folder, filename)
            print('Rendering frame ' + str(frame) + '...')
            bpy.ops.render.render(write_still=True)
            frame += 1