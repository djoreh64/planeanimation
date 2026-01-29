import Phaser from "phaser";
import { CONSTANTS } from "../constants";

export class GameObject extends Phaser.Physics.Arcade.Sprite {
  public value: number | string;
  public objectType: string;
  private feedbackText?: Phaser.GameObjects.Text;
  backgroundSprite?: Phaser.GameObjects.Image;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    type: string,
    value: number | string = 0,
  ) {
    const texture =
      type === CONSTANTS.OBJECTS.TYPES.ROCKET ? CONSTANTS.ASSETS.ROCKET : "";
    super(scene, x, y, texture);

    this.objectType = type;
    this.value = value;

    scene.add.existing(this);
    scene.physics.add.existing(this);

    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setAllowGravity(false);
    body.setImmovable(true);

    if (type === CONSTANTS.OBJECTS.TYPES.ROCKET) {
      this.setDisplaySize(50, 24);
      body.setSize(34, 16, true);
    } else {
      this.setVisible(false);

      if (value === 10 || value.toString().startsWith("x")) {
        const bg = scene.add
          .image(this.x, this.y, "text-effect")
          .setOrigin(0.5);

        const targetSize = 102;
        const scale = targetSize / Math.max(bg.width, bg.height);
        bg.setScale(scale);

        this.backgroundSprite = bg;
      }

      this.feedbackText = scene.add
        .text(this.x, this.y, value.toString(), {
          fontSize: "24px",
          color: "#ffffff",
          fontFamily: "Rubik, sans-serif",
          fontStyle: "bold",
          stroke: "#000000",
          strokeThickness: 0,
        })
        .setOrigin(0.5);

      this.feedbackText.setShadow(4, 4, "#000000", 0, false, true);
      const isMultiplier = value.toString().startsWith("x");
      body.setSize(isMultiplier ? 18 : 26, isMultiplier ? 18 : 26, true);
    }
  }

  preUpdate(time: number, delta: number) {
    super.preUpdate(time, delta);
    if (this.feedbackText) {
      this.feedbackText.x = this.x;
      this.feedbackText.y = this.y;
    }
    if (this.backgroundSprite) {
      this.backgroundSprite.x = this.x;
      this.backgroundSprite.y = this.y;
    }
  }

  explode() {
    if (this.objectType === CONSTANTS.OBJECTS.TYPES.ROCKET) {
      const boom = this.scene.add
        .image(this.x, this.y, "explode")
        .setOrigin(0.5)
        .setDepth(200);

      const targetSize = 102;
      const scale = targetSize / Math.max(boom.width, boom.height);
      boom.setScale(scale);

      this.scene.tweens.add({
        targets: boom,
        scale: scale * 1.2,
        alpha: 0,
        duration: 350,
        ease: "Cubic.easeOut",
        onComplete: () => boom.destroy(),
      });
    }

    super.destroy();
  }

  destroy(fromScene?: boolean) {
    if (this.feedbackText) this.feedbackText.destroy();
    if (this.backgroundSprite) this.backgroundSprite.destroy();
    super.destroy(fromScene);
  }
}
