import React, { useEffect, useRef, useState } from "react";
import confetti from "canvas-confetti";

/**
 * Constantes
 */
const SPEED = 0.75;
const LOGO_WIDTH = 200;
const LOGO_ASPECT_RATIO = 744 / 300;
const LOGO_HEIGHT = LOGO_WIDTH / LOGO_ASPECT_RATIO;

// Distance max pour considérer un “coin touché”
const CORNER_THRESHOLD = 6; // pixels

/**
 * Utils
 */
function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
}

function length(x, y) {
    return Math.hypot(x, y);
}

function normalize(x, y) {
    const m = length(x, y);
    if (m === 0) return { x: 0, y: 0 };
    return { x: x / m, y: y / m };
}

function dot(ax, ay, bx, by) {
    return ax * bx + ay * by;
}

function angleBetween(ax, ay, bx, by) {
    // Retourne l'angle en radians entre deux vecteurs normalisés ou non.
    const a = normalize(ax, ay);
    const b = normalize(bx, by);
    const d = clamp(dot(a.x, a.y, b.x, b.y), -1, 1);
    return Math.acos(d);
}

/**
 * Composant principal
 */
export default function DVDScreensaver() {
    const containerRef = useRef(null);

    // State d’affichage et contrôle
    const [containerSize, setContainerSize] = useState({
        width: window.innerWidth,
        height: window.innerHeight,
    });
    const [renderPos, setRenderPos] = useState({ x: 150, y: 150 });
    const [debug, setDebug] = useState(false);
    const [debugLines, setDebugLines] = useState([]); // dessins debug

    // Refs mutables pour la boucle d’anim (évite des re-renders inutiles)
    const posRef = useRef({ x: 150, y: 150 });
    const dirRef = useRef({ x: 1, y: 1 });
    const lastBounceTimeRef = useRef(0);
    const rafRef = useRef(null);

    // Mesure du container
    useEffect(() => {
        const updateSize = () => {
            const rect = containerRef.current?.getBoundingClientRect();
            if (rect) setContainerSize({ width: rect.width, height: rect.height });
        };
        updateSize();
        window.addEventListener("resize", updateSize);
        return () => window.removeEventListener("resize", updateSize);
    }, []);

    // Clavier: confetti (c), debug (d), ajustement seuil ([ / ])
    useEffect(() => {
        const handleKey = (e) => {
            if (e.key === "c") {
                confetti({
                    particleCount: 100,
                    spread: 70,
                    origin: { x: 0.5, y: 0.5 },
                });
            } else if (e.key === "d") {
                setDebug((prev) => !prev);
            }
        };
        window.addEventListener("keydown", handleKey);
        return () => window.removeEventListener("keydown", handleKey);
    }, []);

    // Boucle d’animation optimisée: une seule effect + refs mutables
    useEffect(() => {
        const animate = () => {
            const maxX = containerSize.width - LOGO_WIDTH;
            const maxY = containerSize.height - LOGO_HEIGHT;

            let x = posRef.current.x;
            let y = posRef.current.y;
            let dx = dirRef.current.x;
            let dy = dirRef.current.y;

            // Avance
            x += dx * SPEED;
            y += dy * SPEED;

            // Rebonds
            let bounced = false;
            if (x <= 0) {
                x = 0;
                dx *= -1;
                bounced = true;
            } else if (x >= maxX) {
                x = maxX;
                dx *= -1;
                bounced = true;
            }
            if (y <= 0) {
                y = 0;
                dy *= -1;
                bounced = true;
            } else if (y >= maxY) {
                y = maxY;
                dy *= -1;
                bounced = true;
            }
            if (bounced) {
                lastBounceTimeRef.current = performance.now();
            }

            // Centre du logo
            const cx = x + LOGO_WIDTH / 2;
            const cy = y + LOGO_HEIGHT / 2;

            // Coins de la zone
            const corners = [
                { x: 0, y: 0 },
                { x: maxX, y: 0 },
                { x: 0, y: maxY },
                { x: maxX, y: maxY },
            ];

            // Confetti si proche du “vrai” coin
            for (const c of corners) {
                const nearCorner =
                    Math.abs(x - c.x) <= CORNER_THRESHOLD &&
                    Math.abs(y - c.y) <= CORNER_THRESHOLD;
                if (nearCorner) {
                    confetti({
                        particleCount: 100,
                        spread: 60,
                        origin: {
                            x: (c.x + LOGO_WIDTH / 2) / containerSize.width,
                            y: (c.y + LOGO_HEIGHT / 2) / containerSize.height,
                        },
                    });
                }
            }

            // Debug collection
            const dbg = [];

            // Coin cible = position « emboîtée » réelle du logo dans le viewport
            let targetScreen;
            let sourceLogo;

            if (dx > 0 && dy > 0) {
                // bas-droite
                sourceLogo = { x: x + LOGO_WIDTH, y: y + LOGO_HEIGHT };
                targetScreen = { x: containerSize.width, y: containerSize.height };
            } else if (dx > 0 && dy < 0) {
                // haut-droite
                sourceLogo = { x: x + LOGO_WIDTH, y: y };
                targetScreen = { x: containerSize.width, y: 0 };
            } else if (dx < 0 && dy > 0) {
                // bas-gauche
                sourceLogo = { x: x, y: y + LOGO_HEIGHT };
                targetScreen = { x: 0, y: containerSize.height };
            } else {
                // haut-gauche
                sourceLogo = { x: x, y: y };
                targetScreen = { x: 0, y: 0 };
            }

            // Vecteur depuis le SOMMET choisi du logo vers le COIN viewport ciblé
            const vx = targetScreen.x - sourceLogo.x;
            const vy = targetScreen.y - sourceLogo.y;

            const a = angleBetween(dx, dy, vx, vy);
            const aDeg = (a * 180) / Math.PI;
            const DEG8 = (8 * Math.PI) / 180;
            const inCone = a < DEG8; // condition d'angle

            // Ligne pointillée sommet->coin viewport
            dbg.push({
                type: "line",
                x1: sourceLogo.x,
                y1: sourceLogo.y,
                x2: targetScreen.x,
                y2: targetScreen.y,
                color: inCone ? "orange" : "gray",
                width: 1,
                dash: "5,5",
            });
            // Étiquette d'angle
            dbg.push({
                type: "text",
                x: (sourceLogo.x + targetScreen.x) / 2,
                y: (sourceLogo.y + targetScreen.y) / 2 - 5,
                text: `${aDeg.toFixed(1)}°`,
                fill: inCone ? "orange" : "lightgray",
            });

            // Vecteur direction vert depuis le même sommet pour cohérence
            dbg.push({
                type: "line",
                x1: sourceLogo.x,
                y1: sourceLogo.y,
                x2: sourceLogo.x + dx * 300,
                y2: sourceLogo.y + dy * 300,
                color: "lime",
                width: 2,
                dash: null,
            });

            // Mise à jour refs + rafraîchissement visuel
            posRef.current = { x, y };
            dirRef.current = { x: dx, y: dy };
            setRenderPos({ x, y }); // un seul setState par frame

            if (debug) {
                setDebugLines(dbg);
            } else if (debugLines.length) {
                setDebugLines([]); // nettoyer quand on quitte le mode debug
            }

            rafRef.current = requestAnimationFrame(animate);
        };

        rafRef.current = requestAnimationFrame(animate);
        return () => {
            if (rafRef.current) cancelAnimationFrame(rafRef.current);
        };
    }, [containerSize.width, containerSize.height, debug]); // dépendances minimales

    return (
        <div
            ref={containerRef}
            className="overflow-hidden relative"
            style={{ width: "100vw", height: "100vh", position: "relative", backgroundColor: "#252740" }}
        >
            {/* Logo */}
            <div
                className={`absolute transition-transform duration-200 ${debug ? "border border-red-500" : ""}`}
                style={{
                    top: renderPos.y,
                    left: renderPos.x,
                    width: `${LOGO_WIDTH}px`,
                    height: `${LOGO_HEIGHT}px`,
                    backgroundImage: "url('/logo.png')",
                    backgroundSize: "contain",
                    backgroundRepeat: "no-repeat",
                    backgroundPosition: "center",
                    position: "absolute",
                }}
            />

            {/* Overlay Debug */}
            {debug && (
                <svg
                    className="absolute top-0 left-0 pointer-events-none"
                    width="100%"
                    height="100%"
                    style={{ position: "absolute", zIndex: 10 }}
                >
                    {debugLines.map((shape, idx) => {
                        if (shape.type === "line") {
                            return (
                                <line
                                    key={idx}
                                    x1={shape.x1}
                                    y1={shape.y1}
                                    x2={shape.x2}
                                    y2={shape.y2}
                                    stroke={shape.color}
                                    strokeWidth={shape.width}
                                    strokeDasharray={shape.dash || undefined}
                                />
                            );
                        }
                        if (shape.type === "text") {
                            return (
                                <text
                                    key={idx}
                                    x={shape.x}
                                    y={shape.y}
                                    fill={shape.fill || "white"}
                                    fontSize="12px"
                                    textAnchor="middle"
                                >
                                    {shape.text}
                                </text>
                            );
                        }
                        return null;
                    })}
                    {/* HUD seuil angulaire */}
                    <text x={12} y={20} fill="white" fontSize="12px">
                        d: debug • c: confetti
                    </text>
                </svg>
            )}
        </div>
    );
}
