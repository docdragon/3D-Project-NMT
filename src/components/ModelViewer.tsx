import * as THREE from "three";
import React, { Suspense, useState, useEffect, useCallback } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import {
  OrbitControls,
  useGLTF,
  Html,
  Bounds,
  ContactShadows,
  useBounds,
  Line,
  CameraControls,
} from "@react-three/drei";
import { Eye, EyeOff, List, Box, Search, Ruler, Layers, X } from "lucide-react";

const formatDim = (val: number) => {
  if (val < 1) return (val * 1000).toFixed(1) + " mm";
  return val.toFixed(2) + " m";
};

const cleanName = (name: string) => {
  if (!name) return "Không có tên (Unnamed)";
  const cleaned = name
    .replace(/geom3d/gi, "")
    .replace(/_+/g, " ")
    .trim();
  return cleaned || "Không có tên (Unnamed)";
};

function MeasureViewer({
  points,
  onClear,
}: {
  points: THREE.Vector3[];
  onClear: () => void;
}) {
  if (points.length === 0) return null;

  const p1 = points[0];
  const p2 = points.length > 1 ? points[1] : null;

  const dist = p2 ? p1.distanceTo(p2) : 0;
  const midPoint = p2
    ? new THREE.Vector3().addVectors(p1, p2).multiplyScalar(0.5)
    : p1;

  return (
    <group>
      <mesh position={p1}>
        <sphereGeometry args={[0.08, 16, 16]} />
        <meshBasicMaterial color="#ef4444" depthTest={false} />
      </mesh>
      {p2 && (
        <mesh position={p2}>
          <sphereGeometry args={[0.08, 16, 16]} />
          <meshBasicMaterial color="#ef4444" depthTest={false} />
        </mesh>
      )}
      {p2 && (
        <Line
          points={[p1, p2]}
          color="#ef4444"
          lineWidth={3}
          depthTest={false}
        />
      )}
      {p2 && (
        <Html position={midPoint} center style={{ pointerEvents: "auto" }}>
          <div className="bg-red-500 text-white px-2 py-1 rounded text-xs font-bold shadow-lg flex items-center gap-2 border border-red-600">
            {formatDim(dist)}
            <button
              onClick={(e) => {
                e.stopPropagation();
                onClear();
              }}
              className="hover:bg-red-600 rounded-full p-1 border border-red-400 bg-red-500 transition-colors flex items-center justify-center shrink-0"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        </Html>
      )}
    </group>
  );
}

function ZoomController({ node }: { node: any }) {
  const cameraControls = useThree((state) => state.controls as any);
  const { scene } = useThree();

  useEffect(() => {
    if (cameraControls && node) {
      if (node.isMeshesFit) return;
      // Double click provides node to zoom to
      cameraControls.fitToBox(node, true, {
        paddingTop: 0.5,
        paddingLeft: 0.5,
        paddingBottom: 0.5,
        paddingRight: 0.5,
      });
    }
  }, [node, cameraControls]);

  // Initial fit for the entire scene when model loads
  useEffect(() => {
    if (cameraControls && scene) {
      const modelGroup = scene.children.find(
        (c) =>
          c.type === "Group" || c.type === "Object3D" || c.name === "RootNode",
      );
      if (modelGroup) {
        setTimeout(() => {
          cameraControls.fitToBox(modelGroup, false, {
            paddingTop: 0.5,
            paddingLeft: 0.5,
            paddingBottom: 0.5,
            paddingRight: 0.5,
          });
        }, 100);
      }
    }
  }, [scene, cameraControls]);

  return null;
}

