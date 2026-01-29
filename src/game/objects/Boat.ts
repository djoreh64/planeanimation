
import Phaser from 'phaser';
import { CONSTANTS } from '../constants';

export class Boat extends Phaser.GameObjects.Sprite {
    constructor(scene: Phaser.Scene, x: number) {
        const horizonY = CONSTANTS.HORIZON_Y + CONSTANTS.BOAT.Y_OFFSET;
        super(scene, x, horizonY, CONSTANTS.ASSETS.BOAT);
        
        scene.add.existing(this);
        this.setDisplaySize(188, 188);
        this.setOrigin(0, 0.5); 
        this.y = horizonY; 
    }
}
