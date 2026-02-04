const STORAGE_KEY = 'starstrafe_gamepad_bindings';
const PRESETS_KEY = 'starstrafe_gamepad_presets';
const ACTIVE_PRESET_KEY = 'starstrafe_gamepad_active_preset';

export const DEFAULT_GAMEPAD_BINDINGS = {
  leftStickX: 'moveX',      // Left stick horizontal -> strafe left/right
  leftStickY: 'moveY',      // Left stick vertical -> forward/backward
  rightStickX: 'lookX',     // Right stick horizontal -> yaw
  rightStickY: 'lookY',     // Right stick vertical -> pitch
  rightTrigger: 'fire',     // RT -> fire lasers
  leftTrigger: 'missile',   // LT -> fire missiles
  leftStickPress: 'boost',  // L3 -> boost/sprint
  dpadUp: 'strafeUp',       // D-pad up -> strafe up
  dpadDown: 'strafeDown',   // D-pad down -> strafe down
  dpadLeft: 'rollLeft',     // D-pad left -> roll left
  dpadRight: 'rollRight',   // D-pad right -> roll right
  start: 'pause',           // Start -> escape menu
  back: 'leaderboard',      // Back/Select -> leaderboard
};

// T-Flight HOTAS One preset
// Main stick = rotation only (like mouse), throttle = thrust, POV = strafe
export const HOTAS_BINDINGS = {
  leftStickX: 'lookX',      // Stick X -> yaw (left/right look)
  leftStickY: 'lookY',      // Stick Y -> pitch (pull back = look up)
  throttle: 'moveY',        // Throttle lever -> forward/backward thrust
  twist: 'rollAxis',        // Twist/rudder -> roll (analog)
  buttonA: 'fire',          // Trigger (button 0) -> fire lasers
  buttonX: 'missile',       // Button 2 -> missiles
  button8: 'boost',         // Button 8 -> boost
  start: 'pause',
  back: 'leaderboard',
};

export const GAMEPAD_INPUT_LABELS = {
  leftStickX: 'Left Stick X',
  leftStickY: 'Left Stick Y',
  rightStickX: 'Right Stick X',
  rightStickY: 'Right Stick Y',
  throttle: 'Throttle',
  twist: 'Twist/Rudder',
  rightTrigger: 'Right Trigger',
  leftTrigger: 'Left Trigger',
  leftStickPress: 'Left Stick Press',
  rightStickPress: 'Right Stick Press',
  dpadUp: 'D-Pad Up',
  dpadDown: 'D-Pad Down',
  dpadLeft: 'D-Pad Left',
  dpadRight: 'D-Pad Right',
  buttonA: 'A Button',
  buttonB: 'B Button',
  buttonX: 'X Button',
  buttonY: 'Y Button',
  leftBumper: 'Left Bumper',
  rightBumper: 'Right Bumper',
  start: 'Start',
  back: 'Back/Select',
};

export const GAMEPAD_ACTION_LABELS = {
  moveX: 'Strafe Left/Right',
  moveY: 'Forward/Backward',
  moveX_neg: 'Strafe Left',
  moveX_pos: 'Strafe Right',
  lookX: 'Look Left/Right',
  lookY: 'Look Up/Down',
  rollAxis: 'Roll (Analog)',
  fire: 'Fire Lasers',
  missile: 'Fire Missiles',
  boost: 'Boost',
  strafeUp: 'Strafe Up',
  strafeDown: 'Strafe Down',
  strafeLeft: 'Strafe Left',
  strafeRight: 'Strafe Right',
  rollLeft: 'Roll Left',
  rollRight: 'Roll Right',
  pause: 'Escape Menu',
  leaderboard: 'Leaderboard',
};

// Standard gamepad button indices
const BUTTON = {
  A: 0,
  B: 1,
  X: 2,
  Y: 3,
  LB: 4,
  RB: 5,
  LT: 6,
  RT: 7,
  BACK: 8,
  START: 9,
  L3: 10,
  R3: 11,
  DPAD_UP: 12,
  DPAD_DOWN: 13,
  DPAD_LEFT: 14,
  DPAD_RIGHT: 15,
};

// Standard gamepad axes indices
const AXIS = {
  LEFT_X: 0,
  LEFT_Y: 1,
  RIGHT_X: 2,
  RIGHT_Y: 3,
};

