/**
 * main.js - APPLICATION ENTRY POINT
 * =============================================================================
 *
 * ROLE: Bootstrap script that instantiates Game and starts initialization.
 * Loads menu CSS and delegates all setup to Game.init().
 *
 * KEY RESPONSIBILITIES:
 * - Create Game instance and call init()
 * - No game logic; see Game.js for the main game loop and manager wiring.
 *
 * =============================================================================
 */

import { Game } from "./game/Game.js";
import "./ui/menu.css";

window.dispatchEvent(new Event("app-bootstrap-ready"));

const game = new Game();
game.init().catch((err) => console.error("Failed to initialize game:", err));
