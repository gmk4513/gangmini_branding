// Blender · Tripo 에서 만든 GLB 를 불러온다. 목록은 assets/manifest.json.
// 파일이 없거나 못 읽으면 조용히 넘어가고, 게임은 회색 상자 건물로 그대로 돌아간다.
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";

const loader = new GLTFLoader();
const draco = new DRACOLoader();
draco.setDecoderPath("https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/libs/draco/gltf/");
loader.setDRACOLoader(draco);

// 캐릭터 · 동작 · 소리 파일 버전. 사이트가 이 파일들을 1주일 동안 브라우저에 맡겨 두게 해서(두 번째부터 바로 열림),
// 파일을 바꾸면 이 값을 바꿔야 새 파일을 받는다. (건물은 manifest.json 의 version 을 쓴다)
export const ASSET_V = "?v=20261113b";

export function loadGLB(url) {
  return new Promise((res, rej) => loader.load(url, res, undefined, rej));
}

export async function loadManifest() {
  try {
    const r = await fetch("assets/manifest.json", { cache: "no-cache" });
    if (!r.ok) return null;
    return await r.json();
  } catch (e) { return null; }
}

// 구운 조명 지도 (tools/blender/bake_lighting.py). JPG 에 1/LM_SCALE 로 줄이고 감마를 걸어 담았다
const LM_SCALE = 2.0;
const texLoader = new THREE.TextureLoader();
const lmCache = {};
let VER = "";   // manifest.json 의 version. 다시 구울 때마다 바뀌어서 브라우저가 옛 파일을 쓰지 않는다
function lightmap(n) {
  if (!lmCache[n]) {
    const t = texLoader.load(`assets/env/lm_F${n}.jpg${VER}`);
    t.flipY = false;                       // glTF UV 방향
    t.colorSpace = THREE.SRGBColorSpace;   // 감마를 걸어 저장했으니 sRGB 로 읽어 선형으로 되돌린다
    t.channel = 1;                         // 두 번째 UV (Lightmap)
    lmCache[n] = t;
  }
  return lmCache[n];
}

// 조명을 구운 덩어리(BAKE_F1..)는 실시간 조명을 받지 않는 재질 + 조명 지도로 바꾼다.
// 캐릭터 · Tripo 소품만 실시간 조명을 받는다.
function useBaked(o, n) {
  const conv = (m) => {
    if (m.emissive && m.emissive.getHex() !== 0 && m.emissiveIntensity > 0) {
      return new THREE.MeshBasicMaterial({ color: m.emissive.clone().multiplyScalar(Math.min(1.5, m.emissiveIntensity)) });
    }
    if (m.metalness > 0.9 && m.roughness < 0.1) {   // 거울: 반사는 살리고 조명 지도도 같이
      m.lightMap = lightmap(n); m.lightMapIntensity = LM_SCALE * Math.PI * 0.5;
      return m;
    }
    return new THREE.MeshBasicMaterial({ map: m.map || null, color: m.color, lightMap: lightmap(n), lightMapIntensity: LM_SCALE * Math.PI });
  };
  o.material = Array.isArray(o.material) ? o.material.map(conv) : conv(o.material);
}

function bakedIndex(o) {
  for (let p = o; p; p = p.parent) {
    const m = /^BAKE_F(\d)/.exec(p.name || "");
    if (m) return +m[1];
  }
  return 0;
}

// 건물(보이는 것만)을 불러와 붙인다. 성공하면 회색 상자는 숨기고 충돌용으로만 남긴다.
export async function attachEnvironment(scene, world, list, version) {
  VER = version ? `?v=${version}` : "";
  let ok = 0;
  for (const url of list || []) {
    try {
      const g = await loadGLB("assets/" + url + VER);
      g.scene.traverse((o) => {
        if (!o.isMesh) return;
        o.castShadow = o.receiveShadow = false;
        const n = bakedIndex(o);
        if (n && o.geometry.attributes.uv1) useBaked(o, n);
      });
      scene.add(g.scene);
      (world.envRoots = world.envRoots || []).push(g.scene);
      ok++;
    } catch (e) {
      console.warn("[assets] 못 읽음:", url, e && e.message);
    }
  }
  if (ok) {
    world.solid.visible = false;   // 충돌 · 시야 검사에는 그대로 쓰인다 (안 보이기만)
    world.deco.visible = false;
  }
  return ok;
}
