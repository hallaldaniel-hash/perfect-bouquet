"use client";

import { useRef, useState } from "react";
import type { CSSProperties } from "react";
import Link from "next/link";
import type { CatalogFlower, CatalogWrap } from "@/lib/catalog";
import { LoveNoteCard } from "@/components/LoveNoteCard";
import SendGiftView, { type GiftBouquet } from "./SendGiftView";

const GIFT_NOTE_MAX = 600;

// Groups the (much larger) flower catalog into readable sections. Order here is
// the order they appear in the picker.
const FLOWER_GROUPS = [
  { category: "main", label: "Feature flowers" },
  { category: "decorative", label: "Accents" },
  { category: "filler", label: "Fillers" },
  { category: "greenery", label: "Greenery" },
] as const;

interface BouquetBuilderProps {
  flowers: CatalogFlower[];
  wraps: CatalogWrap[];
}

export default function BouquetBuilder({ flowers, wraps }: BouquetBuilderProps) {
  const [count, setCount] = useState(15);
  const [selectedFlowers, setSelectedFlowers] = useState([0, 1, 4]);
  const [selectedWraps, setSelectedWraps] = useState([0]);
  const [recipientName, setRecipientName] = useState("");
  const [giftMessage, setGiftMessage] = useState("");
  const [fromName, setFromName] = useState("");
  const [generated, setGenerated] = useState(false);
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  // Base64 data URL of the same image — persisted with the gift so it can be
  // embedded in the email that goes out later.
  const [generatedImageData, setGeneratedImageData] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [generationError, setGenerationError] = useState("");
  const [stage, setStage] = useState<"build" | "send">("build");
  const [giftBouquet, setGiftBouquet] = useState<GiftBouquet | null>(null);
  const [noteError, setNoteError] = useState("");
  const resultRef = useRef<HTMLElement>(null);
  const noteRef = useRef<HTMLElement>(null);

  function goToSend() {
    if (!recipientName.trim() || !giftMessage.trim()) {
      setNoteError("Add their name and a little message before sending.");
      noteRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    setNoteError("");
    const bouquet: GiftBouquet = {
      stemCount: count,
      flowers: selectedFlowers.map((index) => ({
        id: flowers[index].id,
        name: flowers[index].name,
      })),
      wraps: selectedWraps.map((index) => ({
        id: wraps[index].id,
        name: wraps[index].name,
        color: wraps[index].color,
      })),
      imageUrl: generatedImage,
      imageData: generatedImageData,
      letter: { recipientName, message: giftMessage, fromName },
    };
    setGiftBouquet(bouquet);
    setStage("send");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function loadImage(src: string) {
    return new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("A flower image could not be loaded."));
      image.src = src;
    });
  }

  async function buildReferenceImage() {
    // Load just the artwork for the flowers actually chosen, keyed by their
    // catalog index so the layout loop can look each one up.
    const chosen = await Promise.all(
      selectedFlowers.map(async (index) => [index, await loadImage(flowers[index].image)] as const),
    );
    const artwork = new Map<number, HTMLImageElement>(chosen);

    const canvas = document.createElement("canvas");
    canvas.width = 1024;
    canvas.height = 1024;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("The bouquet reference could not be prepared.");

    context.fillStyle = "#f4efe5";
    context.fillRect(0, 0, canvas.width, canvas.height);

    const firstWrap = wraps[selectedWraps[0]].color;
    const secondWrap = wraps[selectedWraps[1] ?? selectedWraps[0]].color;

    context.beginPath();
    context.moveTo(225, 585);
    context.lineTo(799, 585);
    context.lineTo(650, 975);
    context.lineTo(374, 975);
    context.closePath();
    context.fillStyle = secondWrap;
    context.fill();

    context.beginPath();
    context.moveTo(295, 610);
    context.lineTo(729, 610);
    context.lineTo(620, 920);
    context.lineTo(404, 920);
    context.closePath();
    context.fillStyle = firstWrap;
    context.fill();

    const exactFlowerList = Array.from({ length: count }, (_, index) => {
      const base = Math.floor(count / selectedFlowers.length);
      const remainder = count % selectedFlowers.length;
      let cursor = 0;
      for (let selectionIndex = 0; selectionIndex < selectedFlowers.length; selectionIndex += 1) {
        const allocation = base + (selectionIndex < remainder ? 1 : 0);
        if (index < cursor + allocation) return selectedFlowers[selectionIndex];
        cursor += allocation;
      }
      return selectedFlowers[0];
    });

    exactFlowerList.forEach((flowerIndex, index) => {
      const angle = index * 137.5 * (Math.PI / 180);
      const radius = 42 * Math.sqrt(index);
      const centerX = 512 + Math.cos(angle) * radius;
      const centerY = 420 + Math.sin(angle) * radius * .66;
      const size = Math.max(104, 174 - count * 2.4) + ((index * 11) % 22);
      const source = artwork.get(flowerIndex);
      if (!source) return;

      // Take a square from the upper part of the artwork — that's the bloom
      // itself, above the stem — and drop it into a circular mask.
      const crop = Math.min(source.naturalWidth, source.naturalHeight * 0.82);
      const cropX = (source.naturalWidth - crop) / 2;

      context.save();
      context.beginPath();
      context.arc(centerX, centerY, size / 2, 0, Math.PI * 2);
      context.clip();
      context.drawImage(
        source,
        cropX,
        0,
        crop,
        crop,
        centerX - size / 2,
        centerY - size / 2,
        size,
        size,
      );
      context.restore();
    });

    context.strokeStyle = "#efe6d6";
    context.lineWidth = 18;
    context.beginPath();
    context.ellipse(512, 775, 112, 30, -.06, 0, Math.PI * 2);
    context.stroke();

    return canvas.toDataURL("image/jpeg", .8);
  }

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

  async function generateBouquet() {
    setGenerating(true);
    setGenerationError("");
    setGenerated(false);

    try {
      const referenceImage = await buildReferenceImage();
      const response = await fetch("/api/generate-bouquet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          count,
          flowers: selectedFlowers.map((index) => flowers[index].name),
          wraps: selectedWraps.map((index) => wraps[index].name),
          referenceImage,
        }),
      });
      if (!response.ok) {
        const rawError = await response.text();
        let message = "The flowers need another moment to bloom. Please try again.";
        try {
          const parsed = JSON.parse(rawError) as { error?: unknown };
          if (typeof parsed.error === "string") message = parsed.error;
        } catch {
          if (response.status === 504) {
            message = "The bouquet took too long to bloom. Please press the button once more.";
          }
        }
        throw new Error(message);
      }

      const contentType = response.headers.get("content-type") || "";
      if (!contentType.startsWith("image/")) {
        throw new Error("The image studio returned an unexpected result. Please try again.");
      }

      const imageBlob = await response.blob();
      if (imageBlob.size === 0) {
        throw new Error("The bouquet image arrived empty. Please try again.");
      }

      const imageUrl = URL.createObjectURL(imageBlob);
      if (generatedImage?.startsWith("blob:")) URL.revokeObjectURL(generatedImage);
      setGeneratedImage(imageUrl);

      // Keep a base64 copy so the gift can carry the image to the server, where
      // it is stored and later embedded in the delivered email.
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = () => reject(new Error("Could not prepare the bouquet image."));
        reader.readAsDataURL(imageBlob);
      });
      setGeneratedImageData(dataUrl);

      setGenerated(true);
      window.setTimeout(() => resultRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
    } catch (error) {
      setGenerationError(error instanceof Error ? error.message : "The flowers need another moment. Please try again.");
    } finally {
      setGenerating(false);
    }
  }

  if (stage === "send" && giftBouquet) {
    return <SendGiftView bouquet={giftBouquet} onBack={() => { setStage("build"); window.scrollTo({ top: 0 }); }} />;
  }

  return (
    <main className="builder-page">
      <header className="builder-header">
        <Link className="builder-brand" href="/" aria-label="Back to the beginning">
          <span>p</span><span>✿</span><span>b</span>
        </Link>
        <div>
          <p>THE PERFECT BOUQUET</p>
          <span>made with love, sent with feeling</span>
        </div>
        <Link className="back-link" href="/">← Back</Link>
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
        <div className="odd-note">
          <p className="odd-note-label">Always an odd number</p>
          <p className="odd-note-detail">
            It&apos;s an old tradition: across much of Eastern Europe, Russia, and Poland,
            an <em>even</em> number of flowers is kept for mourning and farewells — so
            <em> odd</em>-numbered bouquets are the ones given for joy, love, and celebration.
          </p>
        </div>
      </section>

      <section className="choice-section" aria-labelledby="flowers-title">
        <div className="section-heading">
          <div><span>02</span><h2 id="flowers-title">Pick the flowers</h2></div>
          <p>{selectedFlowers.length} {selectedFlowers.length === 1 ? "variety" : "varieties"} selected</p>
        </div>
        {FLOWER_GROUPS.map((group) => {
          const entries = flowers
            .map((flower, index) => ({ flower, index }))
            .filter(({ flower }) => flower.category === group.category);
          if (entries.length === 0) return null;
          return (
            <div className="flower-group" key={group.category}>
              <p className="flower-group-label">{group.label}</p>
              <div className="flower-grid">
                {entries.map(({ flower, index }) => {
                  const selected = selectedFlowers.includes(index);
                  return (
                    <button
                      type="button"
                      className={`flower-card ${selected ? "selected" : ""}`}
                      key={flower.id}
                      onClick={() => toggleFlower(index)}
                      aria-pressed={selected}
                    >
                      <span
                        className="flower-image"
                        style={{ backgroundImage: `url(${flower.image})` }}
                      />
                      <span className="flower-meta">
                        <strong>{flower.name}</strong>
                        <small>{flower.meaning}</small>
                      </span>
                      <span className="select-mark" aria-hidden="true">{selected ? "✓" : "+"}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
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

      <section className="choice-section note-section" aria-labelledby="note-title" ref={noteRef}>
        <div className="section-heading">
          <div><span>04</span><h2 id="note-title">Write the card</h2></div>
          <p>Tucked in with the flowers</p>
        </div>
        <div className="note-layout">
          <div className="note-fields">
            <label className="field">
              <span className="field-label">Who is it for?</span>
              <input
                type="text"
                className="field-input"
                value={recipientName}
                maxLength={80}
                placeholder="Their name"
                onChange={(event) => setRecipientName(event.target.value)}
              />
            </label>
            <label className="field">
              <span className="field-label">Your message</span>
              <textarea
                className="field-textarea"
                value={giftMessage}
                maxLength={GIFT_NOTE_MAX}
                placeholder="Say the thing you'd write by hand…"
                onChange={(event) => setGiftMessage(event.target.value)}
              />
              <span className="field-hint">{giftMessage.length}/{GIFT_NOTE_MAX} · line breaks become new lines on the card</span>
            </label>
            <label className="field">
              <span className="field-label">Signed</span>
              <input
                type="text"
                className="field-input"
                value={fromName}
                maxLength={80}
                placeholder="Your name"
                onChange={(event) => setFromName(event.target.value)}
              />
            </label>
          </div>
          <div className="note-preview" aria-hidden="true">
            <LoveNoteCard
              recipientName={recipientName}
              message={giftMessage}
              fromName={fromName}
              preview
            />
          </div>
        </div>
      </section>

      <div className="generate-row">
        <div className="generate-summary">
          <p>{count} blooms · {selectedFlowers.length} flower types · {selectedWraps.length} wrap {selectedWraps.length === 1 ? "color" : "colors"}</p>
          {generationError && <p className="generation-error" role="alert">{generationError}</p>}
        </div>
        <button type="button" className="generate-button" onClick={generateBouquet} disabled={generating}>
          <span>{generating ? "Growing your bouquet…" : "Make my bouquet"}</span><b aria-hidden="true">{generating ? "···" : "✿"}</b>
        </button>
      </div>

      {generated && generatedImage && (
        <section className="bouquet-result" ref={resultRef} aria-live="polite">
          <div className="result-title">
            <span>made especially for {recipientName.trim() || "someone lovely"}</span>
            <h2>Your bouquet is ready.</h2>
          </div>
          <div className="result-layout">
            <div className="ai-bouquet-frame">
              <img src={generatedImage} alt={`A custom ${count}-flower bouquet`} />
              <span className="ai-bouquet-label">your one-of-a-kind bouquet</span>
            </div>

            <LoveNoteCard
              recipientName={recipientName}
              message={giftMessage}
              fromName={fromName}
              preview
            />
          </div>
          <div className="result-actions">
            <button className="checkout-cta" type="button" onClick={goToSend}>
              <span>Send this bouquet</span><b aria-hidden="true">→</b>
            </button>
            {noteError && <p className="note-error" role="alert">{noteError}</p>}
            <button className="edit-button" type="button" onClick={() => { setGenerated(false); setGeneratedImage(null); setGeneratedImageData(null); window.scrollTo({ top: 0, behavior: "smooth" }); }}>
              Change a few petals
            </button>
          </div>
        </section>
      )}
    </main>
  );
}
