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
  const surface = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const beacon = useRef<HTMLDivElement>(null);
  const renderer = useRef<ReturnType<typeof createGlobe> | null>(null);
  const view = useRef({ phi: 0.5, theta: 0.25 });
  const dragging = useRef<number | null>(null);
  const location = useRef<[number, number] | null>(null);
  const motion = useRef<{
    from: { phi: number; theta: number };
    phi: number;
    theta: number;
    start: number | null;
  } | null>(null);
  const pulses = useRef<Animation[]>([]);
  const [failed, setFailed] = useState(false);
  const [contextVersion, setContextVersion] = useState(0);
  const located =
    latitude !== null &&
    longitude !== null &&
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    Math.abs(latitude) <= 90 &&
    Math.abs(longitude) <= 180;

  function settle() {
    motion.current = null;
    pulses.current.forEach((animation) => animation.cancel());
  }

  useEffect(() => {
    location.current = located ? [latitude!, longitude!] : null;
    settle();
    if (!located) return;
    const target = Math.PI * 1.5 - (longitude! * Math.PI) / 180;
    const delta = Math.atan2(
      Math.sin(target - view.current.phi),
      Math.cos(target - view.current.phi),
    );
    motion.current = {
      from: { ...view.current },
      phi: view.current.phi + delta,
      theta: (latitude! * Math.PI) / 180,
      start: null,
    };
  }, [latitude, longitude, located]);

  useEffect(() => {
    const element = canvas.current!;
    const host = surface.current!;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)");
    let visible = true;
    let frame = 0;
    let last = 0;
    let globe: ReturnType<typeof createGlobe> | undefined;
    const lost = (event: Event) => {
      event.preventDefault();
      setFailed(true);
    };
    const restored = () => {
      setFailed(false);
      setContextVersion((version) => version + 1);
    };
    element.addEventListener("webglcontextlost", lost);
    element.addEventListener("webglcontextrestored", restored);
    try {
      const context = {
        alpha: true,
        antialias: true,
        depth: false,
        stencil: false,
      };
      const gl =
        element.getContext("webgl2", context) ??
        element.getContext("webgl", context);
      if (!gl || !("disableVertexAttribArray" in gl))
        throw new Error("WebGL unavailable");
      const instance = createGlobe(element, {
        devicePixelRatio: Math.min(devicePixelRatio, 1.5),
        width: element.clientWidth,
        height: element.clientWidth,
        ...view.current,
        dark: 0,
        diffuse: 1.2,
        mapSamples: 14000,
        mapBrightness: 2,
        baseColor: [0.72, 0.72, 0.67],
        markerColor: [0.8, 0.73, 0.25],
        glowColor: [0.91, 0.91, 0.89],
        opacity: 1,
        scale: 1.02,
        markers: [],
      });
      const attributes = gl.getParameter(gl.MAX_VERTEX_ATTRIBS) as number;
      globe = {
        destroy: instance.destroy,
        update(state) {
          // COBE 2 leaves marker attributes enabled; empty marker buffers can blank the next globe draw.
          for (let index = 0; index < attributes; index++)
            gl.disableVertexAttribArray(index);
          instance.update(state);
        },
      };
      renderer.current = globe;
      setFailed(false);
    } catch {
      setFailed(true);
    }
    const resize = new ResizeObserver(() =>
      globe?.update({
        width: element.clientWidth,
        height: element.clientWidth,
      }),
    );
    resize.observe(host);
    const finish = () => {
      if (motion.current)
        view.current = { phi: motion.current.phi, theta: motion.current.theta };
      settle();
    };
    const visibility = () => {
      if (document.hidden) finish();
    };
    const preference = () => {
      if (reduced.matches) finish();
    };
    document.addEventListener("visibilitychange", visibility);
    reduced.addEventListener("change", preference);
    const observer = new IntersectionObserver(([entry]) => {
      visible = entry!.isIntersecting;
      if (!visible) finish();
    });
    observer.observe(host);
    function animate(time: number) {
      if (globe && visible && !document.hidden && time - last > 32) {
        const target = motion.current;
        let arrival = 1;
        if (target) {
          if (target.start === null) {
            target.start = time;
            if (!reduced.matches)
              pulses.current = Array.from(beacon.current!.children).map(
                (ring, i) =>
                  ring.animate(
                    [
                      { transform: "scale(0.35)", opacity: 0 },
                      { opacity: 0.8, offset: 0.12 },
                      { transform: "scale(2.6)", opacity: 0 },
                    ],
                    {
                      duration: 850,
                      delay: 450 + i * 160,
                      easing: "cubic-bezier(0.16, 1, 0.3, 1)",
                    },
                  ),
              );
          }
          arrival = reduced.matches
            ? 1
            : Math.min((time - target.start) / 1000, 1);
          const eased = 1 - (1 - arrival) ** 3;
          view.current = {
            phi: target.from.phi + (target.phi - target.from.phi) * eased,
            theta:
              target.from.theta + (target.theta - target.from.theta) * eased,
          };
          if (arrival === 1) motion.current = null;
        } else if (
          !location.current &&
          !reduced.matches &&
          dragging.current === null
        )
          view.current.phi += 0.002;
        const point = location.current;
        const reveal = Math.min(1, Math.max(0, (arrival - 0.35) / 0.65));
        const elevation = 0.05 + 0.22 * (1 - reveal) ** 2;
        // COBE loads its map texture asynchronously; keep visible redraws even with reduced motion.
        globe.update({
          ...view.current,
          markerElevation: elevation,
          markers: point ? [{ location: point, size: 0.07 * reveal }] : [],
        });
        if (point) {
          // Match COBE's projection so the arrival rings follow the real point during rotation and dragging.
          const lat = (point[0] * Math.PI) / 180,
            lon = (point[1] * Math.PI) / 180;
          const x = Math.cos(lat) * Math.cos(lon),
            y = Math.sin(lat),
            z = -Math.cos(lat) * Math.sin(lon);
          const { phi, theta } = view.current;
          const px = Math.cos(phi) * x + Math.sin(phi) * z;
          const py =
            Math.sin(phi) * Math.sin(theta) * x +
            Math.cos(theta) * y -
            Math.cos(phi) * Math.sin(theta) * z;
          const pz =
            -Math.sin(phi) * Math.cos(theta) * x +
            Math.sin(theta) * y +
            Math.cos(phi) * Math.cos(theta) * z;
          const radius = (0.8 + elevation) * 1.02;
          beacon.current!.style.transform = `translate(${((px * radius + 1) * element.clientWidth) / 2}px, ${((1 - py * radius) * element.clientWidth) / 2}px)`;
          beacon.current!.style.visibility =
            pz >= 0 && reveal > 0 ? "visible" : "hidden";
        } else beacon.current!.style.visibility = "hidden";
        host.dataset.phase = motion.current
          ? "locating"
          : point
            ? "located"
            : "exploring";
        last = time;
      }
      frame = requestAnimationFrame(animate);
    }
    frame = requestAnimationFrame(animate);
    return () => {
      cancelAnimationFrame(frame);
      pulses.current.forEach((animation) => animation.cancel());
      resize.disconnect();
      observer.disconnect();
      document.removeEventListener("visibilitychange", visibility);
      reduced.removeEventListener("change", preference);
      element.removeEventListener("webglcontextlost", lost);
      element.removeEventListener("webglcontextrestored", restored);
      renderer.current = null;
      globe?.destroy();
      // COBE wraps the canvas but does not remove that wrapper on destroy.
      const wrapper = element.parentElement;
      if (wrapper && wrapper !== host) {
        host.append(element);
        wrapper.remove();
      }
    };
  }, [contextVersion]);

  useEffect(() => {
    renderer.current?.update({
      dark: dark ? 0.78 : 0,
      mapBrightness: dark ? 2.1 : 2,
      baseColor: dark ? [0.62, 0.68, 0.65] : [0.72, 0.72, 0.67],
      markerColor: dark ? [0.95, 0.83, 0.32] : [0.8, 0.73, 0.25],
      glowColor: dark ? [0.12, 0.16, 0.14] : [0.91, 0.91, 0.89],
    });
  }, [dark, contextVersion]);

  return (
    <div
      className="globe-wrap"
      data-location={located ? "available" : "unavailable"}
    >
      <div
        ref={surface}
        className="globe-surface"
        style={{ visibility: failed ? "hidden" : "visible" }}
      >
        <canvas
          ref={canvas}
          className="globe-canvas"
          role="img"
          tabIndex={failed ? -1 : 0}
          aria-hidden={failed}
          aria-label={`Interactive globe. Drag or use left and right arrow keys to rotate. ${located ? "The marker shows the approximate IP location." : "No public location is available for this address."}`}
          onKeyDown={(event) => {
            if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
              event.preventDefault();
              settle();
              view.current.phi += event.key === "ArrowLeft" ? -0.15 : 0.15;
            }
          }}
          onPointerDown={(event) => {
            settle();
            dragging.current = event.clientX;
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerMove={(event) => {
            if (dragging.current !== null) {
              view.current.phi += (event.clientX - dragging.current) / 160;
              dragging.current = event.clientX;
            }
          }}
          onPointerUp={() => {
            dragging.current = null;
          }}
          onPointerCancel={() => {
            dragging.current = null;
          }}
          onLostPointerCapture={() => {
            dragging.current = null;
          }}
        />
      </div>
      <div
        ref={beacon}
        className="globe-beacon"
        aria-hidden="true"
        hidden={failed}
      >
        <span />
        <span />
      </div>
      {failed && (
        <div
          className="globe-fallback"
          role="img"
          aria-label="Globe overview. Interactive rendering is unavailable."
        >
          <svg viewBox="0 0 400 400" aria-hidden="true">
            <circle cx="200" cy="200" r="175" />
            <ellipse cx="200" cy="200" rx="90" ry="175" />
            <ellipse cx="200" cy="200" rx="175" ry="70" />
            <path d="M25 200h350M200 25v350" />
          </svg>
          <span>
            {located
              ? "Location details below"
              : "No public location to pinpoint"}
          </span>
        </div>
      )}
    </div>
  );
}
