'use client'

import { Layers3, MoveUpRight, Sparkles } from 'lucide-react'
import type { CaptionResult, MotionTextLayer } from '@/lib/captions'

type CreativeRuntimeInspectorProps = {
  edit: CaptionResult
  currentTime: number
  onSeek: (time: number) => void
}

function layerName(layer: MotionTextLayer) {
  return layer.words.map((word) => word.text).join(' ')
}

export default function CreativeRuntimeInspector({ edit, currentTime, onSeek }: CreativeRuntimeInspectorProps) {
  const duration = Math.max(1, ...edit.layers.map((layer) => layer.end), ...edit.zooms.map((zoom) => zoom.end))
  const fonts = new Set(edit.layers.map((layer) => layer.fontFamily))
  const activeLayer = edit.layers.find((layer) => currentTime >= layer.start && currentTime < layer.end)

  return (
    <section className="creative-runtime" aria-labelledby="runtime-title">
      <div className="runtime-heading">
        <div className="runtime-title-wrap">
          <span className="runtime-mark"><Sparkles size={15} /></span>
          <div>
            <div className="runtime-kicker">VOCALAGENTS · CREATIVE RUNTIME</div>
            <h3 id="runtime-title">Scene graph</h3>
          </div>
        </div>
        <span className="runtime-live"><i /> LIVE PREVIEW</span>
      </div>
      <p className="runtime-description">GPT composes these independently styled layers. The motion engine draws this same scene graph in preview and export.</p>
      <div className="runtime-metrics" aria-label="Scene graph summary">
        <span><strong>{edit.layers.length}</strong> layers</span>
        <span><strong>{fonts.size}</strong> type systems</span>
        <span><strong>{edit.zooms.length}</strong> camera moves</span>
      </div>
      <div className="runtime-track" role="group" aria-label="Motion timeline">
        {edit.layers.map((layer, layerIndex) => {
          const left = Math.max(0, (layer.start / duration) * 100)
          const width = Math.max(1.5, ((layer.end - layer.start) / duration) * 100)
          const isActive = currentTime >= layer.start && currentTime < layer.end
          const top = (layerIndex % 3) * 8 + 3
          return (
            <button
              key={layer.id}
              type="button"
              className={`runtime-cue${isActive ? ' is-active' : ''}${layer.depth === 'behind-subject' ? ' is-behind' : ''}`}
              style={{ left: `${left}%`, top: `${top}px`, width: `${Math.min(width, 100 - left)}%` }}
              onClick={() => onSeek(layer.start)}
              aria-label={`Seek to ${layer.kind}: ${layerName(layer)} at ${layer.start.toFixed(1)} seconds`}
              title={`${layerName(layer)} · ${layer.start.toFixed(1)}s`}
            />
          )
        })}
        <span className="runtime-playhead" style={{ left: `${Math.min(100, Math.max(0, (currentTime / duration) * 100))}%` }} aria-hidden="true" />
      </div>
      <div className="runtime-layer-list" role="group" aria-label="Generated motion layers">
        {edit.layers.slice(0, 8).map((layer) => {
          const isActive = currentTime >= layer.start && currentTime < layer.end
          return (
            <button className={`runtime-layer${isActive ? ' is-active' : ''}`} key={layer.id} type="button" onClick={() => onSeek(layer.start)}>
              <span className="runtime-layer-icon"><Layers3 size={14} /></span>
              <span className="runtime-layer-copy"><strong>{layerName(layer)}</strong><small>{layer.kind} · {layer.fontFamily} · {layer.motion}</small></span>
              <span className="runtime-layer-time">{layer.start.toFixed(1)}s</span>
              <MoveUpRight className="runtime-layer-arrow" size={13} />
            </button>
          )
        })}
        {edit.layers.length > 8 && <p className="runtime-more">+ {edit.layers.length - 8} more layers in the timeline</p>}
        {activeLayer && <p className="sr-only" aria-live="polite">Now showing {layerName(activeLayer)}</p>}
      </div>
    </section>
  )
}
