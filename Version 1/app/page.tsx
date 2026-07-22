export default function Home() {
  return (
    <main className="landing-shell">
      <div className="grain" aria-hidden="true" />

      <header className="site-header">
        <a className="monogram" href="#top" aria-label="Perfect Bouquet home">
          <span>p</span>
          <span className="monogram-flower">✿</span>
          <span>b</span>
        </a>
        <p className="tiny-note">made with love, just for you</p>
      </header>

      <section className="hero" id="top" aria-labelledby="hero-title">
        <div className="hero-copy">
          <p className="eyebrow">
            <span className="eyebrow-line" />
            A little garden made for you
          </p>

          <h1 id="hero-title">
            <span>The perfect bouquet</span>
            <em>for the perfect girl</em>
          </h1>

          <p className="intro">
            Every flower has a feeling. Let&apos;s find the ones that feel
            exactly like you.
          </p>

          <a className="quiz-button" href="/quiz">
            <span>Take the quiz</span>
            <span className="button-arrow" aria-hidden="true">↗</span>
          </a>

          <div className="love-signature" aria-hidden="true">
            <span>picked petal by petal</span>
            <span className="heart">♥</span>
          </div>
        </div>

        <div className="garden" aria-label="A bouquet blooming into view">
          <div className="sun-wash" aria-hidden="true" />
          <span className="botanical-name name-one" aria-hidden="true">
            garden rose
          </span>
          <span className="botanical-name name-two" aria-hidden="true">
            eucalyptus
          </span>

          <div className="bouquet-wrap">
            <div className="bouquet-halo" aria-hidden="true" />
            <img
              className="bouquet"
              src="/perfect-bouquet-hero.png"
              alt="Ivory and blush flowers with soft green foliage"
            />
            <span className="sparkle sparkle-one" aria-hidden="true">✦</span>
            <span className="sparkle sparkle-two" aria-hidden="true">✦</span>
            <span className="sparkle sparkle-three" aria-hidden="true">·</span>
          </div>

          <p className="bloom-caption">
            <span>01</span>
            watch something beautiful bloom
          </p>
        </div>
      </section>

    </main>
  );
}
