import Phaser from "phaser";
import { CONSTANTS } from "../constants";
import { Plane } from "../objects/Plane";
import { Boat } from "../objects/Boat";
import { GameObject } from "../objects/GameObject";

export class MainScene extends Phaser.Scene {
  private plane!: Plane;
  private sky!: Phaser.GameObjects.TileSprite;
  private clouds!: Phaser.GameObjects.Group;
  private nextCloudAt: number = 0;
  private ships!: Phaser.GameObjects.Group;
  private objects!: Phaser.Physics.Arcade.Group;
  private decks!: Phaser.Physics.Arcade.StaticGroup;
  private boatBodies!: Phaser.Physics.Arcade.StaticGroup;
  private distance: number = 0;
  private multiplier: number = CONSTANTS.INITIAL_MULTIPLIER;
  private isGameOver: boolean = false;
  private isRunning: boolean = false;
  private runSpeedX: number = CONSTANTS.PLANE.HORIZONTAL_SPEED;
  private boatCollider?: Phaser.Physics.Arcade.Collider;
  private nextSpawnX: number = 0;
  private spawnedBonus: number = 0;
  private spawnedRocket: number = 0;

  private rigTarget: number | null = null;
  private rigOutcome: "win" | "lose" | null = null;
  private rigPlan: Array<{
    type: "BONUS" | "ROCKET";
    value: number | string;
    hit: boolean;
  }> = [];
  private rigIndex: number = 0;
  private deckCollider?: Phaser.Physics.Arcade.Collider;
  private floatText?: Phaser.GameObjects.Text;
  private floatTextExpiresAt: number = 0;

  constructor() {
    super("MainScene");
  }

  preload() {
    this.load.image(CONSTANTS.ASSETS.SKY, "sky.png");
    this.load.image(CONSTANTS.ASSETS.PLANE, "plane.png");
    this.load.image(CONSTANTS.ASSETS.ROCKET, "rocket.png");
    this.load.image(CONSTANTS.ASSETS.BOAT, "boat.png");
    this.load.image("cloud", "cloud.png");
    this.load.image("text-effect", "text-effect.png");
    this.load.image("explode", "explode.png");
  }

  create() {
    this.isGameOver = false;
    this.isRunning = false;
    this.distance = 0;
    this.multiplier = CONSTANTS.INITIAL_MULTIPLIER;
    this.nextSpawnX = 0;
    this.spawnedBonus = 0;
    this.spawnedRocket = 0;
    this.nextCloudAt = 0;

    this.physics.world.setBounds(
      0,
      -10000,
      CONSTANTS.WORLD_WIDTH,
      10000 + CONSTANTS.HEIGHT,
    );

    const skyTexture = this.textures.get(CONSTANTS.ASSETS.SKY);
    const skyOriginalHeight = skyTexture.getSourceImage().height;

    const scale = CONSTANTS.HORIZON_Y / skyOriginalHeight;

    this.sky = this.add
      .tileSprite(
        0,
        0,
        CONSTANTS.WIDTH * 2,
        CONSTANTS.HORIZON_Y,
        CONSTANTS.ASSETS.SKY,
      )
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setTileScale(scale, scale)
      .setDepth(0);

    this.clouds = this.add.group();
    this.add
      .rectangle(0, CONSTANTS.HORIZON_Y, CONSTANTS.WIDTH, 5000, 0x000000)
      .setOrigin(0, 0)
      .setScrollFactor(0, 1)
      .setDepth(40);

    this.ships = this.add.group();
    this.objects = this.physics.add.group();
    this.decks = this.physics.add.staticGroup();
    this.boatBodies = this.physics.add.staticGroup();

    const startBoat = new Boat(this, 0);
    startBoat.setDepth(60);
    this.ships.add(startBoat);
    this.addBoatColliders(startBoat);

    const deckY =
      CONSTANTS.HORIZON_Y +
      CONSTANTS.BOAT.Y_OFFSET +
      CONSTANTS.BOAT.DECK_Y_OFFSET_FROM_HORIZON;
    this.plane = new Plane(this, 100, deckY - CONSTANTS.PLANE.HEIGHT / 2);
    this.plane.setDepth(30);
    this.plane.syncTrailDepth();

    this.cameras.main.setBounds(
      0,
      -10000,
      CONSTANTS.WORLD_WIDTH,
      10000 + CONSTANTS.HEIGHT,
    );
    this.cameras.main.startFollow(this.plane, true, 1, 0, -100, 0);

    this.nextSpawnX =
      this.plane.x + CONSTANTS.WIDTH + CONSTANTS.OBJECTS.SPAWN.AHEAD_MIN;

    this.physics.add.overlap(
      this.plane,
      this.objects,
      this
        .handleObjectCollision as Phaser.Types.Physics.Arcade.ArcadePhysicsCallback,
      undefined,
      this,
    );

    this.boatCollider = this.physics.add.overlap(
      this.plane,
      this.boatBodies,
      this
        .handleBoatBodyCollision as Phaser.Types.Physics.Arcade.ArcadePhysicsCallback,
      undefined,
      this,
    );

    this.deckCollider = this.physics.add.collider(
      this.plane,
      this.decks,
      this
        .handleDeckCollision as Phaser.Types.Physics.Arcade.ArcadePhysicsCallback,
      undefined,
      this,
    );

    if (this.boatCollider) this.boatCollider.active = false;

    this.game.events.emit("ready");
  }

