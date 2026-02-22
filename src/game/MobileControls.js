import { KeyBindings } from './KeyBindings.js';
import { GAME_STATES } from '../data/gameData.js';

export class MobileControls {
  constructor(game) {
    this.game = game;
    this.isTouchDevice = 'ontouchstart' in window;
    this.active = false;

    this.moveStick = { x: 0, y: 0 };
    this.lookStick = { x: 0, y: 0 };
    this.boostHeld = false;
    this.moveTouchId = null;
    this.lookTouchId = null;

    this.moveBase = null;
    this.moveThumb = null;
    this.lookBase = null;
    this.lookThumb = null;

    this.sensitivity = 0.5;
    this.deadzone = 0.15;
  }

  init() {
    if (!this.isTouchDevice) return;

    const container = document.getElementById('mobile-controls');
    if (!container) return;

    this.active = true;
    this.container = container;
    container.classList.add('active');

    const gm = this.game?.gameManager;
    if (gm) {
      const updateVisibility = () => {
        const s = gm.state?.currentState;
        const inGameplay =
          s === GAME_STATES.PLAYING || s === GAME_STATES.PAUSED;
        this.setGameplayVisible(inGameplay);
      };
      gm.on('state:changed', updateVisibility);
      updateVisibility();
    }

    this.moveBase = container.querySelector('.joystick-move');
    this.moveThumb = container.querySelector('.joystick-move .thumb');
    this.lookBase = container.querySelector('.joystick-look');
    this.lookThumb = container.querySelector('.joystick-look .thumb');

    this.setupJoystick(this.moveBase, this.moveThumb, 'move');
    this.setupJoystick(this.lookBase, this.lookThumb, 'look');
    this.setupButtons(container);
  }

  setupJoystick(base, thumb, type) {
    const radius = 60;
    const isMove = type === 'move';

    const clamp = (v) => {
      const len = Math.sqrt(v.x * v.x + v.y * v.y);
      if (len <= this.deadzone) return { x: 0, y: 0 };
      const scale = Math.min(1, (len - this.deadzone) / (1 - this.deadzone)) / len;
      return { x: v.x * scale, y: v.y * scale };
    };

    const onStart = (e) => {
      e.preventDefault();
      const touch = e.changedTouches[0];
      const id = touch.identifier;
      if (isMove) {
        this.moveTouchId = id;
      } else {
        this.lookTouchId = id;
      }
    };

    const onMove = (e) => {
      let touch = null;
      for (let i = 0; i < e.changedTouches.length; i++) {
        if (e.changedTouches[i].identifier === (isMove ? this.moveTouchId : this.lookTouchId)) {
          touch = e.changedTouches[i];
          break;
        }
      }
      if (!touch) return;
      e.preventDefault();

      const rect = base.getBoundingClientRect();
      const raw = {
        x: (touch.clientX - rect.left - rect.width / 2) / radius,
        y: (touch.clientY - rect.top - rect.height / 2) / radius,
      };
      const clamped = clamp(raw);

      if (isMove) {
        this.moveStick.x = clamped.x;
        this.moveStick.y = clamped.y;
        thumb.style.transform = `translate(${clamped.x * 40}px, ${clamped.y * 40}px)`;
      } else {
        this.lookStick.x = clamped.x;
        this.lookStick.y = clamped.y;
        thumb.style.transform = `translate(${clamped.x * 40}px, ${clamped.y * 40}px)`;
      }
    };

    const onEnd = (e) => {
      let touch = null;
      for (let i = 0; i < e.changedTouches.length; i++) {
        if (e.changedTouches[i].identifier === (isMove ? this.moveTouchId : this.lookTouchId)) {
          touch = e.changedTouches[i];
          break;
        }
      }
      if (!touch) return;
      e.preventDefault();

      if (isMove) {
        this.moveTouchId = null;
        this.moveStick.x = 0;
        this.moveStick.y = 0;
        thumb.style.transform = 'translate(0, 0)';
      } else {
        this.lookTouchId = null;
        this.lookStick.x = 0;
        this.lookStick.y = 0;
        thumb.style.transform = 'translate(0, 0)';
      }
    };

    base.addEventListener('touchstart', onStart, { passive: false });
    base.addEventListener('touchmove', onMove, { passive: false });
    base.addEventListener('touchend', onEnd, { passive: false });
    base.addEventListener('touchcancel', onEnd, { passive: false });
  }

