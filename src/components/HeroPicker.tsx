import { useEffect } from 'react'
import type { Hero } from '../generator/types'
import { img } from '../format'

interface Props { heroes: Hero[]; selected: number; onSelect: (id: number) => void; onClose: () => void }

export default function HeroPicker({ heroes, selected, onSelect, onClose }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = '' }
  }, [onClose])
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label="Choose a hero" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-grab" />
        <button className="icon-btn sheet-close" onClick={onClose} aria-label="Close hero picker">✕</button>
        <h2 className="sheet-title">Choose a hero</h2>
        <div className="hero-grid" role="listbox" aria-label="Heroes">
          {heroes.map((h) => (
            <button
              key={h.id} role="option" aria-selected={h.id === selected} data-hero-id={h.id}
              className={`hero-cell${h.id === selected ? ' on' : ''}`} onClick={() => onSelect(h.id)}
            >
              <img src={img(h.image_small ?? h.image)} alt="" width={56} height={56} loading="lazy" />
              <span>{h.name}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
