import {
    defineServer,
    defineRoom,
    monitor,
    playground,
    createRouter,
    createEndpoint,
    matchMaker,
} from "colyseus";
import express from "express";
import fs from "fs";
import path from "path";

/**
 * Import your Room files
 */
import { MyRoom } from "./rooms/MyRoom.js";
import { GameRoom } from "./rooms/GameRoom.js";

const FEEDBACK_FILE = path.join(process.cwd(), "data", "feedback.json");

function ensureDataDir() {
    const dir = path.dirname(FEEDBACK_FILE);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
}

function readFeedback(): unknown[] {
    ensureDataDir();
    if (!fs.existsSync(FEEDBACK_FILE)) return [];
    try {
        const raw = fs.readFileSync(FEEDBACK_FILE, "utf-8");
        const data = JSON.parse(raw);
        return Array.isArray(data) ? data : [];
    } catch {
        return [];
    }
}

function appendFeedback(entry: unknown): void {
    const list = readFeedback();
    list.push(entry);
    const tmp = FEEDBACK_FILE + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(list, null, 2), "utf-8");
    fs.renameSync(tmp, FEEDBACK_FILE);
}

const server = defineServer({
    /**
     * Define your room handlers:
     */
    rooms: {
        my_room: defineRoom(MyRoom),
        game_room: defineRoom(GameRoom),
    },

    /**
     * Experimental: Define API routes. Built-in integration with the "playground" and SDK.
     * 
     * Usage from SDK: 
     *   client.http.get("/api/hello").then((response) => {})
     * 
     */
    routes: createRouter({
        api_hello: createEndpoint("/api/hello", { method: "GET", }, async (ctx) => {
            return { message: "Hello World" }
        }),
        api_rooms: createEndpoint("/api/rooms", { method: "GET", }, async () => {
            const rooms = await matchMaker.query({ name: "game_room" });
            return rooms.map(room => ({
                roomId: room.roomId,
                name: room.name,
                clients: room.clients,
                maxClients: room.maxClients,
                metadata: room.metadata
            }));
        }),
        api_check_room: createEndpoint("/api/check-room/:roomId", { method: "GET", }, async (ctx) => {
            const roomId = ctx.params.roomId;
            const rooms = await matchMaker.query({ name: "game_room" });
            const exists = rooms.some(room => room.roomId.toUpperCase() === roomId.toUpperCase());
            return { exists };
        })
    }),

    /**
     * Bind your custom express routes here:
     * Read more: https://expressjs.com/en/starter/basic-routing.html
     */
    express: (app) => {
        app.use(express.json());
        app.use((_req, res, next) => {
            res.setHeader("Access-Control-Allow-Origin", "*");
            res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
            res.setHeader("Access-Control-Allow-Headers", "Content-Type");
            next();
        });
        app.options("/api/feedback", (_req, res) => res.sendStatus(204));

        app.get("/hi", (req, res) => {
            res.send("It's time to kick ass and chew bubblegum!");
        });

        app.post("/api/feedback", (req, res) => {
            const body = req.body || {};
            const message = typeof body.message === "string" ? body.message.trim() : "";
            if (!message) {
                res.status(400).json({ error: "Message is required" });
                return;
            }
            const entry = {
                id: crypto.randomUUID(),
                createdAt: new Date().toISOString(),
                type: body.type === "bug" ? "bug" : "feedback",
                name: typeof body.name === "string" ? body.name.trim() : "",
                email: typeof body.email === "string" ? body.email.trim() : "",
                message,
                ratings: body.ratings && typeof body.ratings === "object" ? body.ratings : {},
                systemInfo: body.systemInfo && typeof body.systemInfo === "object" ? body.systemInfo : {},
            };
            appendFeedback(entry);
            res.status(201).json({ ok: true, id: entry.id });
        });

        app.get("/api/feedback", (req, res) => {
            const key = process.env.FEEDBACK_DASHBOARD_KEY;
            if (key && req.query.key !== key) {
                res.status(401).json({ error: "Unauthorized" });
                return;
            }
            const list = readFeedback();
            res.json(list);
        });

        const dashboardPath = path.join(process.cwd(), "public", "feedback-dashboard.html");
        app.get("/feedback-dashboard", (req, res) => {
            if (!fs.existsSync(dashboardPath)) {
                res.status(404).send("Dashboard not found");
                return;
            }
            res.sendFile(dashboardPath);
        });

        /**
         * Use @colyseus/monitor
         * It is recommended to protect this route with a password
         * Read more: https://docs.colyseus.io/tools/monitoring/#restrict-access-to-the-panel-using-a-password
         */
        app.use("/monitor", monitor());

        /**
         * Use @colyseus/playground
         * (It is not recommended to expose this route in a production environment)
         */
        if (process.env.NODE_ENV !== "production") {
            app.use("/", playground());
        }
    }

});

export default server;