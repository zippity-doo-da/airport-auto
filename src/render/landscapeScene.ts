import * as THREE from "three";
import type { AirportConfig } from "../simulation/airportConfig";

export interface LandscapeDimensions {
  width: number;
  height: number;
  detailedWidth: number;
  detailedHeight: number;
  panX: number;
  panY: number;
}

export interface LandscapeBuildDiagnostics {
  instancedDrawGroups: number;
  instances: number;
  districtInstances: number;
  highwayInstances: number;
}

interface InstanceTransform {
  position: THREE.Vector3;
  scale: THREE.Vector3;
  rotation: number;
}

export function landscapeDimensions(
  config: Pick<AirportConfig, "scope">,
): LandscapeDimensions {
  return config.scope === "center"
    ? {
        width: 16000,
        height: 12000,
        detailedWidth: 4000,
        detailedHeight: 3000,
        panX: 5200,
        panY: 3900,
      }
    : {
        width: 9600,
        height: 7200,
        detailedWidth: 2400,
        detailedHeight: 1800,
        panX: 3000,
        panY: 2200,
      };
}

function createInstances(
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  transforms: readonly InstanceTransform[],
): THREE.InstancedMesh {
  const mesh = new THREE.InstancedMesh(geometry, material, transforms.length);
  const dummy = new THREE.Object3D();
  transforms.forEach((transform, index) => {
    dummy.position.copy(transform.position);
    dummy.rotation.set(0, 0, transform.rotation);
    dummy.scale.copy(transform.scale);
    dummy.updateMatrix();
    mesh.setMatrixAt(index, dummy.matrix);
  });
  mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
  mesh.computeBoundingSphere();
  return mesh;
}

export function buildLandscape(
  root: THREE.Group,
  config: AirportConfig,
  dimensions: LandscapeDimensions,
): LandscapeBuildDiagnostics {
  const terrainColors = {
    coast: { ground: 0x6f8068, district: 0x829071 },
    highland: { ground: 0x756f55, district: 0x918868 },
    woodland: { ground: 0x4f6852, district: 0x687a5c },
  }[config.terrain];
  const groundMaterial = new THREE.MeshStandardMaterial({
    color: terrainColors.ground,
    roughness: 1,
  });
  groundMaterial.name = "environment:terrain";
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(dimensions.width, dimensions.height),
    groundMaterial,
  );
  ground.position.z = 1.24;
  ground.receiveShadow = true;
  root.add(ground);

  if (config.contextData) {
    return {
      instancedDrawGroups: 0,
      instances: 0,
      districtInstances: 0,
      highwayInstances: 0,
    };
  }

  const districtTransforms: InstanceTransform[] = [];
  for (let row = -3; row <= 3; row += 1) {
    for (let column = -4; column <= 4; column += 1) {
      if (Math.abs(row) <= 1 && Math.abs(column) <= 1) continue;
      districtTransforms.push({
        position: new THREE.Vector3(column * 70, row * 58, 1.26),
        scale: new THREE.Vector3(48, 30, 1),
        rotation: (row + column) * 0.035,
      });
    }
  }
  const districtMaterial = new THREE.MeshStandardMaterial({
    color: terrainColors.district,
    roughness: 1,
  });
  districtMaterial.name = "environment:district";
  const districts = createInstances(
    new THREE.PlaneGeometry(1, 1),
    districtMaterial,
    districtTransforms,
  );
  districts.name = "instanced-landscape-districts";
  districts.receiveShadow = true;
  root.add(districts);

  const pavementTransforms: InstanceTransform[] = [];
  const laneTransforms: InstanceTransform[] = [];
  if (config.scope === "center") {
    const highways = [
      {
        start: new THREE.Vector3(-700, -104, 1.42),
        end: new THREE.Vector3(700, -104, 1.42),
        width: 9,
      },
      {
        start: new THREE.Vector3(-700, 112, 1.42),
        end: new THREE.Vector3(700, 112, 1.42),
        width: 7,
      },
      {
        start: new THREE.Vector3(-142, -500, 1.43),
        end: new THREE.Vector3(-142, 500, 1.43),
        width: 8,
      },
    ];
    for (const highway of highways) {
      const midpoint = highway.start.clone().add(highway.end).multiplyScalar(0.5);
      const length = highway.start.distanceTo(highway.end);
      const angle = Math.atan2(
        highway.end.y - highway.start.y,
        highway.end.x - highway.start.x,
      );
      pavementTransforms.push({
        position: midpoint,
        scale: new THREE.Vector3(length, highway.width, 0.22),
        rotation: angle,
      });
      for (const offset of [-highway.width * 0.23, highway.width * 0.23]) {
        laneTransforms.push({
          position: midpoint
            .clone()
            .add(
              new THREE.Vector3(
                -Math.sin(angle) * offset,
                Math.cos(angle) * offset,
                0.16,
              ),
            ),
          scale: new THREE.Vector3(length - 4, 0.16, 0.04),
          rotation: angle,
        });
      }
    }
  }
  if (pavementTransforms.length > 0) {
    const roadMaterial = new THREE.MeshStandardMaterial({
      color: 0x414a49,
      roughness: 0.92,
    });
    roadMaterial.name = "environment:pavement";
    const roads = createInstances(
      new THREE.BoxGeometry(1, 1, 1),
      roadMaterial,
      pavementTransforms,
    );
    roads.name = "instanced-landscape-highways";
    roads.receiveShadow = true;
    const laneMaterial = new THREE.MeshBasicMaterial({ color: 0xd8d0ac });
    laneMaterial.name = "semantic:runwayLine";
    const lanes = createInstances(
      new THREE.BoxGeometry(1, 1, 1),
      laneMaterial,
      laneTransforms,
    );
    lanes.name = "instanced-landscape-highway-markings";
    root.add(roads, lanes);
  }

  return {
    instancedDrawGroups: pavementTransforms.length > 0 ? 3 : 1,
    instances:
      districtTransforms.length +
      pavementTransforms.length +
      laneTransforms.length,
    districtInstances: districtTransforms.length,
    highwayInstances: pavementTransforms.length + laneTransforms.length,
  };
}
