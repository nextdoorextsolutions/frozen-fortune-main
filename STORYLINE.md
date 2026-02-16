# Frozen Fortune — Storyline & Zone Progression

> Reference document for development. Each zone introduces new survival mechanics, enemies, and building features while progressively raising the stakes.

---

## ❄️ Zone 1: The Frostbitten Tundra *(Current Build)*

**Story:** The player wakes up in the wreckage of their ship. The Engine Core (Furnace) is barely functional. They must learn to survive the supernatural cold, fend off starving wildlife, and gather enough resources to fully ignite the Furnace, which will melt the glacial wall blocking the path south.

**Environment:** Procedural snow, frozen lakes, pine trees.

**Core Survival Mechanic:** Warmth. Blizzards strike at night.

**Enemies:**
- 🐺 **Wolves** — Aggressive at night, passive during day
- 🦌 **Deer** — Passive, flee from threats

**New Feature Introduced:** The foundational loop — Crafting, building fences, and upgrading the central hub.

---

## 🌴 Zone 2: The Steaming Caldera *(Tropical Zone)*

**Story:** Melting the ice wall reveals a massive, sunken volcanic crater where the first shard of the Fortune has created an unnatural, hyper-humid jungle. The player must push through the overgrowth, find the Verdant Shard, and reconfigure their core to survive the heat.

**Environment:** Lush green grass, palm trees, bamboo thickets, muddy rivers.

**Core Survival Mechanic (Shifted):** Warmth is replaced by **Hydration / Heatstroke**. Instead of a Furnace, the central hub becomes a **Water Purifier / Cooling Tower**. If it runs out of fuel (bamboo/coal), the player overheats.

**Weather Event:** **Monsoons.** Instead of freezing, Monsoons flood the map, drastically slowing player movement and degrading wooden structures over time (pushing the player to build with Stone/Clay).

**Enemies:**
- 🐆 **Panthers** — Stealthy, attack from the tree line
- 🐗 **Boars** — Passive until attacked, then they charge

**New Feature Introduced:** **Farming/Planters.** The player can now plant seeds found in the jungle to grow automated food sources within their base walls.

---

## 🏜️ Zone 3: The Scorched Wastes *(Desert/Canyon Zone)*

**Story:** With the jungle stabilized, the player follows the compass into a sprawling, wind-carved canyon where the second shard has sucked all moisture from the air. It's an ancient, dried-out sea bed filled with ruins.

**Environment:** Orange/red sand, sandstone pillars, dried cracked earth, cacti.

**Core Survival Mechanic (Shifted):** **Stamina / Dust Exposure.** The central hub is an **Oasis Pump / Wind-Bane Beacon** that pushes back the choking dust.

**Weather Event:** **Sandstorms.** Visibility drops to near zero. Sand piles up against fences; if the player doesn't shovel it away, enemies can walk right over the walls.

**Enemies:**
- 🦂 **Giant Scorpions** — Armored, require a hammer/pickaxe to deal full damage
- 🦅 **Vultures** — Attack food storage if left unroofed

**New Feature Introduced:** **Verticality / Roofing.** Players must build roofs over their vital machines and crates to protect them from aerial enemies and sand accumulation.

---

## 💎 Zone 4: The Absolute Summit *(The True Frozen Fortune)*

**Story:** The player has all the shards and ascends the highest peak of Aethelgard. This is the epicenter of the anomaly — a surreal, crystalline glacier where the true Frozen Fortune rests. The player must establish one final stronghold to unearth the artifact while surviving the harshest conditions yet.

**Environment:** Reflective blue ice, glowing crystal formations, auroras in the sky, meteorite craters.

**Core Survival Mechanic (Shifted):** **Deep Freeze.** A hybrid of all previous threats. The player must manage Warmth, but standard wood burns too fast. They must mine glowing crystals to power an **Aether Reactor**.

**Weather Event:** **The Eclipse.** Long periods of total darkness where the cold drains health directly if not near a Tier 3 heat source.

**Enemies:**
- 🧊 **Ice Golems** — Slow, massive damage, break through stone walls — requires building new "Crystal Walls"
- 🐻‍❄️ **Polar Bears** — Tanky, roar stuns the player

**New Feature Introduced:** **Traps & Automation.** Simple fences won't hold anymore. The player must build automated ballistas, spike floors, and elemental traps to survive the final siege while the Aether Reactor charges up to 100% to win the game.

---

## 🗺️ Progression Overview

```
Zone 1 (Snow)  →  Zone 2 (Jungle)  →  Zone 3 (Desert)  →  Zone 4 (Crystal Summit)
   Warmth          Hydration            Stamina              Deep Freeze
   Furnace         Cooling Tower        Oasis Pump           Aether Reactor
   Wolves/Deer     Panthers/Boars       Scorpions/Vultures   Golems/Polar Bears
   Fences          Farming              Roofing              Automation/Traps
```

## 🔑 Key Design Pillars

1. **Each zone shifts the core survival mechanic** — keeps gameplay fresh while reusing the same foundational systems
2. **Weather events escalate** — Blizzards → Monsoons → Sandstorms → Eclipses
3. **Building complexity grows** — Fences → Farms → Roofs → Automated defenses
4. **Enemy design forces adaptation** — Each zone's enemies counter the previous zone's strategies
5. **Central hub evolves** — Furnace → Cooling Tower → Oasis Pump → Aether Reactor (same gameplay pattern, different skin/resource)
