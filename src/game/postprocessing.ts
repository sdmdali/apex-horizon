import * as THREE from 'three';

/**
 * High-performance Velocity Motion Blur Post-Processing Pipeline
 * Features ACES Filmic Tone Mapping and sRGB gamma conversion to ensure
 * photorealistic brightness and contrast, with directional radial streaking
 * during high-speed race sections.
 */
export class MotionBlurPass {
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.Camera;
  private renderTarget: THREE.WebGLRenderTarget;
  private postScene: THREE.Scene;
  private postCamera: THREE.OrthographicCamera;
  private quad: THREE.Mesh;
  private blurMaterial: THREE.ShaderMaterial;

  private currentStrength = 0;
  private currentCenter = new THREE.Vector2(0.5, 0.55);

  constructor(
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.Camera,
    width: number,
    height: number
  ) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;

    const pixelRatio = renderer.getPixelRatio();
    this.renderTarget = new THREE.WebGLRenderTarget(
      Math.max(1, Math.floor(width * pixelRatio)),
      Math.max(1, Math.floor(height * pixelRatio)),
      {
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
        type: THREE.HalfFloatType,
        samples: 4,
        depthBuffer: true,
        stencilBuffer: false,
      }
    );

    this.postScene = new THREE.Scene();
    this.postCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    const vertexShader = `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = vec4(position.xy, 0.0, 1.0);
      }
    `;

    const fragmentShader = `
      uniform sampler2D tDiffuse;
      uniform float uStrength;
      uniform vec2 uCenter;
      uniform vec2 uResolution;
      uniform float uTime;
      varying vec2 vUv;

      #include <common>

      void main() {
        vec2 uv = vUv;

        // When strength is negligible, pass through directly
        if (uStrength < 0.005) {
          gl_FragColor = texture2D(tDiffuse, uv);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
          return;
        }

        // Vector pointing outwards from projected car heading/vanishing point
        vec2 dir = uv - uCenter;
        float dist = length(dir);

        // Keep center focus zone (car + upcoming apex) sharp; edges blur heavily
        float edgeFactor = smoothstep(0.06, 0.85, dist);
        vec2 velocity = dir * edgeFactor * uStrength * 0.045;

        // Subtle pseudo-random dither to eliminate color banding
        float noise = fract(sin(dot(uv * uResolution + vec2(uTime * 12.0), vec2(12.9898, 78.233))) * 43758.5453);

        const int SAMPLES = 10;
        vec4 color = vec4(0.0);
        float totalWeight = 0.0;

        float chroma = uStrength * 0.0035 * edgeFactor;

        for (int i = 0; i < SAMPLES; i++) {
          float stepOffset = (float(i) + noise) / float(SAMPLES) - 0.5;
          vec2 sampleUv = clamp(uv + velocity * stepOffset, 0.0, 1.0);
          float weight = 1.0 - abs(stepOffset) * 1.35;

          float r = texture2D(tDiffuse, clamp(sampleUv + velocity * chroma * 1.4, 0.0, 1.0)).r;
          float g = texture2D(tDiffuse, sampleUv).g;
          float b = texture2D(tDiffuse, clamp(sampleUv - velocity * chroma * 1.4, 0.0, 1.0)).b;
          float a = texture2D(tDiffuse, sampleUv).a;

          color += vec4(r, g, b, a) * weight;
          totalWeight += weight;
        }

        gl_FragColor = color / totalWeight;
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `;

    this.blurMaterial = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        tDiffuse: { value: this.renderTarget.texture },
        uStrength: { value: 0.0 },
        uCenter: { value: new THREE.Vector2(0.5, 0.55) },
        uResolution: { value: new THREE.Vector2(width, height) },
        uTime: { value: 0.0 },
      },
      depthTest: false,
      depthWrite: false,
    });

    const quadGeo = new THREE.PlaneGeometry(2, 2);
    this.quad = new THREE.Mesh(quadGeo, this.blurMaterial);
    this.postScene.add(this.quad);
  }

  public setSize(width: number, height: number): void {
    const pixelRatio = this.renderer.getPixelRatio();
    this.renderTarget.setSize(
      Math.max(1, Math.floor(width * pixelRatio)),
      Math.max(1, Math.floor(height * pixelRatio))
    );
    this.blurMaterial.uniforms.uResolution.value.set(width, height);
  }

  /**
   * Render pass with dynamic speed-dependent motion blur and projected vanishing center
   */
  public render(
    speedKmH: number,
    isGas: boolean,
    targetScreenPos: THREE.Vector2 | null,
    dt: number,
    elapsedTime: number
  ): void {
    // Speed response curve: blur starts at ~65 km/h, reaching full intensity at 220+ km/h
    let targetStrength = 0;
    if (speedKmH > 65) {
      targetStrength = THREE.MathUtils.smoothstep(speedKmH, 65, 230);
      if (isGas) targetStrength *= 1.15; // Extra blur punch under heavy acceleration
    }

    // Smoothly ease in and out of blur to avoid jarring transitions
    this.currentStrength = THREE.MathUtils.lerp(
      this.currentStrength,
      targetStrength,
      Math.min(1, dt * 10.0)
    );

    // If speed is low and blur is dormant, render directly with Three.js native pipeline
    if (this.currentStrength < 0.005 && targetStrength < 0.005) {
      this.renderer.setRenderTarget(null);
      this.renderer.render(this.scene, this.camera);
      return;
    }

    // Update vanishing point center (screen space UV [0..1])
    if (targetScreenPos) {
      this.currentCenter.lerp(targetScreenPos, Math.min(1, dt * 12.0));
    } else {
      this.currentCenter.set(0.5, 0.55);
    }

    this.blurMaterial.uniforms.uStrength.value = this.currentStrength;
    this.blurMaterial.uniforms.uCenter.value.copy(this.currentCenter);
    this.blurMaterial.uniforms.uTime.value = elapsedTime;

    // 1. Render main 3D scene into offscreen RenderTarget
    this.renderer.setRenderTarget(this.renderTarget);
    this.renderer.render(this.scene, this.camera);

    // 2. Render post-processing fullscreen quad onto canvas with ACES tone mapping + sRGB
    this.renderer.setRenderTarget(null);
    this.renderer.render(this.postScene, this.postCamera);
  }

  public dispose(): void {
    this.renderTarget.dispose();
    this.blurMaterial.dispose();
    this.quad.geometry.dispose();
  }
}
