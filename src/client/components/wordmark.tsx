import { useCallback, useEffect, useRef } from "react";

export function Wordmark({ intro = false }: { intro?: boolean }) {
  const link = useRef<HTMLAnchorElement>(null);
  const play = useCallback(() => {
    const element = link.current;
    if (
      !element ||
      document.hidden ||
      matchMedia("(prefers-reduced-motion: reduce)").matches ||
      element.getAnimations({ subtree: true }).some((a) => a.playState === "running")
    ) return;

    const timing = { duration: 1200, easing: "cubic-bezier(.4,0,.2,1)" };
    const folds = [
      ["translate3d(-.12em,-.08em,0) rotateZ(-18deg)", "rotateX(180deg)", "rotateX(360deg)"],
      ["translate3d(0,.08em,18px) rotateZ(12deg)", "rotateY(-180deg)", "rotateY(-360deg)"],
      ["translate3d(.12em,-.04em,0) rotateZ(-12deg)", "rotateY(180deg)", "rotateY(360deg)"],
    ];
    element.querySelectorAll(".wordmark-glyph").forEach((glyph, index) => {
      const [open, turn, settle] = folds[index]!;
      glyph.animate([
        { transform: "none", offset: 0 },
        { transform: open, offset: .22 },
        { transform: turn, offset: .5 },
        { transform: settle, offset: .86 },
        { transform: settle, offset: 1 },
      ], { ...timing, delay: index * 35 });
    });
    element.querySelector(".wordmark-signal")!.animate([
      { transform: "translate(0,0) scale(1)" },
      { transform: "translate(-.55em,-.18em) scale(.7)" },
      { transform: "translate(-.8em,.35em) scale(1.4)" },
      { transform: "translate(.3em,.55em) scale(1.1)" },
      { transform: "translate(.45em,-.1em) scale(.6)" },
      { transform: "translate(0,0) scale(1)" },
    ], timing);
    element.querySelector(".wordmark-orbit")!.animate([
      { transform: "rotate(-25deg) rotateX(65deg) scale(.3)", opacity: 0 },
      { transform: "rotate(45deg) rotateX(65deg) scale(1)", opacity: .55, offset: .3 },
      { transform: "rotate(155deg) rotateX(65deg) scale(1.15)", opacity: .3, offset: .65 },
      { transform: "rotate(220deg) rotateX(65deg) scale(.5)", opacity: 0 },
    ], timing);
    element.querySelector(".wordmark-dot")!.animate([
      { transform: "none" },
      { transform: "translateY(-.25em) scale(.5)", offset: .4 },
      { transform: "none" },
    ], timing);
  }, []);

  useEffect(() => {
    const element = link.current!;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)");
    const stop = () => element.getAnimations({ subtree: true }).forEach((a) => a.cancel());
    const onPreference = () => { if (reduced.matches) stop(); };
    const onVisibility = () => { if (document.hidden) stop(); };
    reduced.addEventListener("change", onPreference);
    document.addEventListener("visibilitychange", onVisibility);
    if (intro) play();
    return () => {
      stop();
      reduced.removeEventListener("change", onPreference);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [intro, play]);

  return (
    <a ref={link} href="/" className="wordmark" aria-label="IPU home"
      onPointerEnter={play} onFocus={play}>
      <span className="wordmark-orbit" aria-hidden="true" />
      <span className="wordmark-glyph" aria-hidden="true">i</span>
      <span className="wordmark-glyph" aria-hidden="true">p</span>
      <span className="wordmark-glyph" aria-hidden="true">u</span>
      <span className="wordmark-dot" aria-hidden="true">.</span>
      <span className="wordmark-signal" aria-hidden="true" />
    </a>
  );
}
