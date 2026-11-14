'use client'

import { useState } from 'react'
import type { CSSProperties } from 'react'
import type { CaptionResult } from '@/lib/captions'

type CaptionedVideoPreviewProps = {
  src: string
  captions: CaptionResult
}

const fontSizes = {
  medium: 'clamp(16px, 3vw, 22px)',
  large: 'clamp(20px, 4vw, 30px)',
  'extra-large': 'clamp(24px, 5vw, 38px)',
} as const

const highlightColors = {
  lemon: '#ffe16b',
  mint: '#86f0c2',
  coral: '#ff9b83',
} as const

export default function CaptionedVideoPreview({ src, captions }: CaptionedVideoPreviewProps) {
  const [currentTime, setCurrentTime] = useState(0)
  const activeIndex = captions.captions.findIndex((caption) => currentTime >= caption.start && currentTime < caption.end)
  const activeCaption = activeIndex >= 0 ? captions.captions[activeIndex] : null
  const style = captions.style
  const panelStyle = {
    '--caption-highlight': highlightColors[style.highlightColor],
    fontSize: fontSizes[style.fontSize],
  } as CSSProperties

  return (
    <section className="video-preview-card" aria-label="Video with AI captions">
      <div className="video-frame">
        <video
          className="caption-preview-video"
          src={src}
          controls
          playsInline
          preload="metadata"
          aria-label="Preview your video with synchronized AI captions"
          onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
          onSeeked={(event) => setCurrentTime(event.currentTarget.currentTime)}
        />
        {activeCaption && (
          <div className={`caption-overlay caption-position-${style.position}`} aria-live="off">
            <div
              key={`${activeCaption.start}-${activeIndex}`}
              className={`caption-panel caption-font-${style.fontFamily} caption-color-${style.textColor} caption-background-${style.background} caption-animation-${style.animation}`}
              style={panelStyle}
            >
              {activeCaption.units.map((unit, index) => {
                const isSpeaking = currentTime >= unit.start && currentTime < unit.end
                return (
                  <span
                    key={`${unit.start}-${index}`}
                    className={`caption-word${unit.highlighted ? ' caption-word-highlighted' : ''}${isSpeaking ? ' caption-word-speaking' : ''}`}
                  >
                    {unit.text}{index < activeCaption.units.length - 1 ? ' ' : ''}
                  </span>
                )
              })}
            </div>
          </div>
        )}
      </div>
      <p className="caption-preview-note">
        {captions.timingPrecision === 'word'
          ? 'Play to preview captions synchronized to each spoken word.'
          : 'Play to preview captions synchronized to verified speech phrases.'}
      </p>
    </section>
  )
}
