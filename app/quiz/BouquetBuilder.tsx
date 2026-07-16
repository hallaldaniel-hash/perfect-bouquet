"use client";

import { CSSProperties, useMemo, useRef, useState } from "react";

const flowers = [
  { name: "Garden Rose", meaning: "devotion", position: "0% 0%" },
  { name: "Blush Peony", meaning: "happy love", position: "25% 0%" },
  { name: "Pink Tulip", meaning: "affection", position: "50% 0%" },
  { name: "White Lily", meaning: "pure love", position: "75% 0%" },
  { name: "Ranunculus", meaning: "radiance", position: "100% 0%" },
  { name: "White Orchid", meaning: "rare beauty", position: "0% 100%" },
  { name: "Delphinium", meaning: "big heart", position: "25% 100%" },
  { name: "Sweet Pea", meaning: "sweetness", position: "50% 100%" },
  { name: "Anemone", meaning: "anticipation", position: "75% 100%" },
  { name: "Baby’s Breath", meaning: "everlasting love", position: "100% 100%" },
];

const wraps = [
  { name: "Warm Ivory", color: "#eee5d6" },
  { name: "Blush Pink", color: "#d9aca5" },
  { name: "Botanical Olive", color: "#596348" },
  { name: "Sage Green", color: "#9da88a" },
  { name: "Dusty Blue", color: "#8fa6ad" },
  { name: "Soft Lilac", color: "#b8a6c2" },
  { name: "Champagne", color: "#cdbb94" },
  { name: "Deep Burgundy", color: "#6d293a" },
  { name: "Natural Kraft", color: "#ad865c" },
  { name: "Midnight", color: "#28333a" },
];

type BloomStyle = CSSProperties & {
  "--x": string;
  "--y": string;
  "--size": string;
  "--delay": string;
  "--flower-position": string;
  "--rotation": string;
};

