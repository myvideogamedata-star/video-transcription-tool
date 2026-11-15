'use client'

import { useState } from 'react'
import { Layers3, MoveUpRight, Sparkles, Type } from 'lucide-react'
import type { CaptionResult, MotionTextLayer, TextFont, TextMotion } from '@/lib/captions'

type CreativeRuntimeInspectorProps = {
  edit: CaptionResult
  currentTime: number
  selectedLayerId: string
  onSeek: (time: number) => void
  onSelectLayer: (id: string) => void
  onUpdateLayer: (id: string, update: (layer: MotionTextLayer) => MotionTextLayer) => void
  onUpdateZoom: (index: number, scale: number) => void
}

const looks: { name: string; fontFamily: TextFont; color: string; italic: boolean; uppercase: boolean; background: MotionTextLayer['background']; motion: TextMotion }[] = [
  { name: 'Editorial', fontFamily: 'serif', color: '#F4EBDD', italic: true, uppercase: false, background: 'none', motion: 'fade' },
  { name: 'Studio', fontFamily: 'condensed', color: '#F5D94E', italic: false, uppercase: true, background: 'marker', motion: 'rise' },
  { name: 'Signal', fontFamily: 'condensed', color: '#F13F4B', italic: false, uppercase: true, background: 'none', motion: 'pop' },
  { name: 'Subtitles', fontFamily: 'sans', color: '#FFFFFF', italic: false, uppercase: false, background: 'pill', motion: 'fade' },
]

const swatches = ['#FFF5E7', '#FF5A2A', '#111111', '#FFFFFF', '#F5D94E', '#7CC9E8']
const fonts: { value: TextFont; label: string }[] = [
  { value: 'monument', label: 'Anton display' },
  { value: 'condensed', label: 'Barlow Condensed' },
  { value: 'serif', label: 'Editorial serif' },
  { value: 'sans', label: 'Clean sans' },
  { value: 'rounded', label: 'Rounded' },
  { value: 'mono', label: 'Mono' },
]
const motions: { value: TextMotion; label: string }[] = [
  { value: 'none', label: 'Still' },
  { value: 'fade', label: 'Fade' },
  { value: 'rise', label: 'Rise' },
  { value: 'pop', label: 'Pop' },
  { value: 'slide', label: 'Slide' },
  { value: 'impact', label: 'Impact reveal' },
  { value: 'monument-rise', label: 'Monument rise' },
  { value: 'hard-cut', label: 'Hard cut' },
  { value: 'hero-expansion', label: 'Hero expansion' },
]

function layerName(layer: MotionTextLayer) {
  return layer.words.map((word) => word.text).join(' ')
}

