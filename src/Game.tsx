import { useEffect, useRef, useState } from "react";
import Phaser from "phaser";
import { MainScene } from "./game/scenes/MainScene";
import { CONSTANTS } from "./game/constants";
import "./style.css";

const Game = () => {
  const gameRef = useRef<Phaser.Game | null>(null);
  const betRef = useRef<number>(1);
  const [bet, setBet] = useState(1);
  const [step, setStep] = useState(10);
  const [mode] = useState<"normal" | "fast">("normal");
  const [autoOpen] = useState(false);
  const [autoLeft, setAutoLeft] = useState<number | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [showBigWinModal, setShowBigWinModal] = useState(false);

  const [uiState, setUiState] = useState({
    distance: 0,
    multiplier: 1,
    isGameOver: false,
    isWin: false,
    gameBet: 1,
  });

  const [balance, setBalance] = useState(1000);

  const handlersRef = useRef<{
    onUpdateHUD: (data: { distance: number; multiplier: number }) => void;
    onGameOver: (data: { isWin: boolean; multiplier: number }) => void;
  } | null>(null);

  useEffect(() => {
    betRef.current = bet;
  }, [bet]);

  const isMobile = /Mobi|Android/i.test(navigator.userAgent);

  useEffect(() => {
    const config: Phaser.Types.Core.GameConfig = {
      type: isMobile ? Phaser.CANVAS : Phaser.AUTO,
      width: CONSTANTS.WIDTH,
      height: CONSTANTS.HEIGHT,
      parent: "phaser-container",
      pixelArt: false,
      roundPixels: false,
      render: {
        antialias: true,
        pixelArt: false,
      },
      physics: {
        default: "arcade",
        arcade: { gravity: { x: 0, y: 0 }, debug: false },
      },
      scene: [MainScene],
      backgroundColor: "#000000",
    };

    const game = new Phaser.Game(config);
    gameRef.current = game;

    const onUpdateHUD = (data: { distance: number; multiplier: number }) => {
      setUiState((prev) => ({
        ...prev,
        distance: data.distance,
        multiplier: data.multiplier,
      }));
    };

    const onGameOver = (data: { isWin: boolean; multiplier: number }) => {
      setUiState((prev) => {
        if (prev.isGameOver) {
          return prev;
        }

        const winAmount = prev.gameBet * data.multiplier;

        if (data.isWin) {
          setBalance((currentBalance) => currentBalance + winAmount);

          if (winAmount >= prev.gameBet * 3) {
            setShowBigWinModal(true);
          }
        }

        return {
          ...prev,
          isGameOver: true,
          isWin: data.isWin,
          multiplier: data.multiplier,
        };
      });
      setIsRunning(false);
    };

    handlersRef.current = { onUpdateHUD, onGameOver };

    const connectSceneEvents = () => {
      const scene = game.scene.getScene("MainScene") as MainScene;
      if (!scene || !handlersRef.current) return;

      scene.events.off("updateHUD", handlersRef.current.onUpdateHUD);
      scene.events.off("gameOver", handlersRef.current.onGameOver);

      scene.events.on("updateHUD", handlersRef.current.onUpdateHUD);
      scene.events.on("gameOver", handlersRef.current.onGameOver);
    };

    game.events.on("ready", connectSceneEvents);

    return () => {
      game.destroy(true);
    };
  }, []);

  useEffect(() => {
    if (showBigWinModal) {
      const timer = setTimeout(() => {
        setShowBigWinModal(false);
        setUiState((prev) => ({ ...prev, multiplier: 1 }));
      }, 4000);

      return () => clearTimeout(timer);
    }
  }, [showBigWinModal]);

  const getScene = (): MainScene | null => {
    if (!gameRef.current) return null;
    return gameRef.current.scene.getScene("MainScene") as MainScene;
  };

  const applyStakeToScene = (nextBet: number) => {
    const scene = getScene();
    if (!scene) return;
    scene.setStake(nextBet);
  };

  const clampBet = (v: number) => Math.max(1, Math.min(200, v));

  const onMinus = () => {
    const next = clampBet(bet - step);
    setBet(next);
    applyStakeToScene(next);
  };

  const onPlus = () => {
    const next = clampBet(bet + step);
    setBet(next);
    applyStakeToScene(next);
  };

  const startGame = (autoCount?: number) => {
    const scene = getScene();
    if (!scene || isRunning || balance < bet) return;

    setBalance((prev) => prev - bet);

    if (uiState.isGameOver) {
      scene.scene.restart();
      setUiState({
        distance: 0,
        multiplier: 1,
        isGameOver: false,
        isWin: false,
        gameBet: bet,
      });
      setAutoLeft(null);
      setTimeout(() => {
        const s2 = getScene();
        if (!s2) return;

        const onUpdateHUD = (data: {
          distance: number;
          multiplier: number;
        }) => {
          setUiState((prev) => ({
            ...prev,
            distance: data.distance,
            multiplier: data.multiplier,
          }));
        };

        const onGameOver = (data: { isWin: boolean; multiplier: number }) => {
          setUiState((prev) => {
            if (prev.isGameOver) {
              return prev;
            }

            const winAmount = prev.gameBet * data.multiplier;

            if (data.isWin) {
              setBalance((currentBalance) => currentBalance + winAmount);

              if (winAmount >= prev.gameBet * 3) {
                setShowBigWinModal(true);
              }
            }

            return {
              ...prev,
              isGameOver: true,
              isWin: data.isWin,
              multiplier: data.multiplier,
            };
          });
          setIsRunning(false);
        };

        s2.events.off("updateHUD");
        s2.events.off("gameOver");
        s2.events.on("updateHUD", onUpdateHUD);
        s2.events.on("gameOver", onGameOver);

        s2.setStake(bet);
        s2.startRun(mode === "fast" ? 1.6 : 1);
        setIsRunning(true);
      }, 0);
    } else {
      scene.setStake(bet);
      scene.startRun(mode === "fast" ? 1.6 : 1);
      setUiState((prev) => ({
        ...prev,
        isGameOver: false,
        multiplier: 1,
        gameBet: bet,
      }));
      setIsRunning(true);
    }

    if (typeof autoCount === "number") setAutoLeft(autoCount);
  };

  const stopGame = () => {
    const scene = getScene();
    if (!scene) return;
    scene.stopRun();
    setAutoLeft(null);
    setIsRunning(false);
  };

  return (
    <div className="game-container">
      <div className="phaser-wrap" style={{ width: "100%", height: "100%" }}>
        <div id="phaser-container" style={{ width: "100%", height: "100%" }} />
        <div className="ui-balance">
          <img src="/ton.svg" width={20} height={20} alt="" />
          <span>{balance.toFixed(0)}</span>
        </div>

        <div className="ui-overlay">
          <div className="ui-row">
            <button className="ui-btn" onClick={onMinus}>
              -
            </button>
            <div className="ui-current">
              <span>{bet}</span>
              <img src="/ton.svg" width={20} height={20} alt="" />
            </div>
            <button className="ui-btn" onClick={onPlus}>
              +
            </button>
          </div>

          <div className="ui-steps">
            {[1, 5, 10, 25, 50].map((v) => (
              <button
                key={v}
                className={`ui-chip ${step === v ? "active" : ""}`}
                onClick={() => setStep(v)}
              >
                <span>{v}</span>
                <img src="/ton.svg" width={16} height={16} alt="" />
              </button>
            ))}
          </div>

          {autoOpen && (
            <div className="ui-autoplay">
              {[3, 5, 10, 20, 50].map((v) => (
                <button
                  key={v}
                  className="ui-chip"
                  onClick={() => startGame(v)}
                >
                  {v}
                </button>
              ))}
            </div>
          )}

          <div className="ui-actions">
            {autoLeft === null ? (
              <button
                className="ui-play"
                onClick={() => startGame()}
                disabled={isRunning}
              >
                {uiState.isGameOver ? "Play again" : "Play"}
              </button>
            ) : (
              <button className="ui-play stop" onClick={stopGame}>
                Stop
              </button>
            )}
          </div>

          <div className="ui-potential-win">
            Potential won:{" "}
            <div className="ui-current">
              <span>
                {isRunning
                  ? (bet * uiState.multiplier).toFixed(2)
                  : bet.toFixed(2)}
              </span>
              <img src="/ton.svg" width={20} height={20} alt="" />
            </div>
          </div>
        </div>

        <div className={`big-win-modal ${showBigWinModal ? "active" : ""}`}>
          <div className="modal-content">
            <h2 className="modal-headline">
              <span>{(uiState.gameBet * uiState.multiplier).toFixed(0)}</span>
              <img src="/ton.svg" width={50} height={50} alt="" />
            </h2>
            <h3 className="modal-desciption">Вы выиграли!</h3>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Game;