export default function BouquetBuilder() {
  const [count, setCount] = useState(15);
  const [selectedFlowers, setSelectedFlowers] = useState([0, 1, 4]);
  const [selectedWraps, setSelectedWraps] = useState([0]);
  const [generated, setGenerated] = useState(false);
  const resultRef = useRef<HTMLElement>(null);

  const bouquetBlooms = useMemo(() => {
    return Array.from({ length: count }, (_, index) => {
      const angle = index * 137.5 * (Math.PI / 180);
      const radius = 7.2 * Math.sqrt(index);
      const x = 50 + Math.cos(angle) * radius;
      const y = 43 + Math.sin(angle) * radius * 0.72;
      const flowerIndex = selectedFlowers[index % selectedFlowers.length];
      const size = 66 + ((index * 17) % 36);
      return {
        id: `${index}-${flowerIndex}`,
        flower: flowers[flowerIndex],
        style: {
          "--x": `${x}%`,
          "--y": `${y}%`,
          "--size": `${size}px`,
          "--delay": `${Math.min(index * 0.035, .75)}s`,
          "--flower-position": flowers[flowerIndex].position,
          "--rotation": `${(index * 29) % 24 - 12}deg`,
        } as BloomStyle,
      };
    });
  }, [count, selectedFlowers]);

  function toggleFlower(index: number) {
    setGenerated(false);
    setSelectedFlowers((current) => {
      if (current.includes(index)) {
        return current.length === 1 ? current : current.filter((item) => item !== index);
      }
      return [...current, index];
    });
  }

  function toggleWrap(index: number) {
    setGenerated(false);
    setSelectedWraps((current) => {
      if (current.includes(index)) {
        return current.length === 1 ? current : current.filter((item) => item !== index);
      }
      return current.length === 2 ? [current[1], index] : [...current, index];
    });
  }

  function generateBouquet() {
    setGenerated(true);
    window.setTimeout(() => resultRef.current?.scrollIntoView({ behavior: "smooth" }), 80);
  }

  const wrapOne = wraps[selectedWraps[0]];
  const wrapTwo = wraps[selectedWraps[1] ?? selectedWraps[0]];

  return (
    <main className="builder-page">
      <header className="builder-header">
        <a className="builder-brand" href="/" aria-label="Back to the beginning">
          <span>p</span><span>✿</span><span>b</span>
        </a>
        <div>
          <p>THE PERFECT BOUQUET</p>
          <span>made with love, just for you</span>
        </div>
        <a className="back-link" href="/">← Back</a>
      </header>

      <section className="builder-intro">
        <p className="step-kicker">Your little flower atelier</p>
        <h1>Let&apos;s make something <em>beautiful.</em></h1>
        <p>Choose every detail. There are no wrong answers—only flowers that feel like you.</p>
      </section>

      <section className="choice-section quantity-section" aria-labelledby="quantity-title">
        <div className="section-heading">
          <div><span>01</span><h2 id="quantity-title">How many flowers?</h2></div>
          <output htmlFor="flower-count">{count}<small> blooms</small></output>
        </div>
        <div className="range-wrap">
          <input
            id="flower-count"
            type="range"
            min="1"
            max="29"
            step="2"
            value={count}
            onChange={(event) => { setCount(Number(event.target.value)); setGenerated(false); }}
            aria-valuetext={`${count} flowers`}
            style={{ "--range-progress": `${((count - 1) / 28) * 100}%` } as CSSProperties}
          />
          <div className="range-labels"><span>one sweet bloom</span><span>a grand gesture</span></div>
        </div>
        <p className="odd-note">Only odd numbers—for a bouquet that always feels naturally balanced.</p>
      </section>

      <section className="choice-section" aria-labelledby="flowers-title">
        <div className="section-heading">
          <div><span>02</span><h2 id="flowers-title">Pick her flowers</h2></div>
          <p>{selectedFlowers.length} {selectedFlowers.length === 1 ? "variety" : "varieties"} selected</p>
        </div>
        <div className="flower-grid">
          {flowers.map((flower, index) => {
            const selected = selectedFlowers.includes(index);
            return (
              <button
                type="button"
                className={`flower-card ${selected ? "selected" : ""}`}
                key={flower.name}
                onClick={() => toggleFlower(index)}
                aria-pressed={selected}
              >
                <span className="flower-image" style={{ backgroundPosition: flower.position }} />
                <span className="flower-meta">
                  <strong>{flower.name}</strong>
                  <small>{flower.meaning}</small>
                </span>
                <span className="select-mark" aria-hidden="true">{selected ? "✓" : "+"}</span>
              </button>
            );
          })}
        </div>
      </section>

      <section className="choice-section wrap-section" aria-labelledby="wraps-title">
        <div className="section-heading">
          <div><span>03</span><h2 id="wraps-title">Dress the bouquet</h2></div>
          <p>Choose one, or mix two</p>
        </div>
        <div className="wrap-scroller">
          {wraps.map((wrap, index) => {
            const selected = selectedWraps.includes(index);
            return (
              <button
                type="button"
                className={`wrap-card ${selected ? "selected" : ""}`}
                key={wrap.name}
                onClick={() => toggleWrap(index)}
                aria-pressed={selected}
              >
                <span className="paper-swatch" style={{ backgroundColor: wrap.color }}>
                  <i /><i /><i />
                </span>
                <strong>{wrap.name}</strong>
                <small>{selected ? `wrap ${selectedWraps.indexOf(index) + 1}` : "select"}</small>
              </button>
            );
          })}
        </div>
      </section>

      <div className="generate-row">
        <p>{count} blooms · {selectedFlowers.length} flower types · {selectedWraps.length} wrap {selectedWraps.length === 1 ? "color" : "colors"}</p>
        <button type="button" className="generate-button" onClick={generateBouquet}>
          <span>Make my bouquet</span><b aria-hidden="true">✿</b>
        </button>
      </div>

      {generated && (
        <section className="bouquet-result" ref={resultRef} aria-live="polite">
          <div className="result-title">
            <span>made especially for Dashunya</span>
            <h2>Your bouquet is ready.</h2>
          </div>
          <div className="result-layout">
            <div className="created-bouquet" style={{ "--wrap-one": wrapOne.color, "--wrap-two": wrapTwo.color } as CSSProperties}>
              <div className="wrap-back" />
              <div className="leaf leaf-one" /><div className="leaf leaf-two" /><div className="leaf leaf-three" />
              <div className="bloom-field">
                {bouquetBlooms.map(({ id, flower, style }) => (
                  <span key={id} className="bouquet-bloom" style={style} title={flower.name} />
                ))}
              </div>
              <div className="wrap-front" />
              <div className="bouquet-ribbon"><span /></div>
            </div>

            <article className="love-note">
              <span className="note-label">a note from Daniel</span>
              <span className="wax-heart" aria-hidden="true">♥</span>
              <p>Dear, Dashunya.</p>
              <p>Happy 2nd anniversary to us <span className="inline-heart">♥</span></p>
              <p>
                I love you so much, angel, and I am very excited to see you soon.
                Enjoy your day today, my love, and I hope Kenya is treating you wonderfully!
              </p>
              <p className="signature">Yours truly,<br /><em>Daniel</em> <span>♥</span></p>
            </article>
          </div>
          <button className="edit-button" type="button" onClick={() => { setGenerated(false); window.scrollTo({ top: 0, behavior: "smooth" }); }}>
            Change a few petals
          </button>
        </section>
      )}
    </main>
  );
}
