"use client";
import { motion, type HTMLMotionProps } from "motion/react";

type Variant = "pink" | "cyan" | "ghost" | "lime" | "danger";

const styles: Record<Variant, string> = {
  pink: "bg-gradient-to-r from-pink to-[#ff5ee6] text-white glow-pink",
  cyan: "bg-gradient-to-r from-cyan to-[#62f0ff] text-[#05121a] glow-cyan",
  lime: "bg-lime text-[#0b1200] glow-lime",
  ghost: "glass text-ink hover:bg-surface-2",
  danger: "bg-red/15 text-red border border-red/40 hover:bg-red/25",
};

export function Button({
  variant = "pink",
  size = "md",
  className = "",
  children,
  ...props
}: HTMLMotionProps<"button"> & { variant?: Variant; size?: "sm" | "md" | "lg" | "xl" }) {
  const sz = {
    sm: "px-3 py-2 text-xs",
    md: "px-5 py-3 text-sm",
    lg: "px-7 py-4 text-base",
    xl: "px-9 py-5 text-lg sm:text-xl",
  }[size];
  return (
    <motion.button
      whileHover={props.disabled ? undefined : { scale: 1.03 }}
      whileTap={props.disabled ? undefined : { scale: 0.96 }}
      className={`font-display relative inline-flex items-center justify-center gap-2 rounded-2xl font-bold uppercase tracking-wide transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${sz} ${styles[variant]} ${className}`}
      {...props}
    >
      {children}
    </motion.button>
  );
}