class GamepadManager {
  constructor() {
    this.gamepad = null;
    this.connected = false;
    this.presets = this.loadPresets();
    this.activePreset = localStorage.getItem(ACTIVE_PRESET_KEY) || 'default';
    this.bindings = this.load();
    this.deadzone = 0.15;
    this.triggerThreshold = 0.1;
    
    this.state = {
      leftStick: { x: 0, y: 0 },
      rightStick: { x: 0, y: 0 },
      throttle: 0,
      twist: 0,
      pov: { up: false, down: false, left: false, right: false },
      leftTrigger: 0,
      rightTrigger: 0,
      buttons: {},
      prevButtons: {},
    };
    
    this.isHotas = false;
    this.hotasDeadzone = 0.20; // Larger deadzone for flight sticks
    
    this.onConnect = null;
    this.onDisconnect = null;
    
    window.addEventListener('gamepadconnected', (e) => this.handleConnect(e));
    window.addEventListener('gamepaddisconnected', (e) => this.handleDisconnect(e));
  }

  loadPresets() {
    try {
      const stored = localStorage.getItem(PRESETS_KEY);
      if (stored) {
        return JSON.parse(stored);
      }
    } catch (e) {
      console.warn('[Gamepad] Failed to load presets:', e);
    }
    return {};
  }

  savePresets() {
    try {
      localStorage.setItem(PRESETS_KEY, JSON.stringify(this.presets));
    } catch (e) {
      console.warn('[Gamepad] Failed to save presets:', e);
    }
  }

