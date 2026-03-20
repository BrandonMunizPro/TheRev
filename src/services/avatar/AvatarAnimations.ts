import * as THREE from 'three';

export type AvatarEmotion =
  | 'idle'
  | 'thinking'
  | 'excited'
  | 'angry'
  | 'walking'
  | 'listening'
  | 'happy'
  | 'sad';

export interface EmotionConfig {
  bodyScale?: THREE.Vector3;
  bodyOffset?: THREE.Vector3;
  headTilt?: { x: number; y: number; z: number };
  eyeScale?: number;
  eyeColor?: string;
  emissiveColor?: string;
  emissiveIntensity?: number;
  armRotation?: { left: THREE.Euler; right: THREE.Euler };
  bounceSpeed?: number;
  bounceIntensity?: number;
  swaySpeed?: number;
  swayIntensity?: number;
  breathSpeed?: number;
  breathIntensity?: number;
  colorTint?: string;
}

export class AvatarAnimations {
  private avatar: THREE.Group | null = null;
  private head: THREE.Mesh | null = null;
  private body: THREE.Mesh | null = null;
  private leftEye: THREE.Mesh | null = null;
  private rightEye: THREE.Mesh | null = null;
  private leftArm: THREE.Mesh | null = null;
  private rightArm: THREE.Mesh | null = null;
  private originalMaterials: Map<THREE.Mesh, THREE.Material[]> = new Map();

  private currentEmotion: AvatarEmotion = 'idle';
  private transitionProgress: number = 1;
  private transitionSpeed: number = 2;
  private time: number = 0;

  private idleTime: number = 0;
  private blinkTimer: number = 0;
  private isBlinking: boolean = false;
  private blinkDuration: number = 0.1;
  private nextBlink: number = 3;

  private emotionConfigs: Record<AvatarEmotion, EmotionConfig> = {
    idle: {
      breathSpeed: 1.5,
      breathIntensity: 0.02,
      swaySpeed: 0.5,
      swayIntensity: 0.02,
    },
    thinking: {
      headTilt: { x: 0, y: 0, z: 0.15 },
      swaySpeed: 0.3,
      swayIntensity: 0.01,
      eyeColor: '#555555',
    },
    excited: {
      bounceSpeed: 4,
      bounceIntensity: 0.1,
      bodyScale: new THREE.Vector3(1, 1.05, 1),
      eyeScale: 1.3,
    },
    angry: {
      headTilt: { x: 0, y: 0, z: -0.1 },
      eyeColor: '#ff0000',
      emissiveColor: '#330000',
      emissiveIntensity: 0.3,
      armRotation: {
        left: new THREE.Euler(0, 0, 0.5),
        right: new THREE.Euler(0, 0, -0.5),
      },
    },
    walking: {
      swaySpeed: 3,
      swayIntensity: 0.05,
      bounceSpeed: 2,
      bounceIntensity: 0.03,
    },
    listening: {
      headTilt: { x: 0.1, y: 0, z: 0 },
      swaySpeed: 0.8,
      swayIntensity: 0.02,
      eyeScale: 1.1,
    },
    happy: {
      bodyScale: new THREE.Vector3(1, 1.02, 1),
      eyeScale: 1.2,
    },
    sad: {
      headTilt: { x: 0.15, y: 0, z: 0 },
      eyeScale: 0.8,
      eyeColor: '#4477aa',
      emissiveColor: '#112233',
      emissiveIntensity: 0.2,
    },
  };

  private targetConfig: EmotionConfig = { ...this.emotionConfigs.idle };
  private currentConfig: EmotionConfig = { ...this.emotionConfigs.idle };

  bind(avatar: THREE.Group): void {
    this.avatar = avatar;
    this.findAvatarParts();
    this.storeOriginalMaterials();
  }