function Model({
  url,
  selectedNode,
  onSelect,
  setInstances,
  onDoubleClickNode,
  isXRay,
  isMeasuring,
  measurePoints,
  setMeasurePoints,
}: {
  url: string;
  selectedNode: any;
  onSelect: (node: any) => void;
  setInstances: (arr: any[]) => void;
  onDoubleClickNode: (node: any) => void;
  isXRay: boolean;
  isMeasuring: boolean;
  measurePoints: THREE.Vector3[];
  setMeasurePoints: any;
}) {
  const { scene } = useGLTF(url);

  const cursorRef = React.useRef<THREE.Mesh>(null);

  useEffect(() => {
    scene.traverse((node: any) => {
      if (node.isMesh && node.material) {
        const mats = Array.isArray(node.material)
          ? node.material
          : [node.material];

        if (node.userData.origMaterials === undefined) {
          node.userData.origMaterials = mats.map((m: any) => ({
            transparent: m.transparent,
            opacity: m.opacity,
            depthWrite: m.depthWrite,
            side: m.side,
          }));
        }

        mats.forEach((m: any, idx: number) => {
          if (isXRay) {
            m.transparent = true;
            m.opacity = 0.5;
            m.depthWrite = false;
            m.side = THREE.DoubleSide;
          } else {
            const orig = node.userData.origMaterials[idx];
            if (orig) {
              m.transparent = orig.transparent;
              m.opacity = orig.opacity;
              m.depthWrite = orig.depthWrite;
              m.side = orig.side !== undefined ? orig.side : THREE.FrontSide;
            }
          }
          m.needsUpdate = true;
        });
      }
    });
  }, [isXRay, scene]);

  const getTargetNode = (clickedNode: any) => {
    if (
      clickedNode.name === "selectionBoxHelper" ||
      clickedNode.type === "BoxHelper"
    )
      return null;

    let targetNode = clickedNode;
    while (
      targetNode.parent &&
      targetNode.parent.type !== "Scene" &&
      targetNode.parent.name !== "Scene" &&
      targetNode.parent.name !== "RootNode"
    ) {
      const isGenericName =
        !targetNode.name ||
        targetNode.name.match(/^(mesh|node(?!s)|primitive)/i);
      const hasNoData =
        Object.keys(targetNode.userData).filter(
          (k) => k !== "hasEdges" && k !== "edgeLine" && k !== "origMaterials",
        ).length === 0;

      if (isGenericName && hasNoData) {
        targetNode = targetNode.parent;
      } else {
        break;
      }
    }
    return targetNode;
  };

  useEffect(() => {
    scene.traverse((node: any) => {
      if (node.isMesh) {
        node.castShadow = true;
        node.receiveShadow = true;

        if (!node.userData.hasEdges) {
          // Reduce threshold angle from 15 to 2 to catch slightly angled surfaces
          const edges = new THREE.EdgesGeometry(node.geometry, 2);
          const line = new THREE.LineSegments(
            edges,
            new THREE.LineBasicMaterial({
              color: 0x444444,
              transparent: true,
              opacity: 0.4,
              polygonOffset: true,
              polygonOffsetFactor: -1,
              polygonOffsetUnits: -1,
            }),
          );
          line.renderOrder = 1;
          line.raycast = () => {};
          node.add(line);
          node.userData.hasEdges = true;
          node.userData.edgeLine = line;
        }
      }
    });
  }, [scene]);

  useEffect(() => {
    const instanceSet = new Set<any>();
    scene.traverse((node: any) => {
      if (node.isMesh && node.name !== "selectionBoxHelper") {
        const t = getTargetNode(node);
        if (t) instanceSet.add(t);
      }
    });
    setInstances(Array.from(instanceSet));
  }, [scene, setInstances]);

  useEffect(() => {
    scene.traverse((node: any) => {
      if (node.isMesh && node.userData.edgeLine) {
        node.userData.edgeLine.material.color.setHex(0x444444);
        node.userData.edgeLine.material.transparent = true;
        node.userData.edgeLine.material.opacity = 0.4;
        node.userData.edgeLine.material.depthTest = true;
        node.userData.edgeLine.renderOrder = 1;
      }
    });

    let boxHelper = scene.getObjectByName(
      "selectionBoxHelper",
    ) as THREE.BoxHelper;
    if (!boxHelper) {
      boxHelper = new THREE.BoxHelper(new THREE.Object3D(), 0x2563eb);
      boxHelper.name = "selectionBoxHelper";
      (boxHelper.material as THREE.LineBasicMaterial).depthTest = false;
      boxHelper.renderOrder = 1000;
      boxHelper.raycast = () => {};
      scene.add(boxHelper);
    }

    if (selectedNode) {
      boxHelper.setFromObject(selectedNode);
      boxHelper.visible = true;

      selectedNode.traverse((node: any) => {
        if (node.isMesh && node.userData.edgeLine) {
          node.userData.edgeLine.material.color.setHex(0x2563eb);
          node.userData.edgeLine.material.transparent = false;
          node.userData.edgeLine.material.opacity = 1.0;
          node.userData.edgeLine.material.depthTest = true;
          node.userData.edgeLine.renderOrder = 999;
        }
      });
    } else {
      boxHelper.visible = false;
    }
  }, [selectedNode, scene]);

  return (
    <>
      <primitive
        object={scene}
        onClick={(e: any) => {
          if (!e.object.visible) return;
          const targetNode = getTargetNode(e.object);
          if (targetNode && !targetNode.visible) return;

          e.stopPropagation();
          if (isMeasuring) {
            let point = e.point;
            if (cursorRef.current && cursorRef.current.visible) {
              point = cursorRef.current.position.clone();
            }
            if (measurePoints.length >= 2) {
              setMeasurePoints([point]);
            } else {
              setMeasurePoints((prev: any) => [...prev, point]);
            }
            return;
          }

          if (targetNode) onSelect(targetNode);
        }}
        onDoubleClick={(e: any) => {
          if (!e.object.visible) return;
          const targetNode = getTargetNode(e.object);
          if (targetNode && !targetNode.visible) return;

          e.stopPropagation();
          if (targetNode) {
            onSelect(targetNode);
            onDoubleClickNode(targetNode);
          }
        }}
        onPointerOver={(e: any) => {
          if (!e.object.visible) return;
          const targetNode = getTargetNode(e.object);
          if (targetNode && !targetNode.visible) return;

          e.stopPropagation();
          document.body.style.cursor = isMeasuring ? "crosshair" : "pointer";
        }}
        onPointerMove={(e: any) => {
          if (!e.object.visible) return;
          const targetNode = getTargetNode(e.object);
          if (targetNode && !targetNode.visible) return;

          if (isMeasuring) {
            e.stopPropagation();
            let snapPoint = e.point;
            if (e.object?.geometry?.attributes?.position && e.face) {
              const pos = e.object.geometry.attributes.position;
              const vA = new THREE.Vector3()
                .fromBufferAttribute(pos, e.face.a)
                .applyMatrix4(e.object.matrixWorld);
              const vB = new THREE.Vector3()
                .fromBufferAttribute(pos, e.face.b)
                .applyMatrix4(e.object.matrixWorld);
              const vC = new THREE.Vector3()
                .fromBufferAttribute(pos, e.face.c)
                .applyMatrix4(e.object.matrixWorld);

              const dA = vA.distanceTo(e.point);
              const dB = vB.distanceTo(e.point);
              const dC = vC.distanceTo(e.point);

              let minD = dA;
              snapPoint = vA;
              if (dB < minD) {
                minD = dB;
                snapPoint = vB;
              }
              if (dC < minD) {
                minD = dC;
                snapPoint = vC;
              }
            }

            if (cursorRef.current) {
              cursorRef.current.position.copy(snapPoint);
              cursorRef.current.visible = true;
            }
          }
        }}
        onPointerOut={() => {
          document.body.style.cursor = "auto";
          if (cursorRef.current) cursorRef.current.visible = false;
        }}
      />
      {isMeasuring && (
        <mesh ref={cursorRef} visible={false}>
          <sphereGeometry args={[0.06, 16, 16]} />
          <meshBasicMaterial
            color="#3b82f6"
            depthTest={false}
            transparent
            opacity={0.8}
          />
        </mesh>
      )}
    </>
  );
}

