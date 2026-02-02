# STARSTRAFE

Zero-G aerial combat multiplayer game built with Three.js and Colyseus.

## Architecture

```
starstrafe/
├── src/                    # Client (Three.js game)
│   ├── audio/              # Music manager & data
│   ├── data/               # Game constants, levels, scene definitions
│   ├── entities/           # Game objects (Player, Enemy, Projectile, Missile, etc.)
│   ├── game/               # Core game loop, input handling, keybindings
│   ├── managers/           # GameManager, SceneManager, LightManager
│   ├── network/            # NetworkManager, client prediction, interpolation
│   ├── physics/            # Rapier3D physics wrapper
│   ├── ui/                 # MenuManager, StartScreenScene, CSS
│   ├── vfx/                # Particle systems, dynamic lights
│   ├── world/              # Level generation
│   └── main.js             # Entry point
│
├── server/                 # Colyseus multiplayer server
│   └── src/
│       ├── rooms/
│       │   ├── GameRoom.ts      # Main game room logic
│       │   └── schema/
│       │       └── GameState.ts # Synchronized state schema
│       ├── app.config.ts        # Server configuration
│       └── index.ts             # Server entry point
│
├── public/                 # Static assets
│   ├── audio/music/        # Background music
│   ├── ships/              # Enemy ship models
│   ├── splats/             # Gaussian splat environments
│   └── cockpit.glb         # Player ship model
│
└── dist/                   # Built client (generated)
```

## Tech Stack

**Client:**
- [Three.js](https://threejs.org/) - 3D rendering
- [Rapier3D](https://rapier.rs/) - Physics (WASM)
- [@sparkjsdev/spark](https://github.com/sparkjsdev/spark) - Gaussian splat rendering
- [Howler.js](https://howlerjs.com/) - Audio
- [Vite](https://vitejs.dev/) - Build tool

**Server:**
- [Colyseus](https://colyseus.io/) - Multiplayer framework
- [@colyseus/schema](https://docs.colyseus.io/state/schema/) - State synchronization

## Networking Architecture

**Server Tick Rate:** 20 Hz (50ms intervals)

### Server Authority

The server is authoritative for:
- **Combat/Health** - All damage, kills, respawns
- **Collision Detection** - Swept-sphere projectile hits
- **Game State** - Phase (lobby/countdown/playing/results), scores, timers
- **Shield Regeneration** - After 5 seconds without damage
- **Collectibles** - Spawn, collection, respawn timers

### State Synchronization

Colyseus automatically syncs schema changes to all clients via delta encoding:

```
GameState
├── players (MapSchema<Player>)
│   └── position, rotation, health, kills, deaths, missiles, etc.
├── projectiles (MapSchema<Projectile>)
│   └── position, direction, speed, damage, lifetime
└── collectibles (MapSchema<Collectible>)
```

### Client-Side Prediction

- **Local player movement** - Immediate response, no waiting for server
- **Server reconciliation** - When server position differs by >0.5 units, smoothly corrects
- **Projectile spawn** - Shows immediately (client prediction), server validates

### Authority by System

| System | Authority |
|--------|-----------|
| Player Movement | Client sends position → Server stores → Broadcasts |
| Lasers | Server moves projectiles, handles collision |
| Missiles | Owner's client controls position/homing → Server syncs to others |
| Combat | Server-authoritative |
| Respawns | Server-authoritative |

### Message Flow

```
Client → Server:
  - "input" (position, rotation, velocity, seq#)
  - "fire" (weapon, position, direction)
  - "missileUpdate" (id, position, direction) [owner only]
  - "chat" (text)

Server → Clients:
  - State sync (automatic via Colyseus schema)
  - "hit", "kill", "respawn" events
  - "chat" broadcast
```

## Development

### Prerequisites
- Node.js 20+
- npm

### Install dependencies
```bash
npm install
cd server && npm install
```

### Run locally (client + server)
```bash
npm run dev:all
```

Or run separately:
```bash
# Terminal 1 - Server
npm run server

# Terminal 2 - Client
npm run dev
```

Client runs at `http://localhost:5173`  
Server runs at `ws://localhost:2567`

## Deployment

### Client (GitHub Pages)
```bash
npm run deploy:gh
```
Builds and deploys to `gh-pages` branch. Configure GitHub Pages to serve from that branch.

Live at: https://jameskane05.github.io/starstrafe/

### Server (Colyseus Cloud)
```bash
npx @colyseus/cloud deploy
```
Requires Colyseus Cloud account and deploy key configured in GitHub repo.

## Configuration

### Switching between local and cloud server

Edit `src/network/NetworkManager.js`:

```javascript
// Use cloud server
const CLOUD_SERVER_URL = "https://us-ord-23ba76a6.colyseus.cloud";

// Use local server
const CLOUD_SERVER_URL = null;
```

## Game Features

- **Ship Classes:** Fighter (balanced), Tank (armored), Rogue (fast)
- **Game Modes:** Free For All
- **Weapons:** Lasers, homing missiles
- **Collectibles:** Missile refills, laser upgrades
- **Networking:** Client-side prediction with server reconciliation

## Controls

| Action | Keyboard | Gamepad |
|--------|----------|---------|
| Move Forward/Back | W / S | Left Stick Y |
| Strafe Left/Right | A / D | Left Stick X |
| Strafe Up/Down | Z / C | D-Pad Up/Down |
| Roll | Q / E | D-Pad Left/Right |
| Look | Mouse / Arrows | Right Stick |
| Fire Laser | Left Click | Right Trigger |
| Fire Missile | Right Click | Left Trigger |
| Boost | Shift | L3 (Left Stick Click) |
| Leaderboard | Tab | Back |
| Menu | Escape | Start |

Controls are rebindable in Options menu.