export default function CreativeRuntimeInspector({ edit, currentTime, selectedLayerId, onSeek, onSelectLayer, onUpdateLayer, onUpdateZoom }: CreativeRuntimeInspectorProps) {
  const [selectedZoom, setSelectedZoom] = useState(0)
  const duration = Math.max(1, ...edit.layers.map((layer) => layer.end), ...edit.zooms.map((zoom) => zoom.end))
  const fontsInUse = new Set(edit.layers.map((layer) => layer.fontFamily))
  const activeLayer = edit.layers.find((layer) => currentTime >= layer.start && currentTime < layer.end)
  const selectedLayer = edit.layers.find((layer) => layer.id === selectedLayerId) ?? edit.layers[0]
  const zoom = edit.zooms[selectedZoom]

  function applyLook(look: typeof looks[number]) {
    if (!selectedLayer) return
    onUpdateLayer(selectedLayer.id, (layer) => ({
      ...layer,
      fontFamily: look.fontFamily,
      color: look.color,
      italic: look.italic,
      uppercase: look.uppercase,
      background: look.background,
      motion: look.motion,
      words: layer.words.map((word) => ({ ...word, fontFamily: look.fontFamily, color: look.color, italic: look.italic, uppercase: look.uppercase })),
    }))
  }

  function updateTypography(patch: Partial<MotionTextLayer>) {
    if (!selectedLayer) return
    onUpdateLayer(selectedLayer.id, (layer) => ({
      ...layer,
      ...patch,
      words: layer.words.map((word) => ({
        ...word,
        ...(patch.fontFamily ? { fontFamily: patch.fontFamily } : {}),
        ...(patch.fontScale ? { fontScale: patch.fontScale } : {}),
        ...(patch.color ? { color: patch.color } : {}),
        ...(patch.italic !== undefined ? { italic: patch.italic } : {}),
        ...(patch.uppercase !== undefined ? { uppercase: patch.uppercase } : {}),
      })),
    }))
  }

  function updateHeadline(text: string) {
    if (!selectedLayer || selectedLayer.kind !== 'headline') return
    const words = text.trim().split(/\s+/).filter(Boolean).slice(0, 4)
    onUpdateLayer(selectedLayer.id, (layer) => ({
      ...layer,
      words: words.map((word) => ({ text: word, start: layer.start, end: layer.end, fontFamily: layer.fontFamily, fontScale: layer.fontScale, fontWeight: layer.fontWeight, color: layer.color, italic: layer.italic, uppercase: layer.uppercase })),
    }))
  }

  return (
    <section className="creative-runtime" aria-labelledby="runtime-title">
      <div className="runtime-heading">
        <div className="runtime-title-wrap">
          <span className="runtime-mark"><Sparkles size={15} /></span>
          <div>
            <div className="runtime-kicker">VOCALAGENTS · CREATIVE RUNTIME</div>
            <h3 id="runtime-title">Edit your composition</h3>
          </div>
        </div>
        <span className="runtime-live"><i /> LIVE</span>
      </div>
      <p className="runtime-description">Select a layer to refine its look, position, motion, or depth. Changes update the preview and export together.</p>
      <div className="runtime-metrics" aria-label="Scene graph summary">
        <span><strong>{edit.layers.length}</strong> layers</span>
        <span><strong>{fontsInUse.size}</strong> type systems</span>
        <span><strong>{edit.zooms.length}</strong> camera moves</span>
      </div>

      <div className="runtime-timeline" role="group" aria-label="Video edit timeline">
        <div className="runtime-ruler" aria-hidden="true"><span>00:00</span><span>{(duration / 2).toFixed(1)}s</span><span>{duration.toFixed(1)}s</span></div>
        <div className="runtime-track" role="group" aria-label="Text layers timeline">
          {edit.layers.map((layer, layerIndex) => {
            const left = Math.max(0, (layer.start / duration) * 100)
            const width = Math.max(1.5, ((layer.end - layer.start) / duration) * 100)
            const isActive = currentTime >= layer.start && currentTime < layer.end
            return (
              <button
                key={layer.id}
                type="button"
                className={`runtime-cue${isActive ? ' is-active' : ''}${layer.depth === 'behind-subject' ? ' is-behind' : ''}${selectedLayerId === layer.id ? ' is-selected' : ''}`}
                style={{ left: `${left}%`, top: `${(layerIndex % 3) * 8 + 3}px`, width: `${Math.min(width, 100 - left)}%` }}
                onClick={() => { onSelectLayer(layer.id); onSeek(layer.start) }}
                aria-label={`Select ${layer.kind}: ${layerName(layer)} at ${layer.start.toFixed(1)} seconds`}
                title={`${layerName(layer)} · ${layer.start.toFixed(1)}s`}
              />
            )
          })}
          <span className="runtime-playhead" style={{ left: `${Math.min(100, Math.max(0, (currentTime / duration) * 100))}%` }} aria-hidden="true" />
        </div>
        <div className="runtime-zoom-track" aria-label="Camera zoom timeline">
          <span className="runtime-track-label">ZOOM</span>
          {edit.zooms.map((item, index) => {
            const left = Math.max(0, (item.start / duration) * 100)
            const width = Math.max(2, ((item.end - item.start) / duration) * 100)
            return <button key={`${item.start}-${index}`} type="button" className={`runtime-zoom-cue${selectedZoom === index ? ' is-selected' : ''}`} style={{ left: `${left}%`, width: `${Math.min(width, 100 - left)}%` }} onClick={() => { setSelectedZoom(index); onSeek(item.start) }} aria-label={`Select ${item.scale.toFixed(2)} times camera zoom at ${item.start.toFixed(1)} seconds`} />
          })}
        </div>
      </div>

      <div className="runtime-editor-grid">
        <div className="runtime-layer-list" role="group" aria-label="Generated text layers">
          <div className="runtime-section-heading"><Layers3 size={13} /> LAYERS <span>{edit.layers.length}</span></div>
          {edit.layers.map((layer) => {
            const isActive = currentTime >= layer.start && currentTime < layer.end
            return (
              <button className={`runtime-layer${isActive ? ' is-active' : ''}${selectedLayerId === layer.id ? ' is-selected' : ''}`} key={layer.id} type="button" onClick={() => { onSelectLayer(layer.id); onSeek(layer.start) }}>
                <span className="runtime-layer-icon"><Type size={14} /></span>
                <span className="runtime-layer-copy"><strong>{layerName(layer)}</strong><small>{layer.kind} · {layer.depth === 'behind-subject' ? 'behind subject' : layer.fontFamily}</small></span>
                <span className="runtime-layer-time">{layer.start.toFixed(1)}s</span>
                <MoveUpRight className="runtime-layer-arrow" size={13} />
              </button>
            )
          })}
          {activeLayer && <p className="sr-only" aria-live="polite">Now showing {layerName(activeLayer)}</p>}
        </div>

        {selectedLayer && <div className="runtime-controls" aria-label="Selected layer controls">
          <div className="runtime-section-heading"><Sparkles size={13} /> LAYER DESIGN <span>{selectedLayer.kind}</span></div>
          {selectedLayer.kind === 'headline' && <label className="runtime-field">Headline text<input aria-label="Headline text" maxLength={60} value={layerName(selectedLayer)} onChange={(event) => updateHeadline(event.target.value)} /></label>}
          {selectedLayer.kind === 'caption' && <p className="runtime-locked-copy">Verified transcript text stays exact. Adjust its style and timing in the timeline.</p>}

          <div className="runtime-look-grid" role="group" aria-label="Apply a designed text look">
            {looks.map((look) => <button key={look.name} type="button" className="runtime-look" onClick={() => applyLook(look)}><span style={{ color: look.color, fontFamily: look.fontFamily === 'serif' ? 'Georgia, serif' : look.fontFamily === 'condensed' ? 'Impact, sans-serif' : 'Arial, sans-serif' }}>Aa</span>{look.name}</button>)}
          </div>

          <div className="runtime-control-row">
            <label className="runtime-field">Type style<select aria-label="Type style" value={selectedLayer.fontFamily} onChange={(event) => updateTypography({ fontFamily: event.target.value as TextFont })}>{fonts.map((font) => <option key={font.value} value={font.value}>{font.label}</option>)}</select></label>
            <label className="runtime-field">Motion<select aria-label="Text motion" value={selectedLayer.motion} onChange={(event) => updateTypography({ motion: event.target.value as TextMotion })}>{motions.map((motion) => <option key={motion.value} value={motion.value}>{motion.label}</option>)}</select></label>
          </div>

          <div className="runtime-color-row"><span className="runtime-field-label">COLOR</span><div className="runtime-swatches" role="group" aria-label="Text color">
            {swatches.map((color) => <button key={color} type="button" className={`runtime-swatch${selectedLayer.color.toLowerCase() === color.toLowerCase() ? ' is-selected' : ''}`} style={{ backgroundColor: color }} onClick={() => updateTypography({ color })} aria-label={`Set text color ${color}`} />)}
            <label className="runtime-custom-color" title="Choose custom text color"><input aria-label="Custom text color" type="color" value={selectedLayer.color} onChange={(event) => updateTypography({ color: event.target.value })} /><span>+</span></label>
          </div></div>

          <div className="runtime-slider-grid">
            <label className="runtime-slider"><span>SIZE <output>{Math.round(selectedLayer.fontScale * 100)}%</output></span><input aria-label="Text size" type="range" min="0.035" max="0.22" step="0.005" value={selectedLayer.fontScale} onChange={(event) => updateTypography({ fontScale: Number(event.target.value) })} /></label>
            <label className="runtime-slider"><span>POSITION <output>{Math.round(selectedLayer.y * 100)}%</output></span><input aria-label="Vertical text position" type="range" min="0.08" max="0.92" step="0.01" value={selectedLayer.y} onChange={(event) => updateTypography({ y: Number(event.target.value) })} /></label>
          </div>

          <div className="runtime-control-row">
            <label className="runtime-field">Layer depth<select aria-label="Layer depth" value={selectedLayer.depth} onChange={(event) => updateTypography({ depth: event.target.value as MotionTextLayer['depth'] })}><option value="foreground">In front</option><option value="behind-subject">Behind subject</option></select></label>
            <label className="runtime-field">Text treatment<select aria-label="Text treatment" value={selectedLayer.background} onChange={(event) => updateTypography({ background: event.target.value as MotionTextLayer['background'] })}><option value="none">No block</option><option value="pill">Soft backing</option><option value="marker">Graphic marker</option></select></label>
          </div>
          {selectedLayer.depth === 'behind-subject' && <p className="runtime-depth-note">Behind-subject compositing follows the detected foreground person. If tracking is unavailable, the text stays legible in front.</p>}
        </div>}
      </div>

      {zoom && <div className="runtime-zoom-controls"><span className="runtime-field-label">CAMERA ZOOM · {zoom.start.toFixed(1)}–{zoom.end.toFixed(1)}s</span><label className="runtime-slider"><span>AMPLITUDE <output>{zoom.scale.toFixed(2)}×</output></span><input aria-label="Camera zoom strength" type="range" min="1.04" max="1.1" step="0.01" value={zoom.scale} onChange={(event) => onUpdateZoom(selectedZoom, Number(event.target.value))} /></label></div>}
      <div className="runtime-depth-key"><span><i className="runtime-key-front" /> Front layer</span><span><i className="runtime-key-behind" /> Behind-subject</span><span><i className="runtime-key-zoom" /> Camera move</span></div>
    </section>
  )
}
