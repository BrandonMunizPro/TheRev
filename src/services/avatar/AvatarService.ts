import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { AvatarAnimations, AvatarEmotion } from './AvatarAnimations';

export interface AvatarConfig {
  bodyType: string;
  skinTone: string;
  hair: string;
  hairColor: string;
  eyes: string;
  clothing: string;
  accessory: string;
}

export type BuiltInAvatarStyle =
  | 'default'
  | 'revolutionary'
  | 'journalist'
  | 'activist'
  | 'robot'
  | 'minimal';

export interface AvatarPart {
  id: string;
  name: string;
  modelUrl: string;
  category: 'body' | 'hair' | 'eyes' | 'clothing' | 'accessory';
}

export class AvatarService {
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private controls: OrbitControls;
  private loadedParts: Map<string, THREE.Group> = new Map();
  private animationMixer: THREE.AnimationMixer | null = null;
  private clock: THREE.Clock;
  private animations: AvatarAnimations | null = null;

  constructor(containerId: string) {
    const container = document.getElementById(containerId);
    if (!container) throw new Error(`Container ${containerId} not found`);

    this.clock = new THREE.Clock();
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xf0f0f0);

    this.camera = new THREE.PerspectiveCamera(
      45,
      container.clientWidth / container.clientHeight,
      0.1,
      1000
    );
    this.camera.position.set(0, 1.5, 3);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(this.renderer.domElement);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(0, 1, 0);
    this.controls.enableDamping = true;

