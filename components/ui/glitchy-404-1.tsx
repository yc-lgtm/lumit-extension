"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { useEffect, useRef } from "react";

const shakeVariants1 = {
  shake: {
    x: [0, -2, 2, -1, 1, 0],
    transition: {
      duration: 0.8,
      repeat: Infinity,
      repeatType: "loop" as const,
      ease: "easeInOut",
    },
  },
};

const shakeVariants2 = {
  shake: {
    x: [0, 1.5, -1.5, 2, -2, 0],
    transition: {
      duration: 1.2,
      repeat: Infinity,
      repeatType: "loop" as const,
      ease: "easeInOut",
    },
  },
};

const shakeVariants3 = {
  shake: {
    x: [0, -1, 1, -2, 2, -1, 0],
    transition: {
      duration: 0.5,
      repeat: Infinity,
      repeatType: "loop" as const,
      ease: "easeInOut",
    },
  },
};

const shakeVariants4 = {
  shake: {
    x: [0, 2, -1, 1.5, -2, 0],
    transition: {
      duration: 1.5,
      repeat: Infinity,
      repeatType: "loop" as const,
      ease: "easeInOut",
    },
  },
};

const shakeVariants5 = {
  shake: {
    x: [0, -1.5, 1, -1, 2, -2, 0],
    transition: {
      duration: 0.7,
      repeat: Infinity,
      repeatType: "loop" as const,
      ease: "easeInOut",
    },
  },
};

const getVariants = (index: number) => {
  const variants = [shakeVariants1, shakeVariants2, shakeVariants3, shakeVariants4, shakeVariants5];
  return variants[index % variants.length];
};

const getRandomDelay = () => Math.random() * 2;

const FuzzyWrapper = ({
  children,
  baseIntensity = 0.3,
  className,
}: {
  children: React.ReactNode;
  baseIntensity?: number;
  className?: string;
}) => {
  const canvasRef = useRef<HTMLCanvasElement & { cleanupFuzzy?: () => void }>(null);
  const svgContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let animationFrameId: number;
    let isCancelled = false;
    const canvas = canvasRef.current;
    const svgContainer = svgContainerRef.current;

    if (!canvas || !svgContainer) return;

    if (canvas.cleanupFuzzy) {
      canvas.cleanupFuzzy();
    }

    const init = async () => {
      if (isCancelled) return;

      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const svgElement = svgContainer.querySelector("svg");
      if (!svgElement) return;

      await new Promise((resolve) => setTimeout(resolve, 100));

      const svgRect = svgElement.getBoundingClientRect();
      const svgWidth = svgRect.width || 800;
      const svgHeight = svgRect.height || 232;

      const offscreen = document.createElement("canvas");
      const offCtx = offscreen.getContext("2d");
      if (!offCtx) return;

      offscreen.width = svgWidth;
      offscreen.height = svgHeight;

      const convertSvgToCanvas = () => {
        return new Promise<void>((resolve) => {
          const svgData = new XMLSerializer().serializeToString(svgElement);
          const img = new Image();
          const svgBlob = new Blob([svgData], {
            type: "image/svg+xml;charset=utf-8",
          });
          const url = URL.createObjectURL(svgBlob);

          img.onload = () => {
            offCtx.clearRect(0, 0, offscreen.width, offscreen.height);
            offCtx.drawImage(img, 0, 0, svgWidth, svgHeight);
            URL.revokeObjectURL(url);
            resolve();
          };

          img.src = url;
        });
      };

      const horizontalMargin = 50;
      const verticalMargin = 50;
      canvas.width = svgWidth + horizontalMargin * 2;
      canvas.height = svgHeight + verticalMargin * 2;

      const fuzzRange = 20;

      const run = async () => {
        if (isCancelled) return;

        await convertSvgToCanvas();

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.translate(horizontalMargin, verticalMargin);

        for (let j = 0; j < svgHeight; j++) {
          const dx = Math.floor(baseIntensity * (Math.random() - 0.5) * fuzzRange);
          ctx.drawImage(offscreen, 0, j, svgWidth, 1, dx, j, svgWidth, 1);
        }

        ctx.setTransform(1, 0, 0, 1, 0, 0);
        animationFrameId = window.requestAnimationFrame(run);
      };

      run();

      const cleanup = () => {
        window.cancelAnimationFrame(animationFrameId);
      };

      canvas.cleanupFuzzy = cleanup;
    };

    init();

    return () => {
      isCancelled = true;
      window.cancelAnimationFrame(animationFrameId);
      if (canvas && canvas.cleanupFuzzy) {
        canvas.cleanupFuzzy();
      }
    };
  }, [baseIntensity]);

  return (
    <div className="relative">
      <div ref={svgContainerRef} className="pointer-events-none absolute inset-0 opacity-0" style={{ zIndex: -1 }}>
        {children}
      </div>

      <canvas ref={canvasRef} className={className} style={{ display: "block" }} />
    </div>
  );
};

interface Glitchy404Props {
  width?: number;
  height?: number;
  color?: string;
}

export function Glitchy404({ width = 860, height = 232, color = "#fff" }: Glitchy404Props) {
  return (
    <FuzzyWrapper baseIntensity={0.4} className="cursor-pointer">
      <svg
        width={width}
        height={height}
        viewBox="0 0 860 232"
        xmlns="http://www.w3.org/2000/svg"
        className="cursor-pointer fill-current text-white"
      >
        <rect x="0" y="0" width="860" height="232" fill="transparent" />

        <motion.text
          x="120"
          y="160"
          fontSize="180"
          fontWeight="900"
          fontFamily="monospace"
          fill={color}
          variants={getVariants(0)}
          animate="shake"
          transition={{ delay: getRandomDelay() }}
        >
          404
        </motion.text>

        <motion.text
          x="122"
          y="158"
          fontSize="180"
          fontWeight="900"
          fontFamily="monospace"
          fill="rgba(255,0,80,0.35)"
          variants={getVariants(1)}
          animate="shake"
          transition={{ delay: getRandomDelay() }}
        >
          404
        </motion.text>

        <motion.text
          x="118"
          y="162"
          fontSize="180"
          fontWeight="900"
          fontFamily="monospace"
          fill="rgba(0,220,255,0.35)"
          variants={getVariants(2)}
          animate="shake"
          transition={{ delay: getRandomDelay() }}
        >
          404
        </motion.text>

        <motion.text
          x="240"
          y="206"
          fontSize="28"
          fontWeight="700"
          fontFamily="monospace"
          fill={color}
          variants={getVariants(3)}
          animate="shake"
          transition={{ delay: getRandomDelay() }}
        >
          NOT FOUND
        </motion.text>

        <motion.text
          x="238"
          y="206"
          fontSize="28"
          fontWeight="700"
          fontFamily="monospace"
          fill="rgba(255,0,80,0.4)"
          variants={getVariants(4)}
          animate="shake"
          transition={{ delay: getRandomDelay() }}
        >
          NOT FOUND
        </motion.text>
      </svg>
    </FuzzyWrapper>
  );
}
