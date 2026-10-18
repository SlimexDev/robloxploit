(() => {
  const canvas = document.querySelector('#particles');
  const context = canvas?.getContext('2d');
  if (!context) return;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const hero = document.querySelector('.hero-art');
  const scene = document.querySelector('.hero-scene');
  let width = 0, height = 0, frame = 0, last = 0;
  let pointerX = 0, pointerY = 0, pointerActive = false;
  const cards = [...document.querySelectorAll('.script-card, .detail-cover, .code-panel')];
  let particles = [];

  function resize() {
    width = innerWidth;
    height = innerHeight;
    const ratio = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    particles = Array.from({ length: width < 768 ? 28 : 64 }, () => ({
      x: Math.random() * width, y: Math.random() * height,
      depth: .2 + Math.random() * .8, phase: Math.random() * Math.PI * 2,
    }));
    for (const particle of particles) { particle.currentX = particle.x; particle.currentY = particle.y; }
    draw(0);
  }

  function draw(time) {
    context.clearRect(0, 0, width, height);
    for (const particle of particles) {
      const movement = reduced.matches ? 0 : time * .009 * particle.depth;
      let x = (particle.x + Math.sin(particle.phase + time * .00015) * (reduced.matches ? 0 : 10) + width) % width;
      let y = (particle.y - movement + height * (1 + Math.ceil(movement / height))) % height;
      if (pointerActive && !reduced.matches) {
        const distance = Math.hypot(x - pointerX, y - pointerY);
        const attraction = Math.max(0, 1 - distance / 220) * .65;
        const angle = particle.phase + time * .0003;
        const radius = 18 + (1 - particle.depth) * 105;
        x += (pointerX + Math.cos(angle) * radius - x) * attraction;
        y += (pointerY + Math.sin(angle) * radius * .7 - y) * attraction;
      }
      const easing = reduced.matches ? 1 : .045 + particle.depth * .035;
      particle.currentX += (x - particle.currentX) * easing;
      particle.currentY += (y - particle.currentY) * easing;
      context.beginPath();
      context.arc(particle.currentX, particle.currentY, .6 + particle.depth * 1.6, 0, Math.PI * 2);
      context.fillStyle = `rgba(180,154,255,${.12 + particle.depth * .3})`;
      context.fill();
    }
    function connect(x1, y1, x2, y2, range, opacity) {
      const distance = Math.hypot(x2 - x1, y2 - y1);
      if (distance >= range) return;
      context.beginPath();
      context.moveTo(x1, y1);
      context.lineTo(x2, y2);
      context.lineWidth = .7;
      context.strokeStyle = `rgba(180,154,255,${(1 - distance / range) * opacity})`;
      context.stroke();
    }
    for (let i = 0; i < particles.length; i++) {
      const particle = particles[i];
      for (let j = i + 1; j < particles.length; j++) {
        connect(particle.currentX, particle.currentY, particles[j].currentX, particles[j].currentY, 135, .2);
      }
      if (pointerActive && !reduced.matches) connect(particle.currentX, particle.currentY, pointerX, pointerY, 180, .4);
    }
  }

  function animate(time) {
    if (time - last >= 32) { draw(time); last = time; }
    frame = requestAnimationFrame(animate);
  }
  function syncMotion() {
    cancelAnimationFrame(frame);
    if (!document.hidden && !reduced.matches) frame = requestAnimationFrame(animate);
    else draw(0);
    if (reduced.matches && scene) scene.style.transform = '';
    if (reduced.matches) cards.forEach(card => { card.style.transform = ''; });
  }
  window.addEventListener('pointermove', event => {
    if (reduced.matches || event.pointerType === 'touch') return;
    pointerX = event.clientX;
    pointerY = event.clientY;
    pointerActive = true;
  }, { passive: true });
  document.documentElement.addEventListener('pointerleave', () => { pointerActive = false; });
  window.addEventListener('blur', () => { pointerActive = false; });
  for (const card of cards) {
    card.addEventListener('pointermove', event => {
      if (reduced.matches || event.pointerType === 'touch') return;
      const bounds = card.getBoundingClientRect();
      const x = Math.max(-.5, Math.min(.5, (event.clientX - bounds.left) / bounds.width - .5));
      const y = Math.max(-.5, Math.min(.5, (event.clientY - bounds.top) / bounds.height - .5));
      const subtle = card.classList.contains('code-panel');
      card.style.transform = `perspective(1100px) rotateX(${-y * (subtle ? 5 : 14)}deg) rotateY(${x * (subtle ? 7 : 18)}deg) translateY(-6px)`;
    }, { passive: true });
    card.addEventListener('pointerleave', () => { card.style.transform = ''; });
  }
  hero?.addEventListener('pointermove', event => {
    if (reduced.matches || event.pointerType === 'touch') return;
    const bounds = hero.getBoundingClientRect();
    const x = (event.clientX - bounds.left) / bounds.width - .5;
    const y = (event.clientY - bounds.top) / bounds.height - .5;
    scene.style.transform = `rotateX(${-y * 18}deg) rotateY(${x * 24}deg)`;
  }, { passive: true });
  hero?.addEventListener('pointerleave', () => { scene.style.transform = ''; });
  window.addEventListener('resize', resize, { passive: true });
  document.addEventListener('visibilitychange', syncMotion);
  reduced.addEventListener('change', syncMotion);
  resize();
  syncMotion();
})();
