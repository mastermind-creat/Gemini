import React, { useEffect, useRef } from 'react';

interface AudioPulseProps {
  volume: number; // 0 to 1
  active: boolean;
}

export const AudioPulse: React.FC<AudioPulseProps> = ({ volume, active }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationId: number;
    let currentRadius = 50;

    const render = () => {
      // Smooth interpolation
      const targetRadius = 50 + (volume * 100); 
      currentRadius += (targetRadius - currentRadius) * 0.2;

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const centerX = canvas.width / 2;
      const centerY = canvas.height / 2;

      if (active) {
        // Core
        ctx.beginPath();
        ctx.arc(centerX, centerY, 30 + (volume * 10), 0, 2 * Math.PI);
        ctx.fillStyle = '#60A5FA'; // Blue 400
        ctx.fill();

        // Outer Glow
        ctx.beginPath();
        ctx.arc(centerX, centerY, currentRadius, 0, 2 * Math.PI);
        ctx.fillStyle = `rgba(59, 130, 246, ${Math.max(0.1, 0.5 - volume)})`; // Blue 500
        ctx.fill();
        
        // Ring
        ctx.beginPath();
        ctx.arc(centerX, centerY, currentRadius + 10, 0, 2 * Math.PI);
        ctx.strokeStyle = `rgba(96, 165, 250, ${Math.max(0.1, 0.3 - volume)})`;
        ctx.lineWidth = 2;
        ctx.stroke();
      } else {
        // Idle state
        ctx.beginPath();
        ctx.arc(centerX, centerY, 10, 0, 2 * Math.PI);
        ctx.fillStyle = '#4B5563'; // Gray 600
        ctx.fill();
      }

      animationId = requestAnimationFrame(render);
    };

    render();

    return () => cancelAnimationFrame(animationId);
  }, [volume, active]);

  return (
    <canvas 
      ref={canvasRef} 
      width={300} 
      height={300} 
      className="w-full h-full max-w-[200px] max-h-[200px]"
    />
  );
};