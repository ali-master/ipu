import { useEffect, useRef, useState } from "react";
import createGlobe from "cobe";

export default function Globe({
  latitude,
  longitude,
  dark,
}: {
  latitude: number | null;
  longitude: number | null;
  dark: boolean;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const rotation = useRef(0);
  const dragging = useRef<number | null>(null);
  const renderer = useRef<ReturnType<typeof createGlobe> | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const element = canvas.current!;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)");
    const dpr = Math.min(devicePixelRatio, 1.5);
    let visible = true;
    let frame = 0;
    let last = 0;
    rotation.current =
      longitude === null
        ? 0.5
        : Math.PI - ((longitude * Math.PI) / 180 - Math.PI / 2);
    let globe: ReturnType<typeof createGlobe>;
    try {
      const context = {
        alpha: true,
        antialias: true,
        depth: false,
        stencil: false,
      };
      if (
        !element.getContext("webgl2", context) &&
        !element.getContext("webgl", context)
      ) {
        setFailed(true);
        return;
      }
      globe = createGlobe(element, {
        devicePixelRatio: dpr,
        width: element.clientWidth,
        height: element.clientWidth,
        phi: rotation.current,
        theta: latitude === null ? 0.25 : (latitude * Math.PI) / 180,
        dark: dark ? 0.78 : 0,
        diffuse: 1.2,
        mapSamples: 14000,
        mapBrightness: dark ? 2.1 : 2,
        baseColor: dark ? [0.62, 0.68, 0.65] : [0.72, 0.72, 0.67],
        markerColor: dark ? [0.95, 0.83, 0.32] : [0.8, 0.73, 0.25],
        glowColor: dark ? [0.12, 0.16, 0.14] : [0.91, 0.91, 0.89],
        opacity: 1,
        scale: 1.02,
        markers:
          latitude !== null && longitude !== null
            ? [{ location: [latitude, longitude], size: 0.07 }]
            : [],
      });
    } catch {
      setFailed(true);
      return;
    }
    renderer.current = globe;
    const resize = new ResizeObserver(() =>
      globe.update({ width: element.clientWidth, height: element.clientWidth }),
    );
    resize.observe(element);
    const observer = new IntersectionObserver(([entry]) => {
      visible = entry!.isIntersecting;
    });
    observer.observe(element);
    function animate(time: number) {
      if (visible && !document.hidden && time - last > 32) {
        if (
          !reduced.matches &&
          dragging.current === null &&
          latitude === null
        ) {
          rotation.current += 0.002;
        }
        // COBE loads its map texture asynchronously without a ready callback.
        globe.update({ phi: rotation.current });
        last = time;
      }
      frame = requestAnimationFrame(animate);
    }
    frame = requestAnimationFrame(animate);
    return () => {
      cancelAnimationFrame(frame);
      resize.disconnect();
      observer.disconnect();
      renderer.current = null;
      globe.destroy();
    };
  }, [latitude, longitude, dark]);
  return (
    <div className="globe-wrap">
      {failed ? (
        <div className="globe-fallback">
          <svg viewBox="0 0 400 400" aria-hidden="true">
            <circle cx="200" cy="200" r="175" />
            <ellipse cx="200" cy="200" rx="90" ry="175" />
            <ellipse cx="200" cy="200" rx="175" ry="70" />
            <path d="M25 200h350M200 25v350" />
          </svg>
          <span>Location details below</span>
        </div>
      ) : (
        <canvas
          ref={canvas}
          className="globe-canvas"
          role="img"
          tabIndex={0}
          aria-label="Interactive globe. Drag or use left and right arrow keys to rotate. The marker shows the approximate IP location."
          onKeyDown={(event) => {
            if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
              event.preventDefault();
              rotation.current += event.key === "ArrowLeft" ? -0.15 : 0.15;
              renderer.current?.update({ phi: rotation.current });
            }
          }}
          onPointerDown={(event) => {
            dragging.current = event.clientX;
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerMove={(event) => {
            if (dragging.current !== null) {
              rotation.current += (event.clientX - dragging.current) / 160;
              dragging.current = event.clientX;
              renderer.current?.update({ phi: rotation.current });
            }
          }}
          onPointerUp={() => {
            dragging.current = null;
          }}
          onPointerCancel={() => {
            dragging.current = null;
          }}
        />
      )}
    </div>
  );
}