    this.setupLights();
    this.animate();
  }

  private setupLights(): void {
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    this.scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
    directionalLight.position.set(5, 10, 7);
    directionalLight.castShadow = true;
    this.scene.add(directionalLight);

    const fillLight = new THREE.DirectionalLight(0xffffff, 0.3);
    fillLight.position.set(-5, 0, -5);
    this.scene.add(fillLight);
  }

  private animate = (): void => {
    requestAnimationFrame(this.animate);
    const delta = this.clock.getDelta();

    if (this.animationMixer) {
      this.animationMixer.update(delta);
    }

    if (this.animations) {
      this.animations.update(delta);
    }

    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  };

  async loadPart(partId: string, modelUrl: string): Promise<void> {
    const loader = new GLTFLoader();

    try {
      const gltf = await loader.loadAsync(modelUrl);
      const model = gltf.scene;

      if (this.loadedParts.has(partId)) {
        this.scene.remove(this.loadedParts.get(partId)!);
      }

      model.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.castShadow = true;
          child.receiveShadow = true;
        }
      });

      this.loadedParts.set(partId, model);
      this.scene.add(model);

      if (gltf.animations.length > 0) {
        this.animationMixer = new THREE.AnimationMixer(model);
        this.gltfAnimations = gltf.animations;
        gltf.animations.forEach((clip) => {
          this.animationMixer!.clipAction(clip).play();
        });
      }
    } catch (error) {
      console.error(`Failed to load avatar part ${partId}:`, error);
      throw error;
    }
  }

  setPartColor(partId: string, color: string): void {
    const part = this.loadedParts.get(partId);
    if (!part) return;

    const threeColor = new THREE.Color(color);
    part.traverse((child) => {
      if (child instanceof THREE.Mesh && child.material) {
        const materials = Array.isArray(child.material)
          ? child.material
          : [child.material];
        materials.forEach((mat) => {
          if (mat instanceof THREE.MeshStandardMaterial) {
            if (mat.name.toLowerCase().includes('hair')) {
              mat.color.set(threeColor);
            } else if (mat.name.toLowerCase().includes('skin')) {
              mat.color.set(threeColor);
            }
          }
        });
      }
    });
  }

  removePart(partId: string): void {
    const part = this.loadedParts.get(partId);
    if (part) {
      this.scene.remove(part);
      this.loadedParts.delete(partId);
    }
  }

  async loadVRM(url: string): Promise<void> {
    await this.loadPart('vrm', url);
    this.enableAnimations();
  }

  async loadVRMFromFile(file: File): Promise<void> {
    const url = URL.createObjectURL(file);
    try {
      await this.loadVRM(url);
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  private gltfAnimations: THREE.AnimationClip[] = [];

  setAnimation(animationName: string): void {
    if (!this.animationMixer) return;

    this.animationMixer.stopAllAction();
    const clip = this.gltfAnimations.find((a) => a.name === animationName);
    if (clip) {
      this.animationMixer.clipAction(clip).play();
    }
  }

  setBackgroundColor(color: string): void {
    this.scene.background = new THREE.Color(color);
  }

  resize(width: number, height: number): void {
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  dispose(): void {
    this.renderer.dispose();
    this.controls.dispose();
    this.loadedParts.clear();
  }

  createBuiltInAvatar(
    style: BuiltInAvatarStyle,
    primaryColor: string,
    accentColor: string
  ): void {
    if (this.loadedParts.has('avatar')) {
      this.scene.remove(this.loadedParts.get('avatar')!);
    }

    const avatar = new THREE.Group();

    switch (style) {
      case 'default':
        this.createDefaultAvatar(avatar, primaryColor, accentColor);
        break;
      case 'revolutionary':
        this.createRevolutionaryAvatar(avatar, primaryColor, accentColor);
        break;
      case 'journalist':
        this.createJournalistAvatar(avatar, primaryColor, accentColor);
        break;
      case 'activist':
        this.createActivistAvatar(avatar, primaryColor, accentColor);
        break;
      case 'robot':
        this.createRobotAvatar(avatar, primaryColor, accentColor);
        break;
      case 'minimal':
        this.createMinimalAvatar(avatar, primaryColor, accentColor);
        break;
    }

    avatar.position.y = -0.5;
    this.loadedParts.set('avatar', avatar);
    this.scene.add(avatar);
    this.enableAnimations();
  }

  private createDefaultAvatar(
    avatar: THREE.Group,
    primary: string,
    accent: string
  ): void {
    const bodyMat = new THREE.MeshStandardMaterial({
      color: primary,
      roughness: 0.7,
    });
    const skinMat = new THREE.MeshStandardMaterial({
      color: 0xffdbac,
      roughness: 0.8,
    });
    const hairMat = new THREE.MeshStandardMaterial({
      color: accent,
      roughness: 0.9,
    });

    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.25, 32, 32),
      skinMat
    );
    head.position.y = 1.6;
    avatar.add(head);

    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(0.2, 0.25, 0.7, 32),
      bodyMat
    );
    body.position.y = 1.0;
    avatar.add(body);

    const hair = new THREE.Mesh(
      new THREE.SphereGeometry(0.27, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2),
      hairMat
    );
    hair.position.y = 1.75;
    avatar.add(hair);

    const eyeGeo = new THREE.SphereGeometry(0.03, 16, 16);
    const eyeMat = new THREE.MeshStandardMaterial({ color: 0x333333 });
    const leftEye = new THREE.Mesh(eyeGeo, eyeMat);
    leftEye.position.set(-0.08, 1.65, 0.22);
    avatar.add(leftEye);
    const rightEye = new THREE.Mesh(eyeGeo, eyeMat);
    rightEye.position.set(0.08, 1.65, 0.22);
    avatar.add(rightEye);
  }

  private createRevolutionaryAvatar(
    avatar: THREE.Group,
    primary: string,
    accent: string
  ): void {
    const bodyMat = new THREE.MeshStandardMaterial({
      color: primary,
      roughness: 0.6,
    });
    const skinMat = new THREE.MeshStandardMaterial({
      color: 0x8d5524,
      roughness: 0.8,
    });
    const hairMat = new THREE.MeshStandardMaterial({
      color: 0x1a1a1a,
      roughness: 0.9,
    });

    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.25, 32, 32),
      skinMat
    );
    head.position.y = 1.6;
    avatar.add(head);

    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(0.22, 0.28, 0.8, 32),
      bodyMat
    );
    body.position.y = 0.95;
    avatar.add(body);

    const hair = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.3, 8), hairMat);
    hair.position.y = 1.9;
    avatar.add(hair);

    const eyeGeo = new THREE.SphereGeometry(0.035, 16, 16);
    const eyeMat = new THREE.MeshStandardMaterial({
      color: 0x333333,
      emissive: 0x222222,
    });
    const leftEye = new THREE.Mesh(eyeGeo, eyeMat);
    leftEye.position.set(-0.08, 1.65, 0.22);
    avatar.add(leftEye);
    const rightEye = new THREE.Mesh(eyeGeo, eyeMat);
    rightEye.position.set(0.08, 1.65, 0.22);
    avatar.add(rightEye);

    const bandana = new THREE.Mesh(
      new THREE.TorusGeometry(0.26, 0.03, 8, 32),
      hairMat
    );
    bandana.position.y = 1.8;
    bandana.rotation.x = Math.PI / 2;
    avatar.add(bandana);
  }

  private createJournalistAvatar(
    avatar: THREE.Group,
    primary: string,
    accent: string
  ): void {
    const bodyMat = new THREE.MeshStandardMaterial({
      color: primary,
      roughness: 0.5,
    });
    const skinMat = new THREE.MeshStandardMaterial({
      color: 0xe0ac69,
      roughness: 0.8,
    });
    const hairMat = new THREE.MeshStandardMaterial({
      color: 0x4a3728,
      roughness: 0.9,
    });

    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.25, 32, 32),
      skinMat
    );
    head.position.y = 1.6;
    avatar.add(head);

    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(0.2, 0.22, 0.7, 32),
      bodyMat
    );
    body.position.y = 1.0;
    avatar.add(body);

    const glassesFrame = new THREE.MeshStandardMaterial({
      color: 0x333333,
      metalness: 0.8,
      roughness: 0.2,
    });
    const leftLens = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06, 0.06, 0.02, 16),
      glassesFrame
    );
    leftLens.position.set(-0.1, 1.65, 0.2);
    leftLens.rotation.z = Math.PI / 2;
    avatar.add(leftLens);
    const rightLens = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06, 0.06, 0.02, 16),
      glassesFrame
    );
    rightLens.position.set(0.1, 1.65, 0.2);
    rightLens.rotation.z = Math.PI / 2;
    avatar.add(rightLens);
    const bridge = new THREE.Mesh(
      new THREE.CylinderGeometry(0.01, 0.01, 0.08, 8),
      glassesFrame
    );
    bridge.position.set(0, 1.65, 0.2);
    bridge.rotation.z = Math.PI / 2;
    avatar.add(bridge);

    const hair = new THREE.Mesh(
      new THREE.SphereGeometry(0.28, 32, 16, 0, Math.PI * 2, 0, Math.PI / 3),
      hairMat
    );
    hair.position.y = 1.78;
    avatar.add(hair);

    const notepad = new THREE.Mesh(
      new THREE.BoxGeometry(0.2, 0.25, 0.02),
      new THREE.MeshStandardMaterial({ color: 0xffffff })
    );
    notepad.position.set(0.25, 1.1, 0.15);
    notepad.rotation.y = -0.3;
    avatar.add(notepad);
  }

  private createActivistAvatar(
    avatar: THREE.Group,
    primary: string,
    accent: string
  ): void {
    const bodyMat = new THREE.MeshStandardMaterial({
      color: primary,
      roughness: 0.7,
    });
    const skinMat = new THREE.MeshStandardMaterial({
      color: 0xc68642,
      roughness: 0.8,
    });
    const hairMat = new THREE.MeshStandardMaterial({
      color: accent,
      roughness: 0.9,
    });

    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.25, 32, 32),
      skinMat
    );
    head.position.y = 1.6;
    avatar.add(head);

    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(0.22, 0.26, 0.75, 32),
      bodyMat
    );
    body.position.y = 0.97;
    avatar.add(body);

    const fistGeo = new THREE.SphereGeometry(0.08, 16, 16);
    const fistMat = new THREE.MeshStandardMaterial({ color: skinMat.color });
    const leftFist = new THREE.Mesh(fistGeo, fistMat);
    leftFist.position.set(-0.3, 1.3, 0.1);
    avatar.add(leftFist);
    const rightFist = new THREE.Mesh(fistGeo, fistMat);
    rightFist.position.set(0.3, 1.3, 0.1);
    avatar.add(rightFist);

    const hair = new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.15, 6), hairMat);
    hair.position.y = 1.88;
    avatar.add(hair);
  }

  private createRobotAvatar(
    avatar: THREE.Group,
    primary: string,
    accent: string
  ): void {
    const metalMat = new THREE.MeshStandardMaterial({
      color: primary,
      metalness: 0.8,
      roughness: 0.3,
    });
    const glowMat = new THREE.MeshStandardMaterial({
      color: accent,
      emissive: accent,
      emissiveIntensity: 0.5,
    });

    const head = new THREE.Mesh(
      new THREE.BoxGeometry(0.4, 0.35, 0.35),
      metalMat
    );
    head.position.y = 1.55;
    avatar.add(head);

    const body = new THREE.Mesh(
      new THREE.BoxGeometry(0.35, 0.5, 0.25),
      metalMat
    );
    body.position.y = 1.05;
    avatar.add(body);

    const leftEye = new THREE.Mesh(
      new THREE.SphereGeometry(0.04, 16, 16),
      glowMat
    );
    leftEye.position.set(-0.1, 1.58, 0.18);
    avatar.add(leftEye);
    const rightEye = new THREE.Mesh(
      new THREE.SphereGeometry(0.04, 16, 16),
      glowMat
    );
    rightEye.position.set(0.1, 1.58, 0.18);
    avatar.add(rightEye);

    const antenna = new THREE.Mesh(
      new THREE.CylinderGeometry(0.02, 0.02, 0.15, 8),
      metalMat
    );
    antenna.position.set(0, 1.9, 0);
    avatar.add(antenna);
    const antennaTop = new THREE.Mesh(
      new THREE.SphereGeometry(0.04, 16, 16),
      glowMat
    );
    antennaTop.position.y = 1.98;
    avatar.add(antennaTop);
  }

  private createMinimalAvatar(
    avatar: THREE.Group,
    primary: string,
    accent: string
  ): void {
    const bodyMat = new THREE.MeshStandardMaterial({
      color: primary,
      roughness: 0.9,
      flatShading: true,
    });
    const headMat = new THREE.MeshStandardMaterial({
      color: accent,
      roughness: 0.9,
      flatShading: true,
    });

    const head = new THREE.Mesh(new THREE.IcosahedronGeometry(0.2, 1), headMat);
    head.position.y = 1.65;
    avatar.add(head);

    const body = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.25, 1),
      bodyMat
    );
    body.position.y = 1.05;
    avatar.add(body);

    const leftEye = new THREE.Mesh(
      new THREE.BoxGeometry(0.04, 0.04, 0.02),
      new THREE.MeshStandardMaterial({ color: 0x333333 })
    );
    leftEye.position.set(-0.06, 1.68, 0.18);
    avatar.add(leftEye);
    const rightEye = new THREE.Mesh(
      new THREE.BoxGeometry(0.04, 0.04, 0.02),
      new THREE.MeshStandardMaterial({ color: 0x333333 })
    );
    rightEye.position.set(0.06, 1.68, 0.18);
    avatar.add(rightEye);
  }

  enableAnimations(): void {
    const avatar =
      this.loadedParts.get('avatar') || this.loadedParts.get('vrm');
    if (avatar) {
      if (!this.animations) {
        this.animations = new AvatarAnimations();
      }
      this.animations.bind(avatar);
      this.setEmotion('idle');
    }
  }

  setEmotion(emotion: AvatarEmotion, transitionSpeed?: number): void {
    if (this.animations) {
      this.animations.setEmotion(emotion, transitionSpeed);
    }
  }

  reactToText(text: string): void {
    if (this.animations) {
      this.animations.reactToAIResponse(text);
    }
  }

  startListening(): void {
    if (this.animations) {
      this.animations.startListening();
    }
  }

  stopListening(): void {
    if (this.animations) {
      this.animations.stopListening();
    }
  }

  setWalking(enabled: boolean): void {
    if (this.animations) {
      this.animations.setWalking(enabled);
    }
  }

  getCurrentEmotion(): AvatarEmotion {
    return this.animations?.getCurrentEmotion() || 'idle';
  }

  disableAnimations(): void {
    if (this.animations) {
      this.animations.dispose();
      this.animations = null;
    }
  }
}

export const avatarService = {
  create: (containerId: string) => new AvatarService(containerId),
};
