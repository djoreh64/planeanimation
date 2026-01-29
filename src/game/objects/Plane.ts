import Phaser from "phaser";
import { CONSTANTS } from "../constants";

export class Plane extends Phaser.Physics.Arcade.Sprite {
  declare body: Phaser.Physics.Arcade.Body;
  private readonly trailGfx: Phaser.GameObjects.Graphics;
  private readonly trailPoints: Array<{ x: number; y: number }> = [];
  private smoothedTail?: { x: number; y: number };
  private lastTrailSampleAt: number = 0;
  public state: "IDLE" | "FLIGHT" | "LANDED" = "IDLE";
  public currentDeck?: Phaser.GameObjects.Zone;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y, CONSTANTS.ASSETS.PLANE);
    scene.add.existing(this);
    scene.physics.add.existing(this);

    this.setDisplaySize(CONSTANTS.PLANE.WIDTH, CONSTANTS.PLANE.HEIGHT);
    this.body.setGravityY(CONSTANTS.PLANE.GRAVITY);
    this.body.setAllowGravity(false);
    this.body.setCollideWorldBounds(false);
    this.body.setDragY(CONSTANTS.PLANE.DRAG_Y);
    this.body.setMaxVelocity(10000, CONSTANTS.PLANE.MAX_FALL_SPEED);

    this.trailGfx = this.scene.add.graphics();
    this.trailGfx.setDepth(this.depth - 1);
  }

  isSupportedByDeck(minRatio = 0.45): boolean {
    if (!this.currentDeck) return false;

    const planeLeft = this.x - this.displayWidth / 2;
    const planeRight = this.x + this.displayWidth / 2;

    const deckLeft = this.currentDeck.x - this.currentDeck.width / 2;
    const deckRight = this.currentDeck.x + this.currentDeck.width / 2;

    const overlap =
      Math.min(planeRight, deckRight) - Math.max(planeLeft, deckLeft);

    return overlap >= this.displayWidth * minRatio;
  }

  update() {
    if (this.state === "FLIGHT") {
      const velocityY = this.body.velocity.y;

      if (velocityY < CONSTANTS.PLANE.MAX_RISE_SPEED) {
        this.body.setVelocityY(CONSTANTS.PLANE.MAX_RISE_SPEED);
      }

      const targetRot = Phaser.Math.Clamp(velocityY * 0.0015, -0.75, 0.35);
      this.rotation = Phaser.Math.Linear(
        this.rotation,
        targetRot,
        CONSTANTS.PLANE.ROTATION_SMOOTHING,
      );

      this.updateTrail();

      this.redrawTrail();
    } else {
      if (this.trailPoints.length) this.trailPoints.length = 0;
      this.smoothedTail = undefined;
      this.trailGfx.clear();
    }
  }

  jump(strength: number) {
    this.applyVerticalImpulse(strength);
  }

  drop() {
    this.body.setVelocityY(CONSTANTS.PLANE.DROP_STRENGTH);
  }

  applyVerticalImpulse(deltaVy: number) {
    const next = Phaser.Math.Clamp(
      this.body.velocity.y + deltaVy,
      CONSTANTS.PLANE.MAX_RISE_SPEED,
      CONSTANTS.PLANE.MAX_FALL_SPEED,
    );
    this.body.setVelocityY(next);
  }

  resetArc(upVelocityY: number) {
    this.body.setVelocityY(
      Phaser.Math.Clamp(
        upVelocityY,
        CONSTANTS.PLANE.MAX_RISE_SPEED,
        CONSTANTS.PLANE.MAX_FALL_SPEED,
      ),
    );
  }

  syncTrailDepth() {
    this.trailGfx.setDepth(this.depth - 1);
  }

  private redrawTrail() {
    const pts = this.trailPoints;
    if (pts.length < 2) return;

    this.trailGfx.clear();
    this.trailGfx.setBlendMode(Phaser.BlendModes.NORMAL);

    const spline = new Phaser.Curves.Spline(
      pts.map((p) => new Phaser.Math.Vector2(p.x, p.y)),
    );
    const samples = Math.min(90, Math.max(30, pts.length * 2));
    const sampled = spline.getPoints(samples);

    for (let i = 0; i < sampled.length - 1; i++) {
      const t = i / (sampled.length - 1); 
      const alpha = 0.02 + t * 0.16;
      const width = 0.9 + t * 4.1;
      this.trailGfx.lineStyle(width, 0xffffff, alpha);
      this.trailGfx.beginPath();
      this.trailGfx.moveTo(sampled[i].x, sampled[i].y);
      this.trailGfx.lineTo(sampled[i + 1].x, sampled[i + 1].y);
      this.trailGfx.strokePath();
    }
  }

  private updateTrail() {
    const desiredTailX = this.x - this.displayWidth * 0.35; 
    const desiredTailY = this.y;

    if (this.smoothedTail === undefined) {
      this.smoothedTail = { x: desiredTailX, y: desiredTailY };
      this.lastTrailSampleAt = this.scene.time.now;
      return;
    }

    const s = 0.12;
    this.smoothedTail.x = Phaser.Math.Linear(this.smoothedTail.x, desiredTailX, s);
    this.smoothedTail.y = Phaser.Math.Linear(this.smoothedTail.y, desiredTailY, s);

    const now = this.scene.time.now;
    const sampleEveryMs = 20;
    if (now - this.lastTrailSampleAt < sampleEveryMs) return;
    this.lastTrailSampleAt = now;

    const last = this.trailPoints.at(-1);
    const minDist = 1.5;
    const tx = this.smoothedTail.x;
    const ty = this.smoothedTail.y;
    if (last && Phaser.Math.Distance.Between(last.x, last.y, tx, ty) < minDist) return;

    this.trailPoints.push({ x: tx, y: ty });
    if (this.trailPoints.length > 42) this.trailPoints.shift();
  }
}