function FocusController({ node }: { node: any }) {
  const cameraControls = useThree((state) => state.controls as any);
  useEffect(() => {
    if (cameraControls && node) {
      // Smoothly transition the camera to focus the selected part
      cameraControls.fitToBox(node, true, {
        paddingTop: 1,
        paddingLeft: 1,
        paddingBottom: 1,
        paddingRight: 1,
      });
    }
  }, [node, cameraControls]);
  return null;
}

function Loader({ error }: { error?: boolean }) {
  if (error) {
    return (
      <Html center>
        <div className="text-sm font-medium text-red-600 bg-white px-4 py-3 rounded-xl shadow-lg border border-red-200 text-center max-w-sm">
          <p className="font-bold mb-1">Lỗi tải mô hình</p>
          <p className="text-xs text-red-500 font-normal">
            Mô hình quá lớn hoặc tệp không hợp lệ. Vui lòng thử lại mô hình
            khác.
          </p>
        </div>
      </Html>
    );
  }
  return (
    <Html center>
      <div className="text-sm font-medium text-indigo-600 bg-white px-4 py-2 rounded-full shadow-sm whitespace-nowrap">
        Đang tải mô hình...
      </div>
    </Html>
  );
}

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean }
> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(error: any) {
    console.error("Model loading error:", error);
  }
  render() {
    if (this.state.hasError) return <Loader error />;
    return this.props.children;
  }
}