  private findAvatarParts(): void {
    if (!this.avatar) return;

    this.avatar.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        const name = child.name.toLowerCase();
        const pos = child.position;

        if (name.includes('head') || (pos.y > 1.4 && pos.y < 1.8)) {
          this.head = child;
        } else if (name.includes('body') || (pos.y > 0.8 && pos.y < 1.3)) {
          this.body = child;
        } else if (name.includes('eye')) {
          if (!this.leftEye) {
            this.leftEye = child;
          } else {
            this.rightEye = child;
          }
        } else if (
          name.includes('arm') ||
          name.includes('hand') ||
          name.includes('fist')
        ) {
          if (!this.leftArm && pos.x < 0) {
            this.leftArm = child;
          } else if (!this.rightArm && pos.x > 0) {
            this.rightArm = child;
          }
        }
      }
    });
  }

  private storeOriginalMaterials(): void {
    if (!this.avatar) return;
    this.avatar.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        const mats = Array.isArray(child.material)
          ? [...child.material]
          : [child.material];
        this.originalMaterials.set(child, mats);
      }
    });
  }

  setEmotion(emotion: AvatarEmotion, transitionSpeed?: number): void {
    if (this.currentEmotion === emotion) return;

    this.currentEmotion = emotion;
    this.targetConfig = { ...this.emotionConfigs[emotion] };
    this.transitionProgress = 0;
    if (transitionSpeed) {
      this.transitionSpeed = transitionSpeed;
    }
  }

  private lerp(a: number, b: number, t: number): number {
    return a + (b - a) * Math.min(1, Math.max(0, t));
  }

  private lerpVector3(
    a: THREE.Vector3 | undefined,
    b: THREE.Vector3 | undefined,
    t: number
  ): THREE.Vector3 {
    const result = new THREE.Vector3();
    if (a && b) {
      result.set(
        this.lerp(a.x, b.x, t),
        this.lerp(a.y, b.y, t),
        this.lerp(a.z, b.z, t)
      );
    } else if (b) {
      result.copy(b);
    }
    return result;
  }

  private lerpEuler(
    a: THREE.Euler | undefined,
    b: THREE.Euler | undefined,
    t: number
  ): THREE.Euler {
    const result = new THREE.Euler();
    if (a && b) {
      result.set(
        this.lerp(a.x, b.x, t),
        this.lerp(a.y, b.y, t),
        this.lerp(a.z, b.z, t)
      );
    } else if (b) {
      result.copy(b);
    }
    return result;
  }

  private lerpColor(
    a: string | undefined,
    b: string | undefined,
    t: number
  ): string {
    if (!a || !b) return b || a || '#ffffff';

    const colorA = new THREE.Color(a);
    const colorB = new THREE.Color(b);
    colorA.lerp(colorB, t);
    return '#' + colorA.getHexString();
  }

  update(deltaTime: number): void {
    this.time += deltaTime;
    this.idleTime += deltaTime;
    this.blinkTimer += deltaTime;

    if (this.transitionProgress < 1) {
      this.transitionProgress += deltaTime * this.transitionSpeed;
      if (this.transitionProgress >= 1) {
        this.transitionProgress = 1;
        this.currentConfig = { ...this.targetConfig };
      }
    }

    this.updateBlink();
    this.applyEmotionAnimation(deltaTime);
  }

  private updateBlink(): void {
    if (!this.leftEye || !this.rightEye) return;

    if (this.blinkTimer >= this.nextBlink && !this.isBlinking) {
      this.isBlinking = true;
      this.blinkTimer = 0;
    }

    if (this.isBlinking) {
      const blinkProgress = this.blinkTimer / this.blinkDuration;
      let scaleY = 1;

      if (blinkProgress < 0.5) {
        scaleY = 1 - blinkProgress * 2;
      } else {
        scaleY = (blinkProgress - 0.5) * 2;
      }

      scaleY = Math.max(0.1, scaleY);

      this.leftEye.scale.y = scaleY;
      this.rightEye.scale.y = scaleY;

      if (blinkProgress >= 1) {
        this.isBlinking = false;
        this.blinkTimer = 0;
        this.nextBlink = 2 + Math.random() * 4;
        this.leftEye.scale.y = 1;
        this.rightEye.scale.y = 1;
      }
    }
  }

  private applyEmotionAnimation(deltaTime: number): void {
    if (!this.avatar) return;

    const t = this.transitionProgress;
    const idle = this.emotionConfigs.idle;
    const target = this.targetConfig;

    const breathAmount =
      Math.sin(this.time * (target.breathSpeed || idle.breathSpeed || 1.5)) *
      (target.breathIntensity || idle.breathIntensity || 0.02);
    const swayX =
      Math.sin(this.time * (target.swaySpeed || idle.swaySpeed || 0.5)) *
      (target.swayIntensity || idle.swayIntensity || 0.02);
    const swayY =
      Math.cos(
        this.time * ((target.swaySpeed || idle.swaySpeed || 0.5) * 0.7)
      ) *
      ((target.swayIntensity || idle.swayIntensity || 0.02) * 0.5);
    const bounce =
      Math.abs(Math.sin(this.time * (target.bounceSpeed || 1))) *
      (target.bounceIntensity || 0);

    if (this.head) {
      const tiltX = this.lerp(
        this.currentConfig.headTilt?.x || 0,
        target.headTilt?.x || 0,
        t
      );
      const tiltY = this.lerp(
        this.currentConfig.headTilt?.y || 0,
        target.headTilt?.y || 0,
        t
      );
      const tiltZ = this.lerp(
        this.currentConfig.headTilt?.z || 0,
        target.headTilt?.z || 0,
        t
      );

      this.head.rotation.set(tiltX + swayY, tiltY, tiltZ + swayX);
      this.head.position.y = 1.6 + breathAmount + bounce;
    }

    if (this.body) {
      const scaleX = this.lerp(
        this.currentConfig.bodyScale?.x || 1,
        target.bodyScale?.x || 1,
        t
      );
      const scaleY = this.lerp(
        this.currentConfig.bodyScale?.y || 1,
        target.bodyScale?.y || 1,
        t
      );
      const scaleZ = this.lerp(
        this.currentConfig.bodyScale?.z || 1,
        target.bodyScale?.z || 1,
        t
      );

      this.body.scale.set(scaleX, scaleY, scaleZ);
      this.body.position.y =
        (target.bodyOffset?.y || 0) + 1.0 + breathAmount * 0.5 + bounce * 0.5;
    }

    if (this.leftEye && this.rightEye) {
      const eyeScale = this.lerp(
        this.currentConfig.eyeScale || 1,
        target.eyeScale || 1,
        t
      );
      const eyeColor = this.lerpColor(
        this.currentConfig.eyeColor,
        target.eyeColor,
        t
      );

      if (!this.isBlinking) {
        this.leftEye.scale.setScalar(eyeScale);
        this.rightEye.scale.setScalar(eyeScale);
      }

      const eyeMat =
        this.leftEye.material instanceof THREE.MeshStandardMaterial
          ? this.leftEye.material
          : null;
      if (eyeMat) {
        eyeMat.color.set(eyeColor);

        if (target.emissiveColor) {
          eyeMat.emissive = new THREE.Color(
            this.lerpColor(
              (this.currentConfig.emissiveColor || '') as string,
              target.emissiveColor,
              t
            )
          );
          eyeMat.emissiveIntensity = this.lerp(
            this.currentConfig.emissiveIntensity || 0,
            target.emissiveIntensity || 0,
            t
          );
        }
      }
    }

    if (this.leftArm && target.armRotation) {
      const leftRot = this.lerpEuler(
        this.currentConfig.armRotation?.left,
        target.armRotation.left,
        t
      );
      this.leftArm.rotation.copy(leftRot);
    }

    if (this.rightArm && target.armRotation) {
      const rightRot = this.lerpEuler(
        this.currentConfig.armRotation?.right,
        target.armRotation.right,
        t
      );
      this.rightArm.rotation.copy(rightRot);
    }

    if (target.colorTint && this.avatar) {
      this.avatar.traverse((child) => {
        if (
          child instanceof THREE.Mesh &&
          child.material instanceof THREE.MeshStandardMaterial
        ) {
          const tint = new THREE.Color(target.colorTint!);
          const current = child.material.color.clone();
          current.lerp(tint, t * 0.3);
          child.material.color.copy(current);
        }
      });
    }
  }

  private detectEmotionFromText(text: string): AvatarEmotion {
    const lower = text.toLowerCase();

    const excitedPatterns = [
      /!\s*!/g,
      /\b(amazing|awesome|incredible|wow|excited|love|fantastic)\b/g,
      /\b(happy|great|excellent)\b/gi,
    ];
    const angryPatterns = [
      /\b(angry|mad|furious|hate|terrible|awful|horrible|worst|bad)\b/gi,
    ];
    const sadPatterns = [
      /\b(sad|depressed|unhappy|miss|alone|lonely|sorry)\b/gi,
    ];
    const thinkingPatterns = [
      /\b(hmm|umm|well|let me think|actually|i wonder|maybe)\b/gi,
    ];

    let excitedCount = 0;
    let angryCount = 0;
    let sadCount = 0;
    let thinkingCount = 0;

    excitedPatterns.forEach(
      (p) => (excitedCount += (lower.match(p) || []).length)
    );
    angryPatterns.forEach((p) => (angryCount += (lower.match(p) || []).length));
    sadPatterns.forEach((p) => (sadCount += (lower.match(p) || []).length));
    thinkingPatterns.forEach(
      (p) => (thinkingCount += (lower.match(p) || []).length)
    );

    if (excitedCount >= 2) return 'excited';
    if (angryCount >= 1) return 'angry';
    if (sadCount >= 1) return 'sad';
    if (thinkingCount >= 1) return 'thinking';

    return 'idle';
  }

  reactToAIResponse(text: string): void {
    const emotion = this.detectEmotionFromText(text);
    this.setEmotion(emotion, 3);

    setTimeout(() => {
      this.setEmotion('idle', 2);
    }, 3000);
  }

  startListening(): void {
    this.setEmotion('listening', 4);
  }

  stopListening(): void {
    this.setEmotion('idle', 2);
  }

  setWalking(enabled: boolean): void {
    if (enabled) {
      this.setEmotion('walking', 3);
    } else {
      this.setEmotion('idle', 2);
    }
  }

  getCurrentEmotion(): AvatarEmotion {
    return this.currentEmotion;
  }

  reset(): void {
    this.setEmotion('idle', 3);
    this.transitionProgress = 0;
  }

  dispose(): void {
    if (this.avatar) {
      this.avatar.traverse((child) => {
        if (child instanceof THREE.Mesh && this.originalMaterials.has(child)) {
          const originalMats = this.originalMaterials.get(child);
          if (originalMats) {
            child.material =
              originalMats.length === 1 ? originalMats[0] : originalMats;
          }
        }
      });
    }
    this.avatar = null;
    this.head = null;
    this.body = null;
    this.leftEye = null;
    this.rightEye = null;
    this.originalMaterials.clear();
  }
}

export const avatarAnimations = {
  create: () => new AvatarAnimations(),
};
