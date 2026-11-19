/** Paired T stems share one crossbar. The gap stays legible at toolbar size. */
export function TandemMark({ className = '' }: { className?: string }) {
  return <svg className={className} viewBox="0 0 96 96" fill="none" aria-hidden="true">
    <path d="M14 22h68v16H61v36H45V38H30v36H14V22Z" fill="currentColor"/>
    <path d="M68 49h14v25H68z" fill="currentColor" opacity=".48"/>
  </svg>
}
