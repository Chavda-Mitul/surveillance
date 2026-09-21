import { useState, useEffect } from "react"

/**
 * Hook that returns whether the viewport is at or below the given breakpoint.
 * Default breakpoint is 768px (tablet/mobile).
 */
export function useMediaQuery(breakpoint = 768): boolean {
  const [isMobile, setIsMobile] = useState(() => window.innerWidth <= breakpoint)

  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${breakpoint}px)`)
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches)
    mq.addEventListener("change", handler)
    return () => mq.removeEventListener("change", handler)
  }, [breakpoint])

  return isMobile
}