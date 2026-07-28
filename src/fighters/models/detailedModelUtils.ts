import * as THREE from "three";

export interface LoftSection {
  z: number;
  halfWidth: number;
  top: number;
  shoulder: number;
  bottom: number;
}

export interface DetailedRenderStats {
  triangles: number;
  meshDraws: number;
  lineDraws: number;
}

export function standard(
  color: number,
  roughness: number,
  metalness: number,
  flatShading: boolean,
): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color,
    roughness,
    metalness,
    flatShading,
    side: THREE.DoubleSide,
  });
}

export function emissive(
  color: number,
  intensity = 1.7,
): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color,
    emissive: color,
    emissiveIntensity: intensity,
    roughness: 0.38,
    metalness: 0.12,
  });
}

export function loftGeometry(
  sections: readonly LoftSection[],
): THREE.BufferGeometry {
  const ringSize = 8;
  const positions: number[] = [];
  for (const section of sections) {
    const upperDrop = section.top - section.shoulder;
    const lowerRise = section.shoulder - section.bottom;
    const ring: Array<[number, number]> = [
      [0, section.top],
      [section.halfWidth * 0.62, section.top - upperDrop * 0.42],
      [section.halfWidth, section.shoulder],
      [section.halfWidth * 0.78, section.bottom + lowerRise * 0.34],
      [0, section.bottom],
      [-section.halfWidth * 0.78, section.bottom + lowerRise * 0.34],
      [-section.halfWidth, section.shoulder],
      [-section.halfWidth * 0.62, section.top - upperDrop * 0.42],
    ];
    for (const [x, y] of ring) positions.push(x, y, section.z);
  }

  const indices: number[] = [];
  for (let section = 0; section < sections.length - 1; section += 1) {
    const current = section * ringSize;
    const next = current + ringSize;
    for (let point = 0; point < ringSize; point += 1) {
      const pointNext = (point + 1) % ringSize;
      indices.push(
        current + point,
        next + point,
        next + pointNext,
        current + point,
        next + pointNext,
        current + pointNext,
      );
    }
  }
  for (let point = 1; point < ringSize - 1; point += 1) {
    indices.push(0, point + 1, point);
  }
  const rear = (sections.length - 1) * ringSize;
  for (let point = 1; point < ringSize - 1; point += 1) {
    indices.push(rear, rear + point, rear + point + 1);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

export function prismMesh(
  points: readonly [number, number][],
  thickness: number,
  material: THREE.Material,
): THREE.Mesh {
  const shapePoints = points.map(([x, z]) => new THREE.Vector2(x, z));
  const triangles = THREE.ShapeUtils.triangulateShape(shapePoints, []);
  const positions: number[] = [];
  const indices: number[] = [];
  const halfThickness = thickness * 0.5;
  for (const y of [halfThickness, -halfThickness]) {
    for (const [x, z] of points) positions.push(x, y, z);
  }
  const count = points.length;
  for (const triangle of triangles) {
    indices.push(triangle[0], triangle[1], triangle[2]);
    indices.push(count + triangle[2], count + triangle[1], count + triangle[0]);
  }
  for (let point = 0; point < count; point += 1) {
    const next = (point + 1) % count;
    indices.push(point, next, count + next, point, count + next, count + point);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return new THREE.Mesh(geometry, material);
}

export function verticalSurfaceMesh(
  points: readonly [number, number][],
  thickness: number,
  material: THREE.Material,
): THREE.Mesh {
  const shape = new THREE.Shape();
  shape.moveTo(points[0][0], points[0][1]);
  for (let point = 1; point < points.length; point += 1) {
    shape.lineTo(points[point][0], points[point][1]);
  }
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: thickness,
    bevelEnabled: false,
    curveSegments: 1,
  });
  geometry.translate(0, 0, -thickness * 0.5);
  geometry.rotateY(Math.PI / 2);
  geometry.computeVertexNormals();
  return new THREE.Mesh(geometry, material);
}

export function quadMesh(
  points: readonly [number, number, number][],
  material: THREE.Material,
): THREE.Mesh {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(points.flat(), 3),
  );
  geometry.setIndex([0, 1, 2, 0, 2, 3]);
  geometry.computeVertexNormals();
  return new THREE.Mesh(geometry, material);
}

export function cylinderAlongZ(
  frontRadius: number,
  rearRadius: number,
  length: number,
  segments: number,
  material: THREE.Material,
  openEnded = false,
): THREE.Mesh {
  const cylinder = new THREE.Mesh(
    new THREE.CylinderGeometry(
      frontRadius,
      rearRadius,
      length,
      segments,
      1,
      openEnded,
    ),
    material,
  );
  cylinder.rotation.x = Math.PI / 2;
  return cylinder;
}

export function cylinderBetween(
  start: THREE.Vector3,
  end: THREE.Vector3,
  radius: number,
  segments: number,
  material: THREE.Material,
  name = "gear-strut",
): THREE.Mesh {
  const direction = end.clone().sub(start);
  const cylinder = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius, direction.length(), segments),
    material,
  );
  cylinder.name = name;
  cylinder.position.copy(start).add(end).multiplyScalar(0.5);
  cylinder.quaternion.setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    direction.normalize(),
  );
  return cylinder;
}

export function lineSegments(
  points: readonly number[][],
  material: THREE.LineBasicMaterial,
): THREE.LineSegments {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(points.flat(), 3),
  );
  return new THREE.LineSegments(geometry, material);
}

export function mirrorPlanform(
  points: readonly [number, number][],
  side: number,
): [number, number][] {
  return points.map(([x, z]) => [x * side, z]);
}

export function collectRenderStats(root: THREE.Object3D): DetailedRenderStats {
  let triangles = 0;
  let meshDraws = 0;
  let lineDraws = 0;
  root.traverse((object) => {
    if (object instanceof THREE.Mesh) {
      const geometry = object.geometry;
      triangles += geometry.index
        ? geometry.index.count / 3
        : geometry.getAttribute("position").count / 3;
      meshDraws += Array.isArray(object.material) ? object.material.length : 1;
    } else if (
      object instanceof THREE.Line ||
      object instanceof THREE.LineSegments
    ) {
      lineDraws += 1;
    }
  });
  return {
    triangles: Math.round(triangles),
    meshDraws,
    lineDraws,
  };
}

export function disposeDetailedRoot(root: THREE.Group): void {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  root.traverse((object) => {
    if (
      object instanceof THREE.Mesh ||
      object instanceof THREE.Line ||
      object instanceof THREE.LineSegments
    ) {
      geometries.add(object.geometry);
      if (Array.isArray(object.material)) {
        object.material.forEach((material) => materials.add(material));
      } else {
        materials.add(object.material);
      }
    }
  });
  geometries.forEach((geometry) => geometry.dispose());
  materials.forEach((material) => material.dispose());
  root.clear();
}
