// TurboWarp カスタム3D拡張機能
// Three.js を使ってScratchのステージ上に3Dグラフィックスを描画します
// 使用方法: TurboWarp > 拡張機能 > カスタム拡張機能 > URLまたはファイルから読み込み

(async () => {
  // Three.js を動的にロード
  await new Promise((resolve, reject) => {
    if (window.THREE) return resolve();
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });

  const THREE = window.THREE;

  // ========================
  // 3D エンジン本体
  // ========================
  class Engine3D {
    constructor() {
      this.scene = null;
      this.camera = null;
      this.renderer = null;
      this.canvas = null;
      this.objects = {};   // name → Three.js Object3D
      this.lights = {};
      this.animating = false;
      this.animFrameId = null;
    }

    init(width, height) {
      this.cleanup();

      // シーン
      this.scene = new THREE.Scene();

      // カメラ (透視投影)
      this.camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
      this.camera.position.set(0, 0, 5);

      // オフスクリーン Canvas
      this.canvas = document.createElement('canvas');
      this.canvas.width = width;
      this.canvas.height = height;

      // WebGL レンダラー
      this.renderer = new THREE.WebGLRenderer({
        canvas: this.canvas,
        alpha: true,
        antialias: true
      });
      this.renderer.setSize(width, height);
      this.renderer.setClearColor(0x000000, 0); // 透明背景

      // デフォルト環境光
      const ambient = new THREE.AmbientLight(0xffffff, 0.6);
      ambient.name = '__ambient__';
      this.scene.add(ambient);
      this.lights['ambient'] = ambient;

      // デフォルト指向光
      const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
      dirLight.position.set(5, 10, 7);
      dirLight.name = '__dir__';
      this.scene.add(dirLight);
      this.lights['dir'] = dirLight;
    }

    render() {
      if (this.renderer && this.scene && this.camera) {
        this.renderer.render(this.scene, this.camera);
      }
    }

    startAutoRender() {
      if (this.animating) return;
      this.animating = true;
      const loop = () => {
        if (!this.animating) return;
        this.render();
        this.animFrameId = requestAnimationFrame(loop);
      };
      loop();
    }

    stopAutoRender() {
      this.animating = false;
      if (this.animFrameId) cancelAnimationFrame(this.animFrameId);
    }

    cleanup() {
      this.stopAutoRender();
      if (this.renderer) {
        this.renderer.dispose();
        this.renderer = null;
      }
      this.scene = null;
      this.camera = null;
      this.canvas = null;
      this.objects = {};
      this.lights = {};
    }

    getImageData() {
      this.render();
      return this.canvas.toDataURL('image/png');
    }

    // オブジェクト取得 (なければ null)
    getObj(name) {
      return this.objects[name] || null;
    }

    addObj(name, mesh) {
      // 同名があれば削除
      if (this.objects[name]) {
        this.scene.remove(this.objects[name]);
      }
      mesh.name = name;
      this.scene.add(mesh);
      this.objects[name] = mesh;
    }

    removeObj(name) {
      if (this.objects[name]) {
        this.scene.remove(this.objects[name]);
        delete this.objects[name];
      }
    }
  }

  const engine = new Engine3D();

  // ========================
  // Scratch ステージへの描画ヘルパー
  // ========================
  function drawToStage(util) {
    // 描画データURLを取得してコスチュームとして適用
    const dataURL = engine.getImageData();
    if (!dataURL || !util.target) return;

    const img = new Image();
    img.onload = () => {
      const bitmap = Scratch.vm.runtime.renderer.createBitmapSkin(img);
      if (bitmap) {
        // コスチュームを一時的に適用するためのSVGオーバーレイ
        // (TurboWarpの内部APIを使用)
        try {
          const target = util.target;
          const runtime = Scratch.vm.runtime;
          const skinId = bitmap;
          runtime.renderer.updateDrawableSkinId(target.drawableID, skinId);
        } catch (e) {
          // フォールバック: stamp として描画
        }
      }
    };
    img.src = dataURL;
  }

  // CSS color string → hex number
  function colorToHex(color) {
    const ctx = document.createElement('canvas').getContext('2d');
    ctx.fillStyle = color;
    // ctx.fillStyleに変換後の色が入る
    const hex = ctx.fillStyle.replace('#', '0x');
    return parseInt(hex, 16);
  }

  // ========================
  // 拡張機能クラス
  // ========================
  class Extension3D {
    getInfo() {
      return {
        id: 'tw3d',
        name: '3D エンジン',
        color1: '#1a1a2e',
        color2: '#16213e',
        color3: '#0f3460',
        blocks: [

          // ── セットアップ ──────────────────────────
          {
            opcode: 'setup',
            blockType: Scratch.BlockType.COMMAND,
            text: '3D初期化 幅[W] 高さ[H]',
            arguments: {
              W: { type: Scratch.ArgumentType.NUMBER, defaultValue: 480 },
              H: { type: Scratch.ArgumentType.NUMBER, defaultValue: 360 }
            }
          },
          {
            opcode: 'render',
            blockType: Scratch.BlockType.COMMAND,
            text: '3Dレンダリングして描画'
          },
          { blockType: Scratch.BlockType.LABEL, text: '── オブジェクト追加 ──' },

          // ── オブジェクト ──────────────────────────
          {
            opcode: 'addBox',
            blockType: Scratch.BlockType.COMMAND,
            text: 'ボックス追加 名前[NAME] 幅[W] 高さ[H] 奥行[D] 色[COLOR]',
            arguments: {
              NAME:  { type: Scratch.ArgumentType.STRING, defaultValue: 'box1' },
              W:     { type: Scratch.ArgumentType.NUMBER, defaultValue: 1 },
              H:     { type: Scratch.ArgumentType.NUMBER, defaultValue: 1 },
              D:     { type: Scratch.ArgumentType.NUMBER, defaultValue: 1 },
              COLOR: { type: Scratch.ArgumentType.COLOR,  defaultValue: '#4488ff' }
            }
          },
          {
            opcode: 'addSphere',
            blockType: Scratch.BlockType.COMMAND,
            text: '球追加 名前[NAME] 半径[R] 色[COLOR]',
            arguments: {
              NAME:  { type: Scratch.ArgumentType.STRING, defaultValue: 'sphere1' },
              R:     { type: Scratch.ArgumentType.NUMBER, defaultValue: 1 },
              COLOR: { type: Scratch.ArgumentType.COLOR,  defaultValue: '#ff4488' }
            }
          },
          {
            opcode: 'addCylinder',
            blockType: Scratch.BlockType.COMMAND,
            text: '円柱追加 名前[NAME] 半径[R] 高さ[H] 色[COLOR]',
            arguments: {
              NAME:  { type: Scratch.ArgumentType.STRING, defaultValue: 'cyl1' },
              R:     { type: Scratch.ArgumentType.NUMBER, defaultValue: 0.5 },
              H:     { type: Scratch.ArgumentType.NUMBER, defaultValue: 2 },
              COLOR: { type: Scratch.ArgumentType.COLOR,  defaultValue: '#44ff88' }
            }
          },
          {
            opcode: 'addCone',
            blockType: Scratch.BlockType.COMMAND,
            text: '円錐追加 名前[NAME] 半径[R] 高さ[H] 色[COLOR]',
            arguments: {
              NAME:  { type: Scratch.ArgumentType.STRING, defaultValue: 'cone1' },
              R:     { type: Scratch.ArgumentType.NUMBER, defaultValue: 0.5 },
              H:     { type: Scratch.ArgumentType.NUMBER, defaultValue: 2 },
              COLOR: { type: Scratch.ArgumentType.COLOR,  defaultValue: '#ffaa00' }
            }
          },
          {
            opcode: 'addPlane',
            blockType: Scratch.BlockType.COMMAND,
            text: '平面追加 名前[NAME] 幅[W] 高さ[H] 色[COLOR]',
            arguments: {
              NAME:  { type: Scratch.ArgumentType.STRING, defaultValue: 'plane1' },
              W:     { type: Scratch.ArgumentType.NUMBER, defaultValue: 5 },
              H:     { type: Scratch.ArgumentType.NUMBER, defaultValue: 5 },
              COLOR: { type: Scratch.ArgumentType.COLOR,  defaultValue: '#888888' }
            }
          },
          {
            opcode: 'removeObject',
            blockType: Scratch.BlockType.COMMAND,
            text: 'オブジェクト削除 名前[NAME]',
            arguments: {
              NAME: { type: Scratch.ArgumentType.STRING, defaultValue: 'box1' }
            }
          },

          { blockType: Scratch.BlockType.LABEL, text: '── 変換 ──' },

          // ── 変換 ──────────────────────────
          {
            opcode: 'setPosition',
            blockType: Scratch.BlockType.COMMAND,
            text: '[NAME] の位置 X[X] Y[Y] Z[Z]',
            arguments: {
              NAME: { type: Scratch.ArgumentType.STRING, defaultValue: 'box1' },
              X: { type: Scratch.ArgumentType.NUMBER, defaultValue: 0 },
              Y: { type: Scratch.ArgumentType.NUMBER, defaultValue: 0 },
              Z: { type: Scratch.ArgumentType.NUMBER, defaultValue: 0 }
            }
          },
          {
            opcode: 'setRotation',
            blockType: Scratch.BlockType.COMMAND,
            text: '[NAME] の回転 X[X] Y[Y] Z[Z] 度',
            arguments: {
              NAME: { type: Scratch.ArgumentType.STRING, defaultValue: 'box1' },
              X: { type: Scratch.ArgumentType.NUMBER, defaultValue: 0 },
              Y: { type: Scratch.ArgumentType.NUMBER, defaultValue: 45 },
              Z: { type: Scratch.ArgumentType.NUMBER, defaultValue: 0 }
            }
          },
          {
            opcode: 'setScale',
            blockType: Scratch.BlockType.COMMAND,
            text: '[NAME] の大きさ X[X] Y[Y] Z[Z]',
            arguments: {
              NAME: { type: Scratch.ArgumentType.STRING, defaultValue: 'box1' },
              X: { type: Scratch.ArgumentType.NUMBER, defaultValue: 1 },
              Y: { type: Scratch.ArgumentType.NUMBER, defaultValue: 1 },
              Z: { type: Scratch.ArgumentType.NUMBER, defaultValue: 1 }
            }
          },
          {
            opcode: 'rotateBy',
            blockType: Scratch.BlockType.COMMAND,
            text: '[NAME] を回す X[X] Y[Y] Z[Z] 度',
            arguments: {
              NAME: { type: Scratch.ArgumentType.STRING, defaultValue: 'box1' },
              X: { type: Scratch.ArgumentType.NUMBER, defaultValue: 0 },
              Y: { type: Scratch.ArgumentType.NUMBER, defaultValue: 5 },
              Z: { type: Scratch.ArgumentType.NUMBER, defaultValue: 0 }
            }
          },

          { blockType: Scratch.BlockType.LABEL, text: '── カメラ ──' },

          // ── カメラ ──────────────────────────
          {
            opcode: 'setCameraPos',
            blockType: Scratch.BlockType.COMMAND,
            text: 'カメラ位置 X[X] Y[Y] Z[Z]',
            arguments: {
              X: { type: Scratch.ArgumentType.NUMBER, defaultValue: 0 },
              Y: { type: Scratch.ArgumentType.NUMBER, defaultValue: 2 },
              Z: { type: Scratch.ArgumentType.NUMBER, defaultValue: 5 }
            }
          },
          {
            opcode: 'lookAt',
            blockType: Scratch.BlockType.COMMAND,
            text: 'カメラを向ける X[X] Y[Y] Z[Z]',
            arguments: {
              X: { type: Scratch.ArgumentType.NUMBER, defaultValue: 0 },
              Y: { type: Scratch.ArgumentType.NUMBER, defaultValue: 0 },
              Z: { type: Scratch.ArgumentType.NUMBER, defaultValue: 0 }
            }
          },
          {
            opcode: 'setFOV',
            blockType: Scratch.BlockType.COMMAND,
            text: 'カメラ視野角[FOV] 度',
            arguments: {
              FOV: { type: Scratch.ArgumentType.NUMBER, defaultValue: 75 }
            }
          },

          { blockType: Scratch.BlockType.LABEL, text: '── 背景・ライト ──' },

          // ── 背景・ライト ──────────────────────────
          {
            opcode: 'setBackground',
            blockType: Scratch.BlockType.COMMAND,
            text: '背景色[COLOR]',
            arguments: {
              COLOR: { type: Scratch.ArgumentType.COLOR, defaultValue: '#111133' }
            }
          },
          {
            opcode: 'setAmbientLight',
            blockType: Scratch.BlockType.COMMAND,
            text: '環境光 色[COLOR] 強さ[INT]',
            arguments: {
              COLOR: { type: Scratch.ArgumentType.COLOR, defaultValue: '#ffffff' },
              INT:   { type: Scratch.ArgumentType.NUMBER, defaultValue: 0.6 }
            }
          },
          {
            opcode: 'setDirLight',
            blockType: Scratch.BlockType.COMMAND,
            text: '指向光 色[COLOR] 強さ[INT] 位置X[X] Y[Y] Z[Z]',
            arguments: {
              COLOR: { type: Scratch.ArgumentType.COLOR, defaultValue: '#ffffff' },
              INT:   { type: Scratch.ArgumentType.NUMBER, defaultValue: 1 },
              X:     { type: Scratch.ArgumentType.NUMBER, defaultValue: 5 },
              Y:     { type: Scratch.ArgumentType.NUMBER, defaultValue: 10 },
              Z:     { type: Scratch.ArgumentType.NUMBER, defaultValue: 7 }
            }
          },

          { blockType: Scratch.BlockType.LABEL, text: '── 情報取得 ──' },

          // ── ゲッター ──────────────────────────
          {
            opcode: 'getX',
            blockType: Scratch.BlockType.REPORTER,
            text: '[NAME] のX座標',
            arguments: {
              NAME: { type: Scratch.ArgumentType.STRING, defaultValue: 'box1' }
            }
          },
          {
            opcode: 'getY',
            blockType: Scratch.BlockType.REPORTER,
            text: '[NAME] のY座標',
            arguments: {
              NAME: { type: Scratch.ArgumentType.STRING, defaultValue: 'box1' }
            }
          },
          {
            opcode: 'getZ',
            blockType: Scratch.BlockType.REPORTER,
            text: '[NAME] のZ座標',
            arguments: {
              NAME: { type: Scratch.ArgumentType.STRING, defaultValue: 'box1' }
            }
          },
          {
            opcode: 'objectExists',
            blockType: Scratch.BlockType.BOOLEAN,
            text: '[NAME] が存在する',
            arguments: {
              NAME: { type: Scratch.ArgumentType.STRING, defaultValue: 'box1' }
            }
          }
        ]
      };
    }

    // ========================
    // ブロック実装
    // ========================

    setup({ W, H }) {
      engine.init(Number(W), Number(H));
    }

    render(args, util) {
      drawToStage(util);
    }

    // ─ オブジェクト追加 ─
    addBox({ NAME, W, H, D, COLOR }) {
      if (!engine.scene) return;
      const geo = new THREE.BoxGeometry(Number(W), Number(H), Number(D));
      const mat = new THREE.MeshPhongMaterial({ color: colorToHex(COLOR) });
      engine.addObj(String(NAME), new THREE.Mesh(geo, mat));
    }

    addSphere({ NAME, R, COLOR }) {
      if (!engine.scene) return;
      const geo = new THREE.SphereGeometry(Number(R), 32, 32);
      const mat = new THREE.MeshPhongMaterial({ color: colorToHex(COLOR) });
      engine.addObj(String(NAME), new THREE.Mesh(geo, mat));
    }

    addCylinder({ NAME, R, H, COLOR }) {
      if (!engine.scene) return;
      const geo = new THREE.CylinderGeometry(Number(R), Number(R), Number(H), 32);
      const mat = new THREE.MeshPhongMaterial({ color: colorToHex(COLOR) });
      engine.addObj(String(NAME), new THREE.Mesh(geo, mat));
    }

    addCone({ NAME, R, H, COLOR }) {
      if (!engine.scene) return;
      const geo = new THREE.ConeGeometry(Number(R), Number(H), 32);
      const mat = new THREE.MeshPhongMaterial({ color: colorToHex(COLOR) });
      engine.addObj(String(NAME), new THREE.Mesh(geo, mat));
    }

    addPlane({ NAME, W, H, COLOR }) {
      if (!engine.scene) return;
      const geo = new THREE.PlaneGeometry(Number(W), Number(H));
      const mat = new THREE.MeshPhongMaterial({
        color: colorToHex(COLOR),
        side: THREE.DoubleSide
      });
      engine.addObj(String(NAME), new THREE.Mesh(geo, mat));
    }

    removeObject({ NAME }) {
      engine.removeObj(String(NAME));
    }

    // ─ 変換 ─
    setPosition({ NAME, X, Y, Z }) {
      const obj = engine.getObj(String(NAME));
      if (obj) obj.position.set(Number(X), Number(Y), Number(Z));
    }

    setRotation({ NAME, X, Y, Z }) {
      const obj = engine.getObj(String(NAME));
      if (obj) {
        obj.rotation.set(
          THREE.MathUtils.degToRad(Number(X)),
          THREE.MathUtils.degToRad(Number(Y)),
          THREE.MathUtils.degToRad(Number(Z))
        );
      }
    }

    setScale({ NAME, X, Y, Z }) {
      const obj = engine.getObj(String(NAME));
      if (obj) obj.scale.set(Number(X), Number(Y), Number(Z));
    }

    rotateBy({ NAME, X, Y, Z }) {
      const obj = engine.getObj(String(NAME));
      if (obj) {
        obj.rotation.x += THREE.MathUtils.degToRad(Number(X));
        obj.rotation.y += THREE.MathUtils.degToRad(Number(Y));
        obj.rotation.z += THREE.MathUtils.degToRad(Number(Z));
      }
    }

    // ─ カメラ ─
    setCameraPos({ X, Y, Z }) {
      if (!engine.camera) return;
      engine.camera.position.set(Number(X), Number(Y), Number(Z));
    }

    lookAt({ X, Y, Z }) {
      if (!engine.camera) return;
      engine.camera.lookAt(new THREE.Vector3(Number(X), Number(Y), Number(Z)));
    }

    setFOV({ FOV }) {
      if (!engine.camera) return;
      engine.camera.fov = Number(FOV);
      engine.camera.updateProjectionMatrix();
    }

    // ─ 背景・ライト ─
    setBackground({ COLOR }) {
      if (!engine.renderer) return;
      const hex = colorToHex(COLOR);
      engine.renderer.setClearColor(hex, 1);
    }

    setAmbientLight({ COLOR, INT }) {
      if (!engine.lights.ambient) return;
      engine.lights.ambient.color.setHex(colorToHex(COLOR));
      engine.lights.ambient.intensity = Number(INT);
    }

    setDirLight({ COLOR, INT, X, Y, Z }) {
      if (!engine.lights.dir) return;
      engine.lights.dir.color.setHex(colorToHex(COLOR));
      engine.lights.dir.intensity = Number(INT);
      engine.lights.dir.position.set(Number(X), Number(Y), Number(Z));
    }

    // ─ ゲッター ─
    getX({ NAME }) {
      const obj = engine.getObj(String(NAME));
      return obj ? obj.position.x : 0;
    }

    getY({ NAME }) {
      const obj = engine.getObj(String(NAME));
      return obj ? obj.position.y : 0;
    }

    getZ({ NAME }) {
      const obj = engine.getObj(String(NAME));
      return obj ? obj.position.z : 0;
    }

    objectExists({ NAME }) {
      return !!engine.getObj(String(NAME));
    }
  }

  Scratch.extensions.register(new Extension3D());
})();