export default function ModelViewer({ fileUrl }: { fileUrl: string | null }) {
  const [selectedNode, setSelectedNode] = useState<any>(null);
  const [dimensions, setDimensions] = useState<number[] | null>(null);
  const [hiddenNodes, setHiddenNodes] = useState<any[]>([]);

  const [instances, setInstancesState] = useState<any[]>([]);
  const [showList, setShowList] = useState(false);
  const [zoomNode, setZoomNode] = useState<any>(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [isXRay, setIsXRay] = useState(false);
  const [isMeasuring, setIsMeasuring] = useState(false);
  const [measurePoints, setMeasurePoints] = useState<THREE.Vector3[]>([]);

  const filteredInstances = instances.filter((inst) =>
    cleanName(inst.name).toLowerCase().includes(searchQuery.toLowerCase()),
  );

  const setInstances = useCallback((nodes: any[]) => {
    setInstancesState(nodes);
  }, []);

  useEffect(() => {
    if (selectedNode) {
      const box = new THREE.Box3().setFromObject(selectedNode);
      const sizeVec = new THREE.Vector3();
      box.getSize(sizeVec);
      const dims = [sizeVec.x, sizeVec.y, sizeVec.z].sort((a, b) => b - a);
      setDimensions(dims);
    } else {
      setDimensions(null);
    }
  }, [selectedNode]);

  if (!fileUrl) {
    return (
      <div className="w-full h-full flex items-center justify-center text-gray-400 bg-gray-50/50 rounded-xl border border-dashed border-gray-300">
        <p>Vui lòng chọn một file .glb hoặc .gltf để xem</p>
      </div>
    );
  }

  return (
    <div
      className="w-full h-full relative rounded-xl overflow-hidden border border-gray-200"
      style={{
        background: "linear-gradient(to bottom, #eef1f3 50%, #c4c5c5 50%)",
      }}
    >
      <div className="absolute top-4 left-4 z-20 flex flex-col items-start gap-2 max-h-[80%] pointer-events-none">
        <div className="flex flex-wrap gap-2 pointer-events-auto">
          {instances.length > 0 && (
            <button
              onClick={() => setShowList(!showList)}
              className={`px-4 py-2.5 rounded-xl text-sm font-medium shadow-sm border flex items-center gap-2 transition-colors ${showList ? "bg-indigo-50 border-indigo-200 text-indigo-700" : "bg-white/90 backdrop-blur border-gray-200 text-gray-700 hover:text-indigo-600 hover:bg-white"}`}
            >
              <List className="w-4 h-4" />
              Danh sách Object ({instances.length})
            </button>
          )}

          <button
            onClick={() => setIsXRay(!isXRay)}
            className={`px-4 py-2.5 rounded-xl text-sm font-medium shadow-sm border flex items-center gap-2 transition-colors ${isXRay ? "bg-indigo-50 border-indigo-200 text-indigo-700" : "bg-white/90 backdrop-blur border-gray-200 text-gray-700 hover:text-indigo-600 hover:bg-white"}`}
          >
            <Layers className="w-4 h-4" />
            X-Ray {isXRay && "Bật"}
          </button>

          <button
            onClick={() => {
              setIsMeasuring(!isMeasuring);
              if (isMeasuring) setMeasurePoints([]); // clear when turn off
            }}
            className={`px-4 py-2.5 rounded-xl text-sm font-medium shadow-sm border flex items-center gap-2 transition-colors ${isMeasuring ? "bg-indigo-50 border-indigo-200 text-indigo-700" : "bg-white/90 backdrop-blur border-gray-200 text-gray-700 hover:text-indigo-600 hover:bg-white"}`}
          >
            <Ruler className="w-4 h-4" />
            Thước đo {isMeasuring && "Bật"}
          </button>

          {hiddenNodes.length > 0 && (
            <button
              onClick={() => {
                hiddenNodes.forEach((node) => (node.visible = true));
                setHiddenNodes([]);
              }}
              className="bg-white/90 backdrop-blur px-4 py-2.5 rounded-xl text-sm font-medium shadow-sm border border-gray-200 text-gray-700 hover:text-indigo-600 hover:bg-white flex items-center gap-2 transition-colors"
            >
              <Eye className="w-4 h-4" />
              Hiện (đã ẩn {hiddenNodes.length})
            </button>
          )}
        </div>

        {isMeasuring && (
          <div className="bg-indigo-50 text-indigo-700 border border-indigo-200 px-3 py-2 rounded-xl text-sm shadow-sm pointer-events-auto w-64 md:w-80">
            <span className="font-semibold block mb-0.5">Chế độ Thước đo:</span>
            <span className="opacity-90">
              Click vào 2 điểm trên mô hình để đo khoảng cách. Click tiếp tục để
              bắt đầu đo vị trí mới.
            </span>
          </div>
        )}

        {showList && instances.length > 0 && (
          <div className="bg-white/95 backdrop-blur border border-gray-200 shadow-lg rounded-xl flex flex-col w-64 md:w-80 flex-shrink min-h-0 pointer-events-auto">
            <div className="p-3 border-b border-gray-100 bg-gray-50/50 rounded-t-xl shrink-0">
              <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                Models / Components
              </h4>
              <div className="relative">
                <Search className="w-4 h-4 absolute left-2.5 top-2.5 text-gray-400" />
                <input
                  type="text"
                  placeholder="Tìm instance..."
                  className="w-full pl-8 pr-3 py-1.5 text-sm rounded-md border border-gray-200 focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
            </div>
            <div className="overflow-y-auto p-2 space-y-1">
              {filteredInstances.length === 0 ? (
                <div className="text-center py-4 text-gray-500 text-sm">
                  Không tìm thấy kết quả
                </div>
              ) : (
                filteredInstances.map((inst, idx) => {
                  const isHidden = hiddenNodes.includes(inst) || !inst.visible;
                  return (
                    <button
                      key={inst.uuid || idx}
                      onClick={() => {
                        setSelectedNode(inst);
                        setZoomNode(inst); // Zoom to object directly when clicked from list
                      }}
                      className={`group w-full text-left px-3 py-2 rounded-lg text-sm flex items-center gap-2 transition-colors ${selectedNode === inst ? "bg-indigo-50 text-indigo-700 font-medium" : "hover:bg-gray-100 text-gray-700"}`}
                    >
                      <Box
                        className={`w-4 h-4 shrink-0 ${selectedNode === inst ? "text-indigo-500" : "text-gray-400"}`}
                      />
                      <span
                        className={`truncate flex-1 ${isHidden ? "text-gray-400 line-through" : ""}`}
                      >
                        {cleanName(inst.name)}
                      </span>
                      {isHidden ? (
                        <div
                          onClick={(e) => {
                            e.stopPropagation();
                            inst.visible = true;
                            setHiddenNodes((prev) =>
                              prev.filter((n) => n !== inst),
                            );
                          }}
                          className="ml-auto w-6 h-6 flex items-center justify-center rounded hover:bg-red-50 text-red-500 hover:text-red-600 transition-colors"
                          title="Hiện lại"
                        >
                          <EyeOff className="w-3.5 h-3.5" />
                        </div>
                      ) : (
                        <div
                          onClick={(e) => {
                            e.stopPropagation();
                            inst.visible = false;
                            if (selectedNode === inst) setSelectedNode(null);
                            setHiddenNodes((prev) => {
                              if (!prev.includes(inst)) return [...prev, inst];
                              return prev;
                            });
                          }}
                          className={`ml-auto w-6 h-6 flex items-center justify-center rounded hover:bg-gray-200 transition-colors ${selectedNode === inst ? "text-indigo-400 hover:text-indigo-600" : "text-gray-400 hover:text-gray-600 opacity-0 group-hover:opacity-100"}`}
                          title="Ẩn object này"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </div>
                      )}
                    </button>
                  );
                })
              )}
            </div>
          </div>
        )}
      </div>

      {selectedNode && (
        <div className="absolute top-4 right-4 bg-white/95 backdrop-blur p-5 rounded-xl shadow-lg border border-gray-200 z-10 w-72 md:w-80 transition-all duration-300 max-h-[80%] flex flex-col">
          <div className="flex justify-between items-center border-b border-gray-200 pb-3 mb-3 shrink-0">
            <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider">
              Entity Info
            </h3>
            <button
              onClick={() => setSelectedNode(null)}
              className="text-gray-400 hover:text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-full w-6 h-6 flex items-center justify-center transition-colors"
            >
              ✕
            </button>
          </div>

          <div className="flex-1 overflow-y-auto space-y-4 pr-1">
            <div className="bg-indigo-50/50 p-3 rounded-lg border border-indigo-100">
              <span className="text-xs font-semibold text-indigo-400 uppercase block mb-1">
                Tên Instance / Nhóm
              </span>
              <p className="text-sm text-indigo-900 font-medium break-words">
                {cleanName(selectedNode.name)}
              </p>
            </div>

            {dimensions && (
              <div className="bg-emerald-50/50 p-3 rounded-lg border border-emerald-100">
                <span className="text-xs font-semibold text-emerald-500 uppercase block mb-2">
                  Kích thước (Bounding Box)
                </span>
                <div className="grid grid-cols-1 gap-1.5 text-sm">
                  <div className="flex justify-between border-b border-emerald-100/50 pb-1">
                    <span className="text-gray-600">Dài:</span>
                    <span className="font-semibold text-emerald-800">
                      {formatDim(dimensions[0])}
                    </span>
                  </div>
                  <div className="flex justify-between border-b border-emerald-100/50 pb-1">
                    <span className="text-gray-600">Rộng:</span>
                    <span className="font-semibold text-emerald-800">
                      {formatDim(dimensions[1])}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Dày (Độ sâu):</span>
                    <span className="font-semibold text-emerald-800">
                      {formatDim(dimensions[2])}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="pt-4 border-t border-gray-100 mt-4 shrink-0">
            <button
              onClick={() => {
                if (selectedNode) {
                  selectedNode.visible = false;
                  setHiddenNodes((prev) => [...prev, selectedNode]);
                  setSelectedNode(null);
                }
              }}
              className="w-full flex items-center justify-center gap-2 bg-red-50 text-red-600 hover:bg-red-100 hover:text-red-700 py-2.5 rounded-lg font-medium text-sm transition-colors border border-red-100"
            >
              <EyeOff className="w-4 h-4" />
              Ẩn Object Này
            </button>
          </div>
        </div>
      )}

      <Canvas
        shadows={{ type: THREE.PCFShadowMap }}
        dpr={[1, 2]}
        camera={{ position: [10, 10, 10], fov: 50 }}
        onPointerMissed={() => {
          if (!isMeasuring) setSelectedNode(null);
        }}
      >
        <ambientLight intensity={0.6} />
        <hemisphereLight
          intensity={0.5}
          color="#ffffff"
          groundColor="#b2cbb1"
        />
        <directionalLight
          castShadow
          position={[15, 20, 10]}
          intensity={1.2}
          shadow-mapSize={[2048, 2048]}
          shadow-camera-far={100}
          shadow-camera-left={-20}
          shadow-camera-right={20}
          shadow-camera-top={20}
          shadow-camera-bottom={-20}
        />

        <ErrorBoundary key={fileUrl}>
          <Suspense fallback={<Loader />}>
            <group>
              <Model
                url={fileUrl}
                selectedNode={selectedNode}
                onSelect={setSelectedNode}
                setInstances={setInstances}
                onDoubleClickNode={setZoomNode}
                isXRay={isXRay}
                isMeasuring={isMeasuring}
                measurePoints={measurePoints}
                setMeasurePoints={setMeasurePoints}
              />
              <ZoomController node={zoomNode} />
            </group>

            <MeasureViewer
              points={measurePoints}
              onClear={() => setMeasurePoints([])}
            />

            <axesHelper args={[20]} />
            <ContactShadows
              position={[0, -0.02, 0]}
              opacity={0.5}
              scale={40}
              blur={2.5}
              far={10}
            />
          </Suspense>
        </ErrorBoundary>

        <CameraControls
          makeDefault
          dollyToCursor={true}
          infinityDolly={true}
          minDistance={1}
          maxDistance={500}
        />
      </Canvas>
    </div>
  );
}
