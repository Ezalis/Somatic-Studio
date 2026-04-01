'use strict';
const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dataDir = path.join(__dirname, 'data');
fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(path.join(dataDir, 'sessions.db'));
const app = express();
app.use(express.json({ limit: '64kb' }));

db.exec(`
  CREATE TABLE IF NOT EXISTS sessions (
    id          TEXT PRIMARY KEY,
    created_at  INTEGER NOT NULL,
    arc_pattern TEXT,
    hero_count  INTEGER NOT NULL,
    image_ids   TEXT NOT NULL,
    trait_seq   TEXT NOT NULL
  )
`);

// POST /sessions — receive a session summary
app.post('/sessions', (req, res) => {
    const { id, createdAt, arcPattern, heroCount, imageIds, traitSequence } = req.body;
    if (!id || !Array.isArray(imageIds) || imageIds.length < 2) {
        return res.status(400).json({ error: 'invalid payload' });
    }
    try {
        db.prepare(
            'INSERT OR REPLACE INTO sessions (id, created_at, arc_pattern, hero_count, image_ids, trait_seq) VALUES (?, ?, ?, ?, ?, ?)'
        ).run(
            id,
            createdAt ?? Date.now(),
            arcPattern ?? null,
            heroCount ?? imageIds.length,
            JSON.stringify(imageIds),
            JSON.stringify(traitSequence ?? [])
        );
        res.json({ ok: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// GET /data — aggregate resonance data
app.get('/data', (_req, res) => {
    try {
        const sessions = db.prepare('SELECT * FROM sessions').all();

        const imageFreq = {};
        const imageTraits = {};
        const pairs = {};

        for (const s of sessions) {
            const ids = JSON.parse(s.image_ids);
            const traits = JSON.parse(s.trait_seq);

            for (let i = 0; i < ids.length; i++) {
                const id = ids[i];
                imageFreq[id] = (imageFreq[id] || 0) + 1;

                const stepTraits = Array.isArray(traits[i]) ? traits[i] : [];
                if (!imageTraits[id]) imageTraits[id] = {};
                for (const t of stepTraits) {
                    imageTraits[id][t] = (imageTraits[id][t] || 0) + 1;
                }

                if (i > 0) {
                    const key = `${ids[i - 1]}|${id}`;
                    pairs[key] = (pairs[key] || 0) + 1;
                }
            }
        }

        // Divergence: how spread are trait choices per image? (0 = everyone same, 1 = max split)
        const divergence = {};
        for (const [imgId, traits] of Object.entries(imageTraits)) {
            const values = Object.values(traits);
            const total = values.reduce((a, b) => a + b, 0);
            const max = Math.max(...values);
            divergence[imgId] = total > 1 ? +(1 - max / total).toFixed(3) : 0;
        }

        // Bridges: image pairs that appear across multiple sessions
        const bridges = Object.entries(pairs)
            .filter(([, c]) => c >= 2)
            .sort(([, a], [, b]) => b - a)
            .slice(0, 20)
            .map(([key, count]) => {
                const [from, to] = key.split('|');
                return { from, to, count };
            });

        const arcPatterns = {};
        for (const s of sessions) {
            if (s.arc_pattern) arcPatterns[s.arc_pattern] = (arcPatterns[s.arc_pattern] || 0) + 1;
        }

        res.json({ sessionCount: sessions.length, imageFrequency: imageFreq, imageTraits, divergence, bridges, arcPatterns });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

const PORT = process.env.PORT || 3002;
app.listen(PORT, () => console.log(`Resonance API on :${PORT}`));