  public getPlane() {
    return this.plane;
  }

  update() {
    if (this.isGameOver) return;

    if (this.sky && this.isRunning && this.plane.state === "FLIGHT") {
      const skyTexture = this.textures.get(CONSTANTS.ASSETS.SKY);
      const skyOriginalWidth = skyTexture.getSourceImage().width;
      const skyOriginalHeight = skyTexture.getSourceImage().height;
      const scale = CONSTANTS.HORIZON_Y / skyOriginalHeight;
      const scaledWidth = skyOriginalWidth * scale;

      const scrollSpeed = this.runSpeedX * 0.3;
      const deltaTime = this.game.loop.delta / 1000;
      this.sky.tilePositionX =
        (this.sky.tilePositionX + scrollSpeed * deltaTime) % scaledWidth;

      this.spawnAndUpdateClouds(scrollSpeed, deltaTime);
    }

    this.plane.update();

    if (this.plane.state === "FLIGHT" && this.isRunning) {
      const currentX = this.plane.x;
      this.distance = Math.floor(currentX / 10);
      this.updateCameraYClamp();
      this.spawnByDistance();
      if (this.deckCollider) this.deckCollider.active = true;

      this.objects.getChildren().forEach((child) => {
        const obj = child as Phaser.GameObjects.GameObject & {
          x: number;
          destroy: () => void;
        };
        if (obj.x < this.cameras.main.scrollX - 200) obj.destroy();
      });

      this.maybeSpawnNextBoat();
      this.checkDeathBelowScreen();

      this.events.emit("updateHUD", {
        distance: this.distance,
        multiplier: this.multiplier,
      });
    }

    if (this.plane.state === "LANDED") {
      if (this.plane.currentDeck) {
        this.plane.body.velocity.x *= 0.9;

        if (Math.abs(this.plane.body.velocity.x) < 5) {
          if (this.plane.isSupportedByDeck()) {
            this.gameOver(true);
          } else {
            this.gameOver(false);
          }
        }

        if (!this.plane.isSupportedByDeck()) {
          this.plane.body.setAllowGravity(true);
          this.plane.state = "FLIGHT";
        }
      } else {
        this.plane.state = "FLIGHT";
        this.plane.body.setAllowGravity(true);
      }
    }

    this.updateFloatingText();
  }