  setGameplayVisible(visible) {
    if (!this.container) return;
    this.container.classList.toggle('gameplay', visible);
  }

  setupButtons(container) {
    const setKey = (action, value) => {
      const code = KeyBindings.getBinding(action);
      if (code) this.game.input.setKey(code, value);
    };

    const fireMissile = container.querySelector('[data-action="fire-missile"]');
    const fireWeapon = container.querySelector('[data-action="fire-weapon"]');
    const strafeUp = container.querySelector('[data-action="strafe-up"]');
    const strafeDown = container.querySelector('[data-action="strafe-down"]');
    const rollLeft = container.querySelector('[data-action="roll-left"]');
    const rollRight = container.querySelector('[data-action="roll-right"]');
    const boost = container.querySelector('[data-action="boost"]');
    const menuBtn = container.querySelector('[data-action="menu"]');
    const leaderboardBtn = container.querySelector('[data-action="leaderboard"]');

    const haptic = () => {
      if (navigator.vibrate) navigator.vibrate(30);
    };
    const handle = (el, fn) => {
      if (!el) return;
      el.addEventListener('touchstart', (e) => {
        e.preventDefault();
        haptic();
        fn();
      }, { passive: false });
    };

    handle(fireMissile, () => this.game.firePlayerMissile());
    handle(fireWeapon, () => this.game.firePlayerWeapon());

    handle(menuBtn, () => this.game.showEscMenu());

    handle(leaderboardBtn, () => {
      if (!this.game.gameManager?.isPlaying()) return;
      const isOpen = document.getElementById('tab-leaderboard')?.classList.contains('active');
      if (isOpen) this.game.hideLeaderboard();
      else this.game.showLeaderboard();
    });

    handle(strafeUp, () => setKey('strafeUp', true));
    handle(strafeDown, () => setKey('strafeDown', true));
    handle(rollLeft, () => setKey('rollLeft', true));
    handle(rollRight, () => setKey('rollRight', true));

    if (boost) {
      boost.addEventListener('touchstart', (e) => {
        e.preventDefault();
        haptic();
        this.boostHeld = true;
        setKey('boost', true);
      }, { passive: false });
      const releaseBoost = () => {
        this.boostHeld = false;
        setKey('boost', false);
      };
      boost.addEventListener('touchend', (e) => { e.preventDefault(); releaseBoost(); }, { passive: false });
      boost.addEventListener('touchcancel', (e) => { e.preventDefault(); releaseBoost(); }, { passive: false });
    }

    const releaseHandlers = (el, actions) => {
      if (!el) return;
      const release = () => actions.forEach(a => setKey(a, false));
      el.addEventListener('touchend', (e) => { e.preventDefault(); release(); }, { passive: false });
      el.addEventListener('touchcancel', (e) => { e.preventDefault(); release(); }, { passive: false });
    };

    releaseHandlers(strafeUp, ['strafeUp']);
    releaseHandlers(strafeDown, ['strafeDown']);
    releaseHandlers(rollLeft, ['rollLeft']);
    releaseHandlers(rollRight, ['rollRight']);
  }

  getMoveInput() {
    if (!this.active) return { forward: false, backward: false, left: false, right: false };
    const y = this.moveStick.y;
    const x = this.moveStick.x;
    return {
      forward: y < -0.2 || this.boostHeld,
      backward: y > 0.2,
      left: x < -0.2,
      right: x > 0.2,
    };
  }

  getLookDelta() {
    if (!this.active) return { x: 0, y: 0 };
    const scale = 8 * this.sensitivity;
    const isPortrait = window.innerHeight > window.innerWidth;
    const orientMult = isPortrait ? 0.72 : 1;
    return {
      x: this.lookStick.x * scale * orientMult,
      y: this.lookStick.y * scale * orientMult,
    };
  }

  shouldSkipPointerLock() {
    return this.active;
  }
}
