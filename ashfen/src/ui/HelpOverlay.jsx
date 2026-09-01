/* the field manual — a full help/tutorial reference for players who have
   never touched a grid-tactics game. Reachable from the title card, the
   under-map button row, the pause menu and the onboarding card, so it's
   never more than one tap away.

   The weapon and terrain tables are built from core/data.js and core/map.js
   rather than retyped, so the manual can't drift out of sync with the rules
   the game actually runs. */

import { useState, useEffect } from "react";
import { TYPES } from "../core/map.js";
import { WEAPONS } from "../core/data.js";
import { C, MONO, SERIF } from "./theme.js";
import { Eyebrow, Btn } from "./primitives.jsx";

const TABS = [
  ["basics", "Basics"],
  ["controls", "Controls"],
  ["combat", "Combat"],
  ["terrain", "Terrain"],
  ["glossary", "Glossary"],
];

/* ------------------------------ fragments ------------------------------ */

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <Eyebrow>{title}</Eyebrow>
      {children}
    </div>
  );
}

function P({ children }) {
  return (
    <p style={{ margin: "0 0 8px", fontSize: 13, lineHeight: 1.7, color: C.ink }}>{children}</p>
  );
}

function Steps({ items }) {
  return (
    <ol style={{ margin: "0 0 8px", paddingLeft: 20, fontSize: 13, lineHeight: 1.7, color: C.ink }}>
      {items.map((t, i) => (
        <li key={i} style={{ marginBottom: 4 }}>{t}</li>
      ))}
    </ol>
  );
}

/* term / definition pairs — the glossary's whole job, but also used inline
   wherever a tab needs to name a piece of jargon the HUD shows */
function Term({ k, children }) {
  return (
    <div style={{ marginBottom: 9 }}>
      <div style={{ fontFamily: MONO, fontSize: 11, letterSpacing: "0.1em", color: C.ink }}>
        {k.toUpperCase()}
      </div>
      <div style={{ fontSize: 12.5, lineHeight: 1.6, color: C.inkSoft }}>{children}</div>
    </div>
  );
}