  private spawnAndUpdateClouds(scrollSpeed: number, deltaTime: number) {
    if (this.time.now >= this.nextCloudAt) {
      const x = -120;
      const y = Phaser.Math.Between(30, Math.max(60, CONSTANTS.HORIZON_Y - 140));
      const cloud = this.add.image(x, y, "cloud");
      cloud.setOrigin(0.5);
      cloud.setAlpha(0.28);
      cloud.setScrollFactor(0);
      cloud.setDepth(1);
      cloud.setDisplaySize(100, (cloud.height / cloud.width) * 100);
      cloud.setData("speedMul", Phaser.Math.FloatBetween(0.35, 0.6));
      this.clouds.add(cloud);

      this.nextCloudAt = this.time.now + Phaser.Math.Between(1600, 4200);
    }

    this.clouds.getChildren().forEach((child) => {
      const cloud = child as Phaser.GameObjects.Image;
      const mul = (cloud.getData("speedMul") as number) ?? 1;
      cloud.x += scrollSpeed * deltaTime * mul;
      if (cloud.x > CONSTANTS.WIDTH + 140) {
        cloud.destroy();
      }
    });
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  public setStake(_amount: number) {
    this.events.emit("updateHUD", {
      distance: this.distance,
      multiplier: this.multiplier,
    });
  }

  public startRun(speedMultiplier: number = 1) {
    if (this.isGameOver || this.isRunning) return;
    this.isRunning = true;
    this.runSpeedX = CONSTANTS.PLANE.HORIZONTAL_SPEED * speedMultiplier;
    this.rigIndex = 0;
    this.multiplier = CONSTANTS.INITIAL_MULTIPLIER;

    const deckY =
      CONSTANTS.HORIZON_Y +
      CONSTANTS.BOAT.Y_OFFSET +
      CONSTANTS.BOAT.DECK_Y_OFFSET_FROM_HORIZON;
    this.plane.setAlpha(1);
    this.plane.body.setEnable(true);
    this.plane.body.setAllowGravity(true);
    this.plane.state = "FLIGHT";
    this.plane.body.setVelocityX(this.runSpeedX);
    this.plane.jump(CONSTANTS.PLANE.TAKEOFF_IMPULSE);

    this.time.delayedCall(250, () => {
      if (!this.isGameOver && this.boatCollider)
        this.boatCollider.active = true;
    });
    this.plane.y = deckY - this.plane.displayHeight / 2;
  }

  /** Enable a deterministic run: reach exact target multiplier (win) or force a loss. */
  public setRig(target: number | null, outcome: "win" | "lose" | null) {
    this.rigTarget = target;
    this.rigOutcome = outcome;
    this.rigPlan = [];
    this.rigIndex = 0;
  }

  public stopRun() {
    this.isRunning = false;
  }

  private maybeSpawnNextBoat() {
    let lastShip = this.ships.getChildren()[this.ships.getLength() - 1] as Boat;

    if (!lastShip) {
      const newShip = new Boat(this, this.plane.x + 600);
      newShip.setDepth(60);
      this.ships.add(newShip);
      this.addBoatColliders(newShip);
      lastShip = newShip;
    }

    while (lastShip.x < this.plane.x + CONSTANTS.WIDTH + 1200) {
      const nextDistance = Phaser.Math.Between(450, 650);
      const nextX = lastShip.x + nextDistance;

      const newShip = new Boat(this, nextX);
      newShip.setDepth(60);
      this.ships.add(newShip);
      this.addBoatColliders(newShip);
      lastShip = newShip;
    }
  }

  private spawnByDistance() {
    const aheadMin = CONSTANTS.OBJECTS.SPAWN.AHEAD_MIN;
    const aheadMax = CONSTANTS.OBJECTS.SPAWN.AHEAD_MAX;
    const targetMaxX = this.plane.x + CONSTANTS.WIDTH + aheadMax;
    const minNext = this.plane.x + CONSTANTS.WIDTH + aheadMin;
    if (this.nextSpawnX < minNext) this.nextSpawnX = minNext;

    while (this.nextSpawnX < targetMaxX) {
      this.spawnRandomObject(this.nextSpawnX);
      const jitter = Phaser.Math.Between(
        -CONSTANTS.OBJECTS.SPAWN.SPACING_JITTER_X,
        CONSTANTS.OBJECTS.SPAWN.SPACING_JITTER_X,
      );
      this.nextSpawnX += CONSTANTS.OBJECTS.SPAWN.SPACING_X * 0.9 + jitter;
    }
  }

  private checkDeathBelowScreen() {
    if (
      this.plane.y - this.plane.displayHeight / 2 <=
      this.cameras.main.worldView.bottom
    )
      return;
    this.gameOver(false);
  }

  private updateCameraYClamp() {
    const cam = this.cameras.main;
    const topMargin = 90;
    const bottomMargin = 160;
    let targetScrollY: number;
    const topEdge = cam.scrollY + topMargin;
    const bottomEdge = cam.scrollY + CONSTANTS.HEIGHT - bottomMargin;
    if (this.plane.y < topEdge) targetScrollY = this.plane.y - topMargin;
    else if (this.plane.y > bottomEdge)
      targetScrollY = this.plane.y - (CONSTANTS.HEIGHT - bottomMargin);
    else return;
    cam.scrollY = Phaser.Math.Linear(cam.scrollY, targetScrollY, 0.18);
  }

  private chooseObjectType(): string {
    const bonusChance = 0.5;
    return Math.random() < bonusChance
      ? CONSTANTS.OBJECTS.TYPES.BONUS
      : CONSTANTS.OBJECTS.TYPES.ROCKET;
  }

  private spawnRandomObject(forceX?: number, forceY?: number) {
    let type = this.chooseObjectType();
    let value: number | string =
      type === CONSTANTS.OBJECTS.TYPES.BONUS ? this.pickWeightedBonus() : 0;
    let forceHit = false;

    if (this.rigOutcome && this.rigTarget !== null) {
      if (this.rigPlan.length === 0) {
        this.rigPlan = this.buildRigPlan(
          this.multiplier,
          this.rigTarget,
          this.rigOutcome,
        );
      }
      const next = this.rigPlan[this.rigIndex];
      if (next) {
        type =
          next.type === "BONUS"
            ? CONSTANTS.OBJECTS.TYPES.BONUS
            : CONSTANTS.OBJECTS.TYPES.ROCKET;
        value = next.value;
        forceHit = next.hit;
        this.rigIndex = Math.min(this.rigIndex + 1, this.rigPlan.length);
      }
    }
    const x =
      forceX ??
      this.plane.x +
        CONSTANTS.WIDTH +
        CONSTANTS.OBJECTS.SPAWN.AHEAD_MIN +
        Math.random() *
          (CONSTANTS.OBJECTS.SPAWN.AHEAD_MAX -
            CONSTANTS.OBJECTS.SPAWN.AHEAD_MIN);
    const yMin = CONSTANTS.HORIZON_Y + CONSTANTS.OBJECTS.SPAWN.Y_OFFSET_MIN;
    const yMax = CONSTANTS.HORIZON_Y + CONSTANTS.OBJECTS.SPAWN.Y_OFFSET_MAX;
    let y = forceY ?? Phaser.Math.Between(Math.floor(yMin), Math.floor(yMax));

    const isMultiplier = typeof value === "string" && value.startsWith("x");
    if (isMultiplier && !forceHit) {
      const offset =
        Phaser.Math.Between(140, 220) * (Math.random() < 0.5 ? -1 : 1);
      y = Phaser.Math.Clamp(this.plane.y + offset, yMin, yMax);
    }
    if (forceHit) {
      y = Phaser.Math.Clamp(this.plane.y, yMin, yMax);
    }

    const obj = new GameObject(this, x, y, type, value);
    obj.setDepth(35);
    this.objects.add(obj);

    if (type === CONSTANTS.OBJECTS.TYPES.BONUS) this.spawnedBonus++;
    else this.spawnedRocket++;
  }

  private buildRigPlan(
    current: number,
    target: number,
    outcome: "win" | "lose",
  ) {
    if (outcome === "lose") {
      return [
        { type: "ROCKET" as const, value: 0, hit: true },
        { type: "ROCKET" as const, value: 0, hit: true },
        { type: "ROCKET" as const, value: 0, hit: true },
        { type: "BONUS" as const, value: "x5", hit: false },
        { type: "BONUS" as const, value: "x3", hit: false },
      ];
    }

    const plan: Array<{
      type: "BONUS" | "ROCKET";
      value: number | string;
      hit: boolean;
    }> = [];
    let v = Math.max(1, Math.floor(current));
    const t = Math.max(1, Math.floor(target));

    const muls = [5, 3, 2];
    for (const m of muls) {
      while (v * m <= t && m > 1 && v !== t) {
        plan.push(
          { type: "BONUS", value: `x${m}`, hit: true },
          { type: "BONUS", value: "x5", hit: false },
        );
        v = v * m;
      }
    }

    let diff = t - v;
    const adds = [10, 5, 2, 1];
    for (const a of adds) {
      while (diff >= a) {
        const maybe = Math.random() < 0.6;
        if (maybe) {
          plan.push(
            { type: "BONUS", value: a, hit: true },
            { type: "BONUS", value: "x3", hit: false },
          );
        } else {
          plan.push({ type: "BONUS", value: a, hit: true });
        }
        diff -= a;
      }
    }

    plan.push(
      { type: "ROCKET", value: 0, hit: false },
      { type: "ROCKET", value: 0, hit: false },
    );
    return plan;
  }

  private pickWeightedBonus(): number | string {
    const weights = CONSTANTS.OBJECTS.BONUS_WEIGHTS as Record<string, number>;
    const keys = Object.keys(weights);
    let total = 0;
    for (const k of keys) total += weights[k] ?? 0;
    let r = Math.random() * total;
    for (const k of keys) {
      r -= weights[k] ?? 0;
      if (r <= 0) return k.startsWith("x") ? k : Number(k);
    }
    const fallback = keys[0] ?? "1";
    return fallback.startsWith("x") ? fallback : Number(fallback);
  }

  private handleObjectCollision(
    _plane: Phaser.Types.Physics.Arcade.GameObjectWithBody,
    obj: Phaser.Types.Physics.Arcade.GameObjectWithBody,
  ) {
    const gameObject = obj as unknown as GameObject;
    if (gameObject.getData("collected")) return;
    gameObject.setData("collected", true);
    const body = gameObject.body as Phaser.Physics.Arcade.Body | undefined;
    if (body) body.enable = false;
    const rawValue = gameObject.value;
    if (gameObject.objectType === CONSTANTS.OBJECTS.TYPES.BONUS) {
      if (typeof rawValue === "string" && rawValue.startsWith("x")) {
        this.multiplier *= Number.parseInt(rawValue.substring(1), 10);
        this.spawnFloatingText(rawValue, "#28c76f");
      } else {
        this.multiplier += Number(rawValue);
        this.spawnFloatingText(`+${rawValue}`, "#28c76f");
      }
      this.multiplier = Math.min(
        this.multiplier,
        CONSTANTS.SCORE.MAX_MULTIPLIER,
      );
      this.applyBonusFlightEffect(rawValue);
    } else {
      this.multiplier = Math.max(1, Math.round(this.multiplier / 2));
      this.spawnFloatingText("/2", "#ff4d4f");
      this.plane.applyVerticalImpulse(85);
    }
    if (gameObject.objectType === CONSTANTS.OBJECTS.TYPES.ROCKET) {
      gameObject.explode();
    } else {
      gameObject.destroy();
    }
  }

  private spawnFloatingText(text: string, color: string) {
    this.floatText?.destroy();
    const cam = this.cameras.main;
    const sx = Math.round(this.plane.x - cam.scrollX);
    const sy = Math.round(this.plane.y - cam.scrollY - 40);

    this.floatText = this.add
      .text(sx, sy, text, {
        fontSize: "22px",
        fontFamily: "Rubik, sans-serif",
        fontStyle: "bold",
        color,
        stroke: "#000000",
        strokeThickness: 0,
      })
      .setOrigin(0.5)
      .setScrollFactor(0);

    this.floatText.setDepth(200);
    this.floatTextExpiresAt = this.time.now + 500;
  }

  private updateFloatingText() {
    if (!this.floatText) return;
    if (this.time.now >= this.floatTextExpiresAt) {
      this.floatText.destroy();
      this.floatText = undefined;
      return;
    }

    const cam = this.cameras.main;
    const x = Math.round(this.plane.x - cam.scrollX);
    const y = Math.round(this.plane.y - cam.scrollY - 40);
    this.floatText.setPosition(x, y);
  }

  private applyBonusFlightEffect(rawValue: string | number) {
    const v = typeof rawValue === "string" ? 2 : Number(rawValue);

    let up = CONSTANTS.PLANE.TAKEOFF_IMPULSE * 0.6;
    if (v <= 1) up = CONSTANTS.PLANE.TAKEOFF_IMPULSE * 0.5;
    else if (v <= 2) up = CONSTANTS.PLANE.TAKEOFF_IMPULSE * 0.55;
    else if (v <= 5) up = CONSTANTS.PLANE.TAKEOFF_IMPULSE * 0.6;

    const currentVx = this.plane.body.velocity.x;

    this.plane.body.setVelocity(
      currentVx,
      Phaser.Math.Clamp(
        up,
        CONSTANTS.PLANE.MAX_RISE_SPEED,
        CONSTANTS.PLANE.MAX_FALL_SPEED,
      ),
    );
  }

  private addBoatColliders(boat: Boat) {
    const deckY = boat.y + CONSTANTS.BOAT.DECK_Y_OFFSET_FROM_HORIZON;
    const deck = this.add.zone(
      boat.x + CONSTANTS.BOAT.WIDTH / 2,
      deckY,
      CONSTANTS.BOAT.WIDTH,
      18,
    );
    this.physics.add.existing(deck, true);
    this.decks.add(deck as unknown as Phaser.Physics.Arcade.Sprite);

    const sideW = 22;
    const bottomH = 50;
    const boatTopY = boat.y - CONSTANTS.BOAT.HEIGHT / 2;
    const boatBottomY = boat.y + CONSTANTS.BOAT.HEIGHT / 2;
    const midX = boat.x + CONSTANTS.BOAT.WIDTH / 2;

    const left = this.add.zone(
      boat.x + sideW / 2,
      (boatTopY + boatBottomY) / 2,
      sideW,
      CONSTANTS.BOAT.HEIGHT,
    );
    const right = this.add.zone(
      boat.x + CONSTANTS.BOAT.WIDTH - sideW / 2,
      (boatTopY + boatBottomY) / 2,
      sideW,
      CONSTANTS.BOAT.HEIGHT,
    );
    const bottom = this.add.zone(
      midX,
      boatBottomY - bottomH / 2,
      CONSTANTS.BOAT.WIDTH,
      bottomH,
    );

    [left, right, bottom].forEach((z) => {
      this.physics.add.existing(z, true);
      this.boatBodies.add(z as unknown as Phaser.Physics.Arcade.Sprite);
    });
  }

  private handleDeckCollision(
    planeObj: Phaser.Types.Physics.Arcade.GameObjectWithBody,
    deckObj: Phaser.Types.Physics.Arcade.GameObjectWithBody,
  ) {
    if (this.isGameOver) return;
    const plane = planeObj as unknown as Plane & {
      currentDeck?: Phaser.GameObjects.Zone;
    };
    if (plane.state === "LANDED") return;
    if (plane.body.velocity.y < 0) return;

    const deck = deckObj as Phaser.GameObjects.Zone;

    const deckLeft = deck.x - deck.width / 2;
    const deckRight = deck.x + deck.width / 2;
    const margin = 18;
    if (plane.x < deckLeft + margin || plane.x > deckRight - margin) {
      return;
    }

    plane.y = deck.y - plane.displayHeight / 2;
    plane.body.setVelocityY(0);
    plane.body.setAllowGravity(false);
    plane.state = "LANDED";
    plane.currentDeck = deck;
  }

  private handleBoatBodyCollision() {
  }

  private gameOver(isWin: boolean) {
    if (this.isGameOver) return;
    this.isGameOver = true;
    this.isRunning = false;
    this.cameras.main.stopFollow();
    this.plane.body.setVelocity(0, 0);
    this.plane.body.setAcceleration(0, 0);
    this.plane.body.setAllowGravity(false);
    this.events.emit("gameOver", {
      distance: this.distance,
      multiplier: this.multiplier,
      isWin,
    });
  }
}
