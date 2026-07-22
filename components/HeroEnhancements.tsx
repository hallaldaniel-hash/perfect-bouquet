"use client";

import { useEffect } from "react";

type QuickTo = (value: number) => void;

// Progressive enhancement: a soft mouse-parallax on the hero bouquet and
// botanical labels, via GSAP. Renders nothing and only touches existing DOM, so
// the server-rendered hero works with or without it.
//
// The listener is always attached and the enable/disable decision is made per
// event from the *live* media state. That keeps it correct when the viewport
// changes (narrow window later maximised, phone rotated to landscape) without
// any attach/detach lifecycle that could get stuck in the wrong state.
const DISABLE_QUERY =
  "(prefers-reduced-motion: reduce), (hover: none), (max-width: 840px)";

export function HeroEnhancements() {
  useEffect(() => {
    const hero = document.querySelector<HTMLElement>(".hero");
    const bouquet = document.querySelector<HTMLElement>(".bouquet");
    if (!hero || !bouquet) return;

    const mq = window.matchMedia(DISABLE_QUERY);
    let disposed = false;
    let loading = false;
    let setters: {
      x: QuickTo;
      y: QuickTo;
      halo: QuickTo | null;
      names: QuickTo[];
      reset: () => void;
    } | null = null;

    const ensureSetters = async () => {
      if (setters || loading || disposed) return;
      loading = true;
      try {
        const { gsap } = await import("gsap");
        if (disposed) return;
        const halo = document.querySelector<HTMLElement>(".bouquet-halo");
        const names = Array.from(
          document.querySelectorAll<HTMLElement>(".botanical-name"),
        );
        const targets = [bouquet, halo, ...names].filter(Boolean) as HTMLElement[];
        setters = {
          x: gsap.quickTo(bouquet, "x", { duration: 0.9, ease: "power3.out" }),
          y: gsap.quickTo(bouquet, "y", { duration: 0.9, ease: "power3.out" }),
          halo: halo ? gsap.quickTo(halo, "x", { duration: 1.2, ease: "power3.out" }) : null,
          names: names.map((n) => gsap.quickTo(n, "x", { duration: 1.4, ease: "power3.out" })),
          reset: () => {
            gsap.killTweensOf(targets);
            gsap.set(targets, { x: 0, y: 0 });
          },
        };
      } catch (error) {
        console.warn("Hero parallax unavailable", error);
      } finally {
        loading = false;
      }
    };

    const apply = (nx: number, ny: number) => {
      if (!setters) return;
      setters.x(nx * 26);
      setters.y(ny * 18);
      setters.halo?.(nx * 14);
      setters.names.forEach((t) => t(nx * -18));
    };

    const onMove = (event: MouseEvent) => {
      if (disposed || mq.matches) return;
      const rect = hero.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const nx = (event.clientX - rect.left) / rect.width - 0.5; // -0.5..0.5
      const ny = (event.clientY - rect.top) / rect.height - 0.5;
      if (!setters) {
        // Load GSAP on the first real hover, then apply on subsequent moves.
        void ensureSetters().then(() => {
          if (!disposed && !mq.matches) apply(nx, ny);
        });
        return;
      }
      apply(nx, ny);
    };

    const onLeave = () => {
      if (disposed || !setters) return;
      apply(0, 0);
    };

    // If the viewport becomes a non-hover / reduced-motion context, put the
    // hero back exactly where the CSS wants it.
    const onMediaChange = () => {
      if (mq.matches) setters?.reset();
    };

    hero.addEventListener("mousemove", onMove);
    hero.addEventListener("mouseleave", onLeave);
    mq.addEventListener("change", onMediaChange);

    return () => {
      disposed = true;
      hero.removeEventListener("mousemove", onMove);
      hero.removeEventListener("mouseleave", onLeave);
      mq.removeEventListener("change", onMediaChange);
      setters?.reset();
    };
  }, []);

  return null;
}