function Table({ cols, head, rows }) {
  const cell = { padding: "4px 6px", borderBottom: "1px dotted " + C.rule };
  return (
    <div style={{ overflowX: "auto" }}>
      <div style={{ fontFamily: MONO, fontSize: 11, color: C.ink, minWidth: 300 }}>
        <div style={{ display: "grid", gridTemplateColumns: cols }}>
          {head.map((h, i) => (
            <div key={i} className="uppercase" style={{
              ...cell, color: C.inkSoft, fontSize: 9, letterSpacing: "0.14em",
              borderBottom: "1px solid " + C.rule,
            }}>{h}</div>
          ))}
          {rows.map((r, ri) =>
            r.map((v, ci) => (
              <div key={ri + ":" + ci} style={{ ...cell, color: ci === 0 ? C.ink : C.inkSoft }}>{v}</div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

/* --------------------------------- tabs -------------------------------- */

function Basics() {
  return (
    <>
      <Section title="What kind of game is this">
        <P>
          Ashfen Pass is a turn-based tactics game: a small band of your soldiers and a company
          of enemies take turns moving around a grid of tiles and fighting. Nothing happens in
          real time — the game waits for you, so take as long as you like on any decision.
        </P>
      </Section>

      <Section title="How you win and lose">
        <P>
          <b>Victory:</b> defeat every enemy unit on the map. That is what &ldquo;rout the enemy
          company&rdquo; means — the Foes counter at the top of the screen shows how many are left.
        </P>
        <P>
          <b>Defeat:</b> Kaelen, your Lord, is killed, or your entire company is wiped out. Kaelen
          is the unit the game is built around; keep him out of trouble he can&rsquo;t win.
        </P>
        <P>
          A fallen unit is gone for the rest of the battle — there is no reviving. If a fight goes
          badly you can always press Restart and take the map again from turn 1.
        </P>
      </Section>

      <Section title="How a turn works">
        <P>
          Each turn has two halves, called <b>phases</b>. During the <b>Player Phase</b> every one
          of your units may act once. When you are finished, you end the turn and the{" "}
          <b>Enemy Phase</b> runs: every enemy moves and attacks on its own. Then turn 2 begins,
          and so on.
        </P>
        <P>
          Acting with a unit means: optionally walk somewhere, then choose one action —{" "}
          <b>Attack</b>, <b>Heal</b>, <b>Vulnerary</b> or <b>Wait</b>. That ends the unit&rsquo;s
          turn; it dims and can&rsquo;t be picked again until next turn. Units you haven&rsquo;t
          used yet carry a glowing ring at their feet.
        </P>
      </Section>

      <Section title="Your first turn, step by step">
        <Steps items={[
          "Tap one of your blue units — Kaelen, the one with the pulsing ring, is a good start.",
          "The blue tiles are everywhere he can walk this turn. The red tiles are everywhere he could strike from those positions.",
          "Tap a blue tile to walk there. (Tapping the unit's own tile stays put.)",
          "A small menu opens. Pick Attack, then tap a red enemy in reach.",
          "The battle forecast appears: your damage and hit chance on the left, the enemy's counterattack on the right. Press Attack to commit, or Back to reconsider.",
          "Repeat with your other units. When everyone has acted, open Menu and press End turn.",
          "Watch the Enemy Phase play out, then do it again — with fewer enemies each time.",
        ]} />
        <P>
          The line of text under the map always names the next thing to do, so you can follow it
          instead of memorising any of this.
        </P>
      </Section>

      <Section title="Advice for a first run">
        <P>
          Turn on <b>Show threat</b> before you move anyone. It shades every tile an enemy could
          reach and attack next phase — standing outside that shading is the single most useful
          habit in this genre.
        </P>
        <P>
          Let the enemy come to you. A unit that attacks on your turn also gets attacked back on
          theirs, so parking a tough unit like Bram in the woods and letting the enemy break itself
          on him usually beats charging in.
        </P>
        <P>
          Check the forecast every time. A 75% hit chance fails often enough to lose a unit, and
          the numbers change with terrain, weapons and who moves where.
        </P>
      </Section>
    </>
  );
}

function Controls() {
  return (
    <>
      <Section title="On the map">
        <Term k="Tap a unit">
          Selects it if it&rsquo;s one of yours and hasn&rsquo;t acted; otherwise just shows its
          stats in the side panel. Tapping an enemy is always safe — it never commits you to
          anything.
        </Term>
        <Term k="Tap a blue tile">Moves the selected unit there and opens its action menu.</Term>
        <Term k="Tap an enemy while a unit is selected">
          Shortcut: if that enemy is reachable, your unit walks into range and the battle forecast
          opens in one step.
        </Term>
        <Term k="Tap empty ground">Deselects, undoing a move you haven&rsquo;t confirmed yet.</Term>
        <Term k="Drag">Orbits the camera around the battlefield.</Term>
        <Term k="Scroll or pinch">Zooms in and out.</Term>
      </Section>

      <Section title="Buttons">
        <Term k="Menu">
          End turn, the graphics resolution, music on/off and the track selector all live here,
          alongside Show threat and Rotate.
        </Term>
        <Term k="Show threat">
          Shades every tile the enemy could attack next phase. Toggle it freely; it changes nothing
          in the game state.
        </Term>
        <Term k="Rotate 90&deg;">
          Spins the board a quarter turn — useful when a hill or tree hides what&rsquo;s behind it.
        </Term>
        <Term k="Back">
          In the action menu or the forecast, Back undoes the move you just made and puts the unit
          where it started. Nothing is final until you pick Attack, Heal, Vulnerary or Wait.
        </Term>
        <Term k="End turn">
          In the Menu. Ends the Player Phase — including for any unit you haven&rsquo;t used, so
          check for a leftover glowing ring first.
        </Term>
      </Section>

      <Section title="Keyboard">
        <Term k="? or H">Opens and closes this manual.</Term>
        <Term k="Esc">Closes it.</Term>
      </Section>
    </>
  );
}

function Combat() {
  const wRows = Object.values(WEAPONS).map((w) => [
    w.name,
    w.staff ? "staff" : w.type,
    w.staff ? "heal " + w.power : String(w.mt),
    String(w.hit),
    String(w.crit),
    w.rmin === w.rmax ? String(w.rmin) : w.rmin + "-" + w.rmax,
  ]);

  return (
    <>
      <Section title="Reading the battle forecast">
        <P>
          Before any attack lands, the forecast shows both sides of the exchange — you on the left,
          the defender on the right. If the right column is blank, that enemy cannot strike back.
        </P>
        <Term k="Dmg">Damage per hit, after their defence and terrain. 0 means you cannot hurt them.</Term>
        <Term k="Hit">Percent chance each strike lands.</Term>
        <Term k="Crit">
          Percent chance a landed strike is a critical hit, which deals <b>triple</b> damage. Enemy
          crits kill units that looked perfectly safe.
        </Term>
        <Term k="Hits">
          x1 or x2 — see Doubling below. x2 means that side swings twice in the exchange.
        </Term>
        <P>
          The exchange resolves in order: you strike, the defender counters if it can, and then
          whichever side doubles strikes once more. It stops early if someone falls.
        </P>
      </Section>

      <Section title="Counterattacks">
        <P>
          A defender strikes back only if the attacker is standing inside its own weapon&rsquo;s
          range. That is the whole reason bows and tomes matter: an archer hitting from 2 tiles
          away takes nothing back from a sword, while walking up to a lance means trading blows.
          Healers, who carry only a staff, never counter.
        </P>
      </Section>

      <Section title="Doubling">
        <P>
          A unit whose Speed is at least <b>4 higher</b> than its opponent&rsquo;s attacks twice in
          the exchange. Doubling is often worth more than raw strength — it&rsquo;s why Nessa and
          Kaelen kill things Bram can&rsquo;t.
        </P>
      </Section>

      <Section title="The weapon triangle">
        <div style={{ fontFamily: MONO, fontSize: 12, color: C.ink, lineHeight: 1.9, marginBottom: 6 }}>
          <div>Sword &rarr; beats &rarr; Axe</div>
          <div>Axe &rarr; beats &rarr; Lance</div>
          <div>Lance &rarr; beats &rarr; Sword</div>
        </div>
        <P>
          Holding the advantage gives <b>+1 damage and +15 hit</b>; being on the wrong side costs
          the same. Bows and tomes sit outside the triangle entirely — they neither gain nor lose.
        </P>
      </Section>

      <Section title="Physical and magical damage">
        <P>
          Ordinary weapons use the attacker&rsquo;s Strength against the defender&rsquo;s Defence,
          and terrain adds to that Defence. Tomes use Magic against Resistance instead, and terrain
          gives no cover from them — a mage digs enemies out of woods and hills that a fighter
          would struggle with.
        </P>
      </Section>

      <Section title="Hit chance is friendlier than it looks">
        <P>
          A displayed hit rate is checked against the average of two random rolls. High numbers land
          more often than the percentage suggests and low numbers land less — 90% is close to a
          sure thing, while 40% is worse than a coin flip. Treat anything under 70% as a gamble.
        </P>
      </Section>

      <Section title="Experience and levels">
        <P>
          Your units earn EXP for landing hits and for healing, and more for finishing off an enemy
          — especially a higher-level one or the boss. At 100 EXP a unit levels up and rolls each
          stat for a possible +1, so growth is random and no two runs are the same. Enemies never
          gain levels.
        </P>
      </Section>

      <Section title="Weapons in this battle">
        <Table
          cols="1.5fr 1fr .9fr .7fr .7fr .7fr"
          head={["Weapon", "Type", "Mt", "Hit", "Crit", "Rng"]}
          rows={wRows}
        />
      </Section>
    </>
  );
}

function Terrain() {
  const rows = Object.values(TYPES).map((t) => {
    const notes = [];
    if (t.block) notes.push("impassable");
    if (t.bridge) notes.push("crosses the river");
    if (t.heal) notes.push("heals " + Math.round(t.heal * 100) + "%/turn");
    if (t.h >= 1) notes.push("high ground");
    return [
      t.name,
      t.block ? "—" : String(t.cost),
      "+" + t.def,
      "+" + t.avo,
      notes.join(", ") || "—",
    ];
  });

  return (
    <>
      <Section title="Terrain matters">
        <P>
          Every tile has a movement cost and may give the unit standing on it bonuses. Rough ground
          costs 2 of a unit&rsquo;s movement instead of 1, so a Mov 5 unit crosses five plains but
          only two wood tiles.
        </P>
        <Term k="Def">Flat damage reduction against physical attacks. Magic ignores it.</Term>
        <Term k="Avoid">Subtracted from an attacker&rsquo;s hit chance — 20 Avoid turns a 90% into a 70%.</Term>
        <P>
          Fighting from a wood, hill or ridge tile is close to free value. It is usually worth spending
          a turn to reach one rather than attacking from open ground.
        </P>
      </Section>

      <Section title="The tiles of Ashfen Pass">
        <Table
          cols="1.1fr .7fr .7fr .8fr 1.6fr"
          head={["Tile", "Cost", "Def", "Avo", "Notes"]}
          rows={rows}
        />
        <P>
          The river cannot be crossed except at the two bridges — which makes those bridges the
          natural place to hold a line. The Keep at the top of the map heals the enemies standing
          on it each turn, so the boss will not wear down on his own.
        </P>
      </Section>
    </>
  );
}

function Glossary() {
  return (
    <>
      <Section title="The battlefield">
        <Term k="Unit">One soldier on the map. Yours are blue, the enemy&rsquo;s red.</Term>
        <Term k="Company">A side&rsquo;s whole set of units.</Term>
        <Term k="Rout">To defeat every unit on a side. Routing the enemy company wins the map.</Term>
        <Term k="Turn">One Player Phase followed by one Enemy Phase.</Term>
        <Term k="Phase">
          Whose half of the turn it is. You act during the Player Phase; the AI acts during the
          Enemy Phase and you cannot interrupt it.
        </Term>
        <Term k="Acted">
          A unit that has already taken its action this turn. It dims and loses its ring.
        </Term>
        <Term k="Movement range">
          The blue tiles — where the selected unit can walk this turn, after terrain costs.
        </Term>
        <Term k="Reach / attack range">
          The red tiles — everywhere the selected unit could attack from somewhere in its movement
          range.
        </Term>
        <Term k="Threat range">
          What Show threat displays: every tile the enemy could attack on their next phase.
        </Term>
        <Term k="Lord">
          Your commander, Kaelen. Losing him loses the battle, which makes him both your best unit
          and your biggest liability.
        </Term>
        <Term k="Boss">
          The enemy commander, Garrick. He holds his position instead of charging, hits very hard,
          and is worth a lot of EXP.
        </Term>
      </Section>

      <Section title="Unit stats">
        <Term k="HP">Hit points. At 0 the unit is defeated and removed from the battle.</Term>
        <Term k="Str">Strength — physical damage.</Term>
        <Term k="Mag">Magic — damage with tomes, and how much a staff heals.</Term>
        <Term k="Skl">Skill — feeds hit chance and critical chance.</Term>
        <Term k="Spd">Speed — feeds avoid, and decides who doubles.</Term>
        <Term k="Lck">Luck — a little hit and avoid, and it lowers the enemy&rsquo;s crit chance on you.</Term>
        <Term k="Def">Defence against physical attacks.</Term>
        <Term k="Res">Resistance against magic.</Term>
        <Term k="Mov">How many tiles of movement the unit spends per turn.</Term>
        <Term k="Exp">
          Experience, 0&ndash;99. Reaching 100 grants a level and a chance at +1 in each stat.
        </Term>
      </Section>

      <Section title="Weapon terms">
        <Term k="Mt">Might — the weapon&rsquo;s own damage, added to Str or Mag.</Term>
        <Term k="Hit">The weapon&rsquo;s base accuracy.</Term>
        <Term k="Crit">The weapon&rsquo;s base critical rate. A crit deals triple damage.</Term>
        <Term k="Rng">
          The distances the weapon can strike at, counted in tiles moved along the grid (never
          diagonally). Swords, lances and axes are Rng 1; bows are Rng 2 only; the Fire tome
          reaches 1&ndash;2.
        </Term>
        <Term k="Tome">A book of magic. Strikes Resistance and ignores terrain Defence.</Term>
        <Term k="Staff">
          A healer&rsquo;s tool. Heals an adjacent ally, cannot attack, and never counterattacks.
        </Term>
        <Term k="Personal weapon">
          A weapon unique to one unit — Kaelen&rsquo;s Shamshir — usually stronger, and often with
          bonus stats attached.
        </Term>
      </Section>

      <Section title="Actions">
        <Term k="Attack">Move into range and fight. The exchange resolves in full, both ways.</Term>
        <Term k="Heal">Mira&rsquo;s staff action: restore HP to an adjacent ally.</Term>
        <Term k="Vulnerary">
          A one-use potion each of your units carries. Restores 10 HP to the user and ends their
          turn.
        </Term>
        <Term k="Wait">End a unit&rsquo;s turn where it stands, doing nothing else.</Term>
      </Section>

      <Section title="Combat terms">
        <Term k="Forecast">The preview of an attack&rsquo;s outcome, shown before you commit.</Term>
        <Term k="Counterattack">
          The defender&rsquo;s answering strike, which happens only if the attacker is inside the
          defender&rsquo;s weapon range.
        </Term>
        <Term k="Double">
          To strike twice in one exchange, granted by 4 or more Speed over the opponent.
        </Term>
        <Term k="Critical hit">A strike that deals triple damage.</Term>
        <Term k="Weapon triangle">
          Sword beats axe, axe beats lance, lance beats sword. The winning side gets +1 damage and
          +15 hit.
        </Term>
        <Term k="Avoid">A defender&rsquo;s dodge, subtracted from the attacker&rsquo;s hit chance.</Term>
      </Section>
    </>
  );
}

const PANELS = { basics: Basics, controls: Controls, combat: Combat, terrain: Terrain, glossary: Glossary };

/* -------------------------------- shell -------------------------------- */

export default function HelpOverlay({ onClose, startTab = "basics" }) {
  const [tab, setTab] = useState(startTab);
  const Panel = PANELS[tab] || Basics;

  useEffect(() => {
    function onKey(e) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 flex items-center justify-center"
      style={{ zIndex: 70, background: "rgba(10,12,18,0.86)", padding: 12 }}>
      <div className="flex flex-col" style={{
        background: C.parch, color: C.ink, border: "2px solid " + C.ink,
        boxShadow: "4px 4px 0 rgba(0,0,0,0.5)",
        width: "min(560px, 100%)", maxHeight: "min(88vh, 720px)",
        fontFamily: SERIF, animation: "popIn .16s ease-out",
      }}>
        {/* header — title, tabs, and a close affordance that stays put while
            the body scrolls under it */}
        <div style={{ padding: "12px 14px 8px", borderBottom: "2px solid " + C.ink, flex: "0 0 auto" }}>
          <div className="flex items-start justify-between gap-2">
            <div>
              <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: "0.22em", color: C.inkSoft }}>
                HOW TO PLAY
              </div>
              <div style={{ fontSize: 20 }}>Field Manual</div>
            </div>
            <button onClick={onClose} aria-label="Close the field manual" style={{
              fontFamily: MONO, fontSize: 15, lineHeight: 1, padding: "8px 11px", minHeight: 36,
              background: "transparent", color: C.ink, border: "2px solid " + C.ink,
              cursor: "pointer", touchAction: "manipulation", WebkitTapHighlightColor: "transparent",
            }}>&times;</button>
          </div>
          <div className="flex flex-wrap gap-1" style={{ marginTop: 10 }}>
            {TABS.map(([id, label]) => (
              <button key={id} onClick={() => setTab(id)} style={{
                fontFamily: MONO, fontSize: 10, letterSpacing: "0.1em", padding: "7px 9px", minHeight: 32,
                background: tab === id ? C.ink : "transparent",
                color: tab === id ? C.parch : C.inkSoft,
                border: "1px solid " + (tab === id ? C.ink : C.rule),
                cursor: "pointer", touchAction: "manipulation",
                WebkitTapHighlightColor: "transparent", userSelect: "none",
              }}>{label.toUpperCase()}</button>
            ))}
          </div>
        </div>

        <div style={{ padding: "12px 14px 16px", overflowY: "auto", flex: "1 1 auto", WebkitOverflowScrolling: "touch" }}>
          <Panel />
        </div>

        <div style={{ padding: "10px 14px", borderTop: "1px solid " + C.rule, flex: "0 0 auto" }}>
          <Btn light strong on={onClose}>Close</Btn>
        </div>
      </div>
    </div>
  );
}
