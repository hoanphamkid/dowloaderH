import { useEffect, useRef } from 'react';

export default function InteractiveBackground() {
  const canvasRef = useRef(null);

  useEffect(() => {
    if (!window.matchMedia) return;
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const pointer = window.matchMedia('(pointer: fine)');
    const canvas = canvasRef.current;
    const context = canvas.getContext('2d');
    if (!context) return;

    let width = 0;
    let height = 0;
    let frame = null;
    let particles = [];
    let trail = [];
    let intensity = 0;
    let hovering = false;
    const target = { x: window.innerWidth / 2, y: window.innerHeight / 3 };
    const position = { ...target };
    let previousTime = 0;

    function schedule() {
      if (frame === null && !document.hidden) frame = requestAnimationFrame(draw);
    }

    function draw(time) {
      frame = null;
      const elapsed = Math.min((time - previousTime) / 16.67 || 1, 3);
      previousTime = time;
      const enabled = !motion.matches && pointer.matches;
      const smoothing = 1 - Math.pow(0.89, elapsed);
      position.x += (target.x - position.x) * smoothing;
      position.y += (target.y - position.y) * smoothing;
      intensity += ((hovering && enabled ? 1 : 0) - intensity) * smoothing;
      context.clearRect(0, 0, width, height);

      if (intensity > 0.005 && enabled) {
        trail.unshift({ x: position.x, y: position.y, life: 1, hue: (time * 0.035) % 360 });
        trail = trail.slice(0, 18).map((dot) => ({ ...dot, life: dot.life - 0.065 * elapsed })).filter((dot) => dot.life > 0);
        for (const dot of trail) {
          const radius = 20 + dot.life * 48;
          const halo = context.createRadialGradient(dot.x, dot.y, 0, dot.x, dot.y, radius);
          halo.addColorStop(0, `hsla(${dot.hue}, 95%, 71%, ${dot.life * 0.09 * intensity})`);
          halo.addColorStop(1, `hsla(${dot.hue + 55}, 95%, 65%, 0)`);
          context.fillStyle = halo;
          context.fillRect(dot.x - radius, dot.y - radius, radius * 2, radius * 2);
        }
        const glow = context.createRadialGradient(position.x, position.y, 0, position.x, position.y, 500);
        glow.addColorStop(0, `rgba(255, 105, 193, ${0.34 * intensity})`);
        glow.addColorStop(0.16, `rgba(151, 111, 255, ${0.25 * intensity})`);
        glow.addColorStop(0.42, `rgba(59, 211, 255, ${0.15 * intensity})`);
        glow.addColorStop(0.68, `rgba(255, 190, 89, ${0.08 * intensity})`);
        glow.addColorStop(1, 'rgba(95, 55, 170, 0)');
        context.fillStyle = glow;
        context.fillRect(0, 0, width, height);

        const ringRadius = 86 + Math.sin(time * 0.004) * 8;
        context.beginPath();
        context.arc(position.x, position.y, ringRadius, 0, Math.PI * 2);
        context.strokeStyle = `rgba(201, 171, 255, ${0.2 * intensity})`;
        context.lineWidth = 1;
        context.stroke();
        context.beginPath();
        context.arc(position.x, position.y, ringRadius + 26, time * 0.002, time * 0.002 + Math.PI * 1.35);
        context.strokeStyle = `rgba(85, 211, 255, ${0.36 * intensity})`;
        context.lineWidth = 1.5;
        context.stroke();

        context.beginPath();
        context.arc(position.x, position.y, 14 + Math.sin(time * 0.009) * 4, 0, Math.PI * 2);
        context.fillStyle = `rgba(255, 255, 255, ${0.72 * intensity})`;
        context.shadowColor = '#ff8edd';
        context.shadowBlur = 18;
        context.fill();
        context.shadowBlur = 0;

        for (const particle of particles) {
          const x = particle.x + Math.sin(time * 0.00025 + particle.phase) * 12;
          const y = particle.y + Math.cos(time * 0.0002 + particle.phase) * 12;
          const distance = Math.hypot(x - position.x, y - position.y);
          const proximity = Math.max(0, 1 - distance / 220);
          context.beginPath();
          context.arc(x, y, particle.radius + proximity, 0, Math.PI * 2);
          const hue = 270 + Math.sin(particle.phase + time * 0.0004) * 85;
          context.fillStyle = `hsla(${hue}, 96%, 76%, ${(0.15 + proximity * 0.7) * intensity})`;
          context.fill();
          if (distance < 150) {
            context.beginPath();
            context.moveTo(x, y);
            context.lineTo(position.x, position.y);
            context.strokeStyle = `hsla(${285 + proximity * 120}, 90%, 74%, ${(1 - distance / 150) * 0.26 * intensity})`;
            context.lineWidth = 0.7;
            context.stroke();
          }
        }
      }
      if (enabled && (hovering || intensity > 0.005)) schedule();
    }

    function resize() {
      width = window.innerWidth;
      height = window.innerHeight;
      const ratio = Math.min(window.devicePixelRatio || 1, 1.5);
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      particles = Array.from({ length: Math.min(75, Math.ceil(width * height / 18000)) }, () => ({
        x: Math.random() * width,
        y: Math.random() * height,
        radius: 0.5 + Math.random() * 0.8,
        phase: Math.random() * Math.PI * 2,
      }));
      schedule();
    }

    function move(event) {
      if (event.pointerType === 'touch' || motion.matches || !pointer.matches) return;
      target.x = event.clientX;
      target.y = event.clientY;
      hovering = true;
      schedule();
    }
    function leave() { hovering = false; schedule(); }
    function visibility() {
      if (document.hidden) { cancelAnimationFrame(frame); frame = null; hovering = false; }
      else schedule();
    }

    resize();
    window.addEventListener('pointermove', move, { passive: true });
    document.documentElement.addEventListener('pointerleave', leave);
    window.addEventListener('blur', leave);
    window.addEventListener('resize', resize);
    document.addEventListener('visibilitychange', visibility);
    motion.addEventListener('change', schedule);
    pointer.addEventListener('change', schedule);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('pointermove', move);
      document.documentElement.removeEventListener('pointerleave', leave);
      window.removeEventListener('blur', leave);
      window.removeEventListener('resize', resize);
      document.removeEventListener('visibilitychange', visibility);
      motion.removeEventListener('change', schedule);
      pointer.removeEventListener('change', schedule);
    };
  }, []);

  return <canvas ref={canvasRef} className="interactive-background" aria-hidden="true" />;
}
