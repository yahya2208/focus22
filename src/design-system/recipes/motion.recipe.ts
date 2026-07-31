// ============================================================================
// Motion Recipes — Reusable animation presets
// ============================================================================
//
// Usage:
//   <div style={{ ...fadeIn }}>
//   <div style={{ ...slideUp }}>
//   <div style={{ ...scaleIn }}>
//
// For CSS keyframe animations, use the corresponding @keyframes names:
//   animation: 'fadeIn 200ms ease-out'
//   animation: 'slideUp 200ms ease-out'
//   animation: 'scaleIn 200ms ease-out'
//
// ============================================================================

import { motion } from '../motion';

export interface MotionRecipe {
  transition: string;
  transform?: string;
  opacity?: number;
}

export const fadeIn: MotionRecipe = {
  transition: `opacity ${motion.normal}`,
  opacity: 1,
};

export const fadeOut: MotionRecipe = {
  transition: `opacity ${motion.fast}`,
  opacity: 0,
};

export const fadeInStyle: React.CSSProperties = {
  animation: `fadeIn ${motion.normal} ease-out`,
};

export const fadeOutStyle: React.CSSProperties = {
  animation: `fadeOut ${motion.fast} ease-in`,
};

export const slideUp: MotionRecipe = {
  transition: `transform ${motion.slow}, opacity ${motion.normal}`,
  transform: 'translateY(0)',
  opacity: 1,
};

export const slideUpInitial: MotionRecipe = {
  transition: `transform ${motion.slow}, opacity ${motion.normal}`,
  transform: 'translateY(20px)',
  opacity: 0,
};

export const slideDown: MotionRecipe = {
  transition: `transform ${motion.slow}, opacity ${motion.normal}`,
  transform: 'translateY(0)',
  opacity: 1,
};

export const slideDownInitial: MotionRecipe = {
  transition: `transform ${motion.slow}, opacity ${motion.normal}`,
  transform: 'translateY(-20px)',
  opacity: 0,
};

export const scaleIn: MotionRecipe = {
  transition: `transform ${motion.bounce}, opacity ${motion.normal}`,
  transform: 'scale(1)',
  opacity: 1,
};

export const scaleInInitial: MotionRecipe = {
  transition: `transform ${motion.bounce}, opacity ${motion.normal}`,
  transform: 'scale(0.95)',
  opacity: 0,
};

export const toastMotion: React.CSSProperties = {
  animation: `slideInRight ${motion.normal} ease-out`,
};

export const dialogMotion: React.CSSProperties = {
  animation: `scaleIn ${motion.bounce}`,
};

export const dropdownMotion: React.CSSProperties = {
  animation: `slideDown ${motion.fast} ease-out`,
};

export const fadeInKeyframes = `
@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}
@keyframes fadeOut {
  from { opacity: 1; }
  to { opacity: 0; }
}
@keyframes slideUp {
  from { transform: translateY(20px); opacity: 0; }
  to { transform: translateY(0); opacity: 1; }
}
@keyframes slideDown {
  from { transform: translateY(-10px); opacity: 0; }
  to { transform: translateY(0); opacity: 1; }
}
@keyframes scaleIn {
  from { transform: scale(0.95); opacity: 0; }
  to { transform: scale(1); opacity: 1; }
}
@keyframes slideInRight {
  from { transform: translateX(100%); opacity: 0; }
  to { transform: translateX(0); opacity: 1; }
}
@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}
`;
