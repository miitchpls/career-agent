import { useRef } from "react"
import { motion, useAnimate, useReducedMotion, type Easing } from "motion/react"

/*
 * The needle looking for north, as a magnetic one does when the compass is picked up: it
 * draws back, swings a full turn (slow, fast, slow: a bell-shaped speed), overshoots north
 * and settles in a few shrinking swings. It turns on itself; the mark stays where it is.
 */
const TURN = 360
const KEYFRAMES = [0, -32, TURN + 26, TURN - 13, TURN + 6, TURN - 2, TURN]
const TIMES = [0, 0.16, 0.56, 0.7, 0.81, 0.91, 1]
const SWING: Easing = [0.37, 0, 0.63, 1]
const EASE: Easing[] = [
  [0.33, 0, 0.67, 1], // the draw-back
  [0.65, 0, 0.35, 1], // the turn: easing in and out, the speed peaks halfway
  SWING, // then each swing back and forth
  SWING,
  SWING,
  SWING,
]

/** Compass needle: full "north" half, faded "south" half, tilted towards the top right. */
export function Logo() {
  return (
    <svg viewBox="0 0 24 24" className="size-6 overflow-visible" aria-hidden>
      <g transform="rotate(45 12 12)" fill="currentColor">
        <motion.g data-needle style={{ transformBox: "view-box", transformOrigin: "12px 12px" }}>
          <path d="M12 1.8 15.6 12H8.4Z" />
          <path d="M8.4 12h7.2L12 22.2Z" opacity=".32" />
        </motion.g>
      </g>
    </svg>
  )
}

/**
 * The hover that sets the needle spinning, for the element holding the logo: one swing at a
 * time (hovering again mid-swing doesn't restart it), none with reduced motion.
 */
export function useNeedleSpin() {
  const [scope, animate] = useAnimate<HTMLButtonElement>()
  const reduced = useReducedMotion()
  const spinning = useRef(false)
  const spin = async () => {
    if (reduced || spinning.current) return
    const needle = scope.current?.querySelector("[data-needle]")
    if (!needle) return
    spinning.current = true
    try {
      await animate(needle, { rotate: KEYFRAMES }, { duration: 1.5, times: TIMES, ease: EASE })
      await animate(needle, { rotate: 0 }, { duration: 0 }) // a full turn is where it started
    } finally {
      spinning.current = false
    }
  }
  return { ref: scope, onPointerEnter: spin, onFocus: spin }
}