  load() {
    if (this.activePreset === 'default') {
      return { ...DEFAULT_GAMEPAD_BINDINGS };
    }
    if (this.activePreset === 'hotas') {
      return { ...HOTAS_BINDINGS };
    }
    if (this.activePreset === 'custom') {
      try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
          return { ...DEFAULT_GAMEPAD_BINDINGS, ...JSON.parse(stored) };
        }
      } catch (e) {
        console.warn('[Gamepad] Failed to load bindings:', e);
      }
      return { ...DEFAULT_GAMEPAD_BINDINGS };
    }
    // Load from named preset
    if (this.presets[this.activePreset]) {
      return { ...DEFAULT_GAMEPAD_BINDINGS, ...this.presets[this.activePreset] };
    }
    return { ...DEFAULT_GAMEPAD_BINDINGS };
  }

  save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.bindings));
      // When saving custom changes, switch to custom preset
      if (this.activePreset === 'default') {
        this.activePreset = 'custom';
        localStorage.setItem(ACTIVE_PRESET_KEY, 'custom');
      }
    } catch (e) {
      console.warn('[Gamepad] Failed to save bindings:', e);
    }
  }

  getPresetNames() {
    return ['default', 'hotas', 'custom', ...Object.keys(this.presets)];
  }

  loadPreset(name) {
    this.activePreset = name;
    localStorage.setItem(ACTIVE_PRESET_KEY, name);
    this.bindings = this.load();
  }

  saveAsPreset(name) {
    const safeName = name.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (safeName && safeName !== 'default' && safeName !== 'custom') {
      this.presets[safeName] = { ...this.bindings };
      this.savePresets();
      this.activePreset = safeName;
      localStorage.setItem(ACTIVE_PRESET_KEY, safeName);
    }
  }

  deletePreset(name) {
    if (name !== 'default' && name !== 'hotas' && name !== 'custom' && this.presets[name]) {
      delete this.presets[name];
      this.savePresets();
      this.loadPreset('default');
    }
  }

  isCustom() {
    return this.activePreset === 'custom';
  }

  resetToDefault() {
    this.activePreset = 'default';
    localStorage.setItem(ACTIVE_PRESET_KEY, 'default');
    this.bindings = { ...DEFAULT_GAMEPAD_BINDINGS };
  }

  handleConnect(e) {
    console.log('[Gamepad] Connected:', e.gamepad.id);
    console.log('[Gamepad] Axes count:', e.gamepad.axes.length);
    console.log('[Gamepad] Buttons count:', e.gamepad.buttons.length);
    
    this.gamepad = e.gamepad;
    this.connected = true;
    
    // Detect HOTAS controllers
    const id = e.gamepad.id.toLowerCase();
    this.isHotas = id.includes('hotas') || id.includes('t.flight') || 
                   id.includes('thrustmaster') || id.includes('flight') ||
                   id.includes('x52') || id.includes('x56') || id.includes('warthog');
    
    if (this.isHotas) {
      console.log('[Gamepad] HOTAS detected, auto-applying flight stick preset');
      this.loadPreset('hotas');
      // Start debug logging for HOTAS
      this.startDebugLog();
    }
    
    this.onConnect?.(e.gamepad);
  }
  
  startDebugLog() {
    if (this._debugInterval) clearInterval(this._debugInterval);
    console.log('[Gamepad] Starting input debug log - move controls to see which axes/buttons respond');
    
    let lastAxes = [];
    let lastButtons = [];
    
    this._debugInterval = setInterval(() => {
      const gp = navigator.getGamepads()[this.gamepad?.index ?? 0];
      if (!gp) return;
      
      // Check axes for changes
      gp.axes.forEach((val, i) => {
        if (Math.abs(val - (lastAxes[i] ?? 0)) > 0.1) {
          console.log(`[AXIS ${i}] = ${val.toFixed(3)}`);
        }
      });
      lastAxes = [...gp.axes];
      
      // Check buttons for presses
      gp.buttons.forEach((btn, i) => {
        const wasPressed = lastButtons[i] ?? false;
        if (btn.pressed && !wasPressed) {
          console.log(`[BUTTON ${i}] PRESSED (value: ${btn.value.toFixed(2)})`);
        }
        if (!btn.pressed && wasPressed) {
          console.log(`[BUTTON ${i}] RELEASED`);
        }
      });
      lastButtons = gp.buttons.map(b => b.pressed);
    }, 100);
    
    // Auto-stop after 30 seconds
    setTimeout(() => this.stopDebugLog(), 30000);
  }
  
  stopDebugLog() {
    if (this._debugInterval) {
      clearInterval(this._debugInterval);
      this._debugInterval = null;
      console.log('[Gamepad] Debug logging stopped');
    }
  }

  handleDisconnect(e) {
    console.log('[Gamepad] Disconnected:', e.gamepad.id);
    if (this.gamepad?.index === e.gamepad.index) {
      this.gamepad = null;
      this.connected = false;
      this.onDisconnect?.(e.gamepad);
    }
  }

  applyDeadzone(value, useHotasDeadzone = false) {
    const dz = (this.isHotas || useHotasDeadzone) ? this.hotasDeadzone : this.deadzone;
    if (Math.abs(value) < dz) return 0;
    const sign = Math.sign(value);
    return sign * (Math.abs(value) - dz) / (1 - dz);
  }

  poll() {
    const gamepads = navigator.getGamepads();
    if (!gamepads) return;
    
    // Find first connected gamepad
    for (const gp of gamepads) {
      if (gp && gp.connected) {
        this.gamepad = gp;
        if (!this.connected) {
          this.connected = true;
          this.onConnect?.(gp);
        }
        break;
      }
    }
    
    if (!this.gamepad) {
      if (this.connected) {
        this.connected = false;
        this.onDisconnect?.();
      }
      return;
    }
    
    const gp = this.gamepad;
    
    // Store previous button states
    this.state.prevButtons = { ...this.state.buttons };
    
    // Read axes
    this.state.leftStick.x = this.applyDeadzone(gp.axes[AXIS.LEFT_X] || 0);
    this.state.leftStick.y = this.applyDeadzone(gp.axes[AXIS.LEFT_Y] || 0);
    this.state.rightStick.x = this.applyDeadzone(gp.axes[AXIS.RIGHT_X] || 0);
    this.state.rightStick.y = this.applyDeadzone(gp.axes[AXIS.RIGHT_Y] || 0);
    
    // HOTAS-specific axes (T-Flight HOTAS One)
    // Axis 0 = Stick X, Axis 1 = Stick Y, Axis 2 = Throttle, Axis 5 = Twist/Roll, Axis 9 = POV hat
    if (this.isHotas) {
      // Throttle is axis 2
      const rawThrottle = gp.axes[2] ?? 0;
      this.state.throttle = this.applyDeadzone(rawThrottle);
      // Twist/roll is axis 5 (positive = right, negative = left)
      this.state.twist = this.applyDeadzone(gp.axes[5] || 0);
      
      // POV hat switch is axis 9 - encodes direction as single value
      // T-Flight values: UP=-1, DOWN=0.143, LEFT=0.714, RIGHT=-0.429, CENTER=1.286
      // Diagonals: UP-LEFT=1.0, UP-RIGHT=-0.714, DOWN-LEFT=0.429, DOWN-RIGHT=-0.143
      const pov = gp.axes[9] ?? 1.286;
      this.state.pov.up = false;
      this.state.pov.down = false;
      this.state.pov.left = false;
      this.state.pov.right = false;
      
      // Center is ~1.286
      const isCenter = Math.abs(pov - 1.286) < 0.1;
      
      if (!isCenter) {
        // Cardinals
        if (Math.abs(pov - (-1.0)) < 0.12) this.state.pov.up = true;        // UP = -1.0
        else if (Math.abs(pov - 0.143) < 0.12) this.state.pov.down = true;  // DOWN = 0.143
        else if (Math.abs(pov - 0.714) < 0.12) this.state.pov.left = true;  // LEFT = 0.714
        else if (Math.abs(pov - (-0.429)) < 0.12) this.state.pov.right = true; // RIGHT = -0.429
        // Diagonals
        else if (Math.abs(pov - 1.0) < 0.12) { this.state.pov.up = true; this.state.pov.left = true; }      // UP-LEFT = 1.0
        else if (Math.abs(pov - (-0.714)) < 0.12) { this.state.pov.up = true; this.state.pov.right = true; } // UP-RIGHT = -0.714
        else if (Math.abs(pov - 0.429) < 0.12) { this.state.pov.down = true; this.state.pov.left = true; }   // DOWN-LEFT = 0.429
        else if (Math.abs(pov - (-0.143)) < 0.12) { this.state.pov.down = true; this.state.pov.right = true; } // DOWN-RIGHT = -0.143
      }
      
      // Debug throttle once per second
      if (!this._lastThrottleLog || Date.now() - this._lastThrottleLog > 1000) {
        if (Math.abs(rawThrottle) > 0.2) {
          console.log(`[Gamepad] Throttle raw=${rawThrottle.toFixed(2)}, state=${this.state.throttle.toFixed(2)}`);
          this._lastThrottleLog = Date.now();
        }
      }
    } else {
      this.state.throttle = 0;
      this.state.twist = 0;
    }
    
    // Triggers (some controllers report as buttons, some as axes)
    // Try axes first (indices 4 and 5 on some controllers) - but not for HOTAS
    if (!this.isHotas && gp.axes.length > 4) {
      this.state.leftTrigger = Math.max(0, (gp.axes[4] + 1) / 2);
      this.state.rightTrigger = Math.max(0, (gp.axes[5] + 1) / 2);
    }
    // Override with button values if available and pressed
    if (gp.buttons[BUTTON.LT]) {
      const lt = gp.buttons[BUTTON.LT].value;
      if (lt > this.state.leftTrigger) this.state.leftTrigger = lt;
    }
    if (gp.buttons[BUTTON.RT]) {
      const rt = gp.buttons[BUTTON.RT].value;
      if (rt > this.state.rightTrigger) this.state.rightTrigger = rt;
    }
    
    // Read buttons
    this.state.buttons = {
      a: gp.buttons[BUTTON.A]?.pressed || false,
      b: gp.buttons[BUTTON.B]?.pressed || false,
      x: gp.buttons[BUTTON.X]?.pressed || false,
      y: gp.buttons[BUTTON.Y]?.pressed || false,
      lb: gp.buttons[BUTTON.LB]?.pressed || false,
      rb: gp.buttons[BUTTON.RB]?.pressed || false,
      lt: this.state.leftTrigger > this.triggerThreshold,
      rt: this.state.rightTrigger > this.triggerThreshold,
      back: gp.buttons[BUTTON.BACK]?.pressed || false,
      start: gp.buttons[BUTTON.START]?.pressed || false,
      l3: gp.buttons[BUTTON.L3]?.pressed || false,
      r3: gp.buttons[BUTTON.R3]?.pressed || false,
      dpadUp: gp.buttons[BUTTON.DPAD_UP]?.pressed || false,
      dpadDown: gp.buttons[BUTTON.DPAD_DOWN]?.pressed || false,
      dpadLeft: gp.buttons[BUTTON.DPAD_LEFT]?.pressed || false,
      dpadRight: gp.buttons[BUTTON.DPAD_RIGHT]?.pressed || false,
      // Additional buttons for HOTAS
      btn8: gp.buttons[8]?.pressed || false,
      btn9: gp.buttons[9]?.pressed || false,
      btn10: gp.buttons[10]?.pressed || false,
      btn11: gp.buttons[11]?.pressed || false,
    };
  }

  // Check if button was just pressed this frame
  justPressed(button) {
    return this.state.buttons[button] && !this.state.prevButtons[button];
  }

  // Check if button is held
  isPressed(button) {
    return this.state.buttons[button] || false;
  }

  // Get axis value for an action based on bindings
  getAxisValue(action) {
    const binding = Object.entries(this.bindings).find(([, a]) => a === action)?.[0];
    if (!binding) {
      if (action === 'moveY') console.log('[Gamepad] No binding found for moveY! Bindings:', this.bindings);
      return 0;
    }
    
    let value = 0;
    switch (binding) {
      case 'leftStickX': value = this.state.leftStick.x; break;
      case 'leftStickY': value = this.state.leftStick.y; break;
      case 'rightStickX': value = this.state.rightStick.x; break;
      case 'rightStickY': value = this.state.rightStick.y; break;
      case 'throttle': value = this.state.throttle; break;
      case 'twist': value = this.state.twist; break;
      case 'leftTrigger': value = this.state.leftTrigger; break;
      case 'rightTrigger': value = this.state.rightTrigger; break;
    }
    
    // Debug throttle
    if (action === 'moveY' && Math.abs(value) > 0.1) {
      console.log(`[Gamepad] moveY: binding=${binding}, value=${value.toFixed(2)}`);
    }
    
    return value;
  }

  // Get button state for an action based on bindings
  getButtonState(action) {
    const binding = Object.entries(this.bindings).find(([, a]) => a === action)?.[0];
    if (!binding) return false;
    
    switch (binding) {
      case 'dpadUp': return this.state.buttons.dpadUp;
      case 'dpadDown': return this.state.buttons.dpadDown;
      case 'dpadLeft': return this.state.buttons.dpadLeft;
      case 'dpadRight': return this.state.buttons.dpadRight;
      case 'leftStickPress': return this.state.buttons.l3;
      case 'rightStickPress': return this.state.buttons.r3;
      case 'buttonA': return this.state.buttons.a;
      case 'buttonB': return this.state.buttons.b;
      case 'buttonX': return this.state.buttons.x;
      case 'buttonY': return this.state.buttons.y;
      case 'leftBumper': return this.state.buttons.lb;
      case 'rightBumper': return this.state.buttons.rb;
      case 'leftTrigger': return this.state.buttons.lt;
      case 'rightTrigger': return this.state.buttons.rt;
      case 'start': return this.state.buttons.start;
      case 'back': return this.state.buttons.back;
      case 'button8': return this.state.buttons.btn8;
      case 'button9': return this.state.buttons.btn9;
      case 'button10': return this.state.buttons.btn10;
      case 'button11': return this.state.buttons.btn11;
      default: return false;
    }
  }

  // Get button just pressed for an action
  getButtonJustPressed(action) {
    const binding = Object.entries(this.bindings).find(([, a]) => a === action)?.[0];
    if (!binding) return false;
    
    switch (binding) {
      case 'dpadUp': return this.justPressed('dpadUp');
      case 'dpadDown': return this.justPressed('dpadDown');
      case 'dpadLeft': return this.justPressed('dpadLeft');
      case 'dpadRight': return this.justPressed('dpadRight');
      case 'leftStickPress': return this.justPressed('l3');
      case 'rightStickPress': return this.justPressed('r3');
      case 'buttonA': return this.justPressed('a');
      case 'buttonB': return this.justPressed('b');
      case 'buttonX': return this.justPressed('x');
      case 'buttonY': return this.justPressed('y');
      case 'leftBumper': return this.justPressed('lb');
      case 'rightBumper': return this.justPressed('rb');
      case 'leftTrigger': return this.justPressed('lt');
      case 'rightTrigger': return this.justPressed('rt');
      case 'start': return this.justPressed('start');
      case 'back': return this.justPressed('back');
      case 'button8': return this.justPressed('btn8');
      case 'button9': return this.justPressed('btn9');
      case 'button10': return this.justPressed('btn10');
      case 'button11': return this.justPressed('btn11');
      default: return false;
    }
  }

  hasInput() {
    if (!this.connected) return false;
    
    const s = this.state;
    return Math.abs(s.leftStick.x) > 0.1 ||
           Math.abs(s.leftStick.y) > 0.1 ||
           Math.abs(s.rightStick.x) > 0.1 ||
           Math.abs(s.rightStick.y) > 0.1 ||
           s.leftTrigger > 0.1 ||
           s.rightTrigger > 0.1 ||
           Object.values(s.buttons).some(b => b);
  }

  getBindings() {
    return { ...this.bindings };
  }

  setBinding(input, action) {
    this.bindings[input] = action;
    this.save();
  }
  
  applyHotasPreset() {
    this.bindings = { ...HOTAS_BINDINGS };
    this.save();
  }
  
  getIsHotas() {
    return this.isHotas;
  }
  
  // Debug: get raw axis values
  getRawAxes() {
    if (!this.gamepad) return [];
    return Array.from(this.gamepad.axes);
  }
  
  // Debug: get raw button states
  getRawButtons() {
    if (!this.gamepad) return [];
    return Array.from(this.gamepad.buttons).map((b, i) => ({
      index: i,
      pressed: b.pressed,
      value: b.value
    }));
  }
}

export const GamepadInput = new GamepadManager();
