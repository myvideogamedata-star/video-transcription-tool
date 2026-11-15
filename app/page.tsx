'use client'

import { useEffect, useRef, useState } from 'react'
import { AudioLines, Check, Clipboard, FileVideo2, LoaderCircle, LockKeyhole, RotateCcw, Upload, WandSparkles } from 'lucide-react'
import CaptionedVideoPreview from '@/components/captioned-video-preview'
import type { CaptionResult, CaptionUnit } from '@/lib/captions'
import { analyzeVideoFrames } from '@/lib/video-analysis'

type TranscriptResponse = { text?: string; units?: CaptionUnit[]; error?: string }
type EditResponse = CaptionResult & { error?: string }

const MAX_DURATION = 120
const MAX_FILE_SIZE = 100 * 1024 * 1024

function formatTime(seconds: number) {
  const minutes = Math.floor(seconds / 60)
  const remainder = Math.floor(seconds % 60)
  return `${minutes}:${String(remainder).padStart(2, '0')}`
}

function waitForVideoEvent(video: HTMLVideoElement, event: 'loadedmetadata' | 'canplay') {
  return new Promise<void>((resolve, reject) => {
    video.addEventListener(event, () => resolve(), { once: true })
    video.addEventListener('error', () => reject(new Error('Couldn’t open this video. Try an MP4 or WebM file.')), { once: true })
  })
}

export default function Home() {
  const fileInput = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [duration, setDuration] = useState<number | null>(null)
  const [transcript, setTranscript] = useState('')
  const [units, setUnits] = useState<CaptionUnit[]>([])
  const [editResult, setCaptionResult] = useState<CaptionResult | null>(null)
  const [videoUrl, setVideoUrl] = useState('')
  const [stage, setStage] = useState<'transcribing' | 'analyzing' | 'designing' | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!file) {
      setVideoUrl('')
      return
    }
    const url = URL.createObjectURL(file)
    setVideoUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [file])

  function chooseFile(next: File | undefined) {
    if (!next) return
    setError('')
    setTranscript('')
    setUnits([])
    setCaptionResult(null)
    setFile(null)
    setDuration(null)
    if (!next.type.startsWith('video/')) {
      setError('Choose a video file to get started.')
      return
    }
    if (next.size > MAX_FILE_SIZE) {
      setError('This video is too large. Please choose a file under 100 MB.')
      return
    }
    const url = URL.createObjectURL(next)
    const probe = document.createElement('video')
    probe.preload = 'metadata'
    probe.onloadedmetadata = () => {
      URL.revokeObjectURL(url)
      if (!Number.isFinite(probe.duration) || probe.duration > MAX_DURATION) {
        setFile(null)
        setDuration(null)
        if (fileInput.current) fileInput.current.value = ''
        setError('This video is longer than 2 minutes. Please choose a shorter clip.')
        return
      }
      setFile(next)
      setDuration(probe.duration)
    }
    probe.onerror = () => {
      URL.revokeObjectURL(url)
      setFile(null)
      setDuration(null)
      setError('We couldn’t read this video. Try an MP4 or WebM file.')
    }
    probe.src = url
  }

  async function generateAICaptions() {
    if (!file || busy) return
    setError('')
    setBusy(true)

    let nextTranscript = transcript
    let nextUnits = units
    let video: HTMLVideoElement | undefined
    let audioUrl: string | undefined
    let audioContext: AudioContext | undefined
    let recorder: MediaRecorder | undefined
    let stopTimer: ReturnType<typeof setTimeout> | undefined

    try {
      if (!nextTranscript || !nextUnits.length) {
        setStage('transcribing')
        video = document.createElement('video')
        audioUrl = URL.createObjectURL(file)
        if (!('captureStream' in video)) throw new Error('Audio capture isn’t supported in this browser. Try the latest Chrome or Edge.')
        video.className = 'hidden-video'
        video.preload = 'auto'
        video.playsInline = true
        document.body.appendChild(video)
        const metadataReady = waitForVideoEvent(video, 'loadedmetadata')
        const playbackReady = waitForVideoEvent(video, 'canplay')
        video.src = audioUrl
        await Promise.all([metadataReady, playbackReady])

        const stream = (video as HTMLVideoElement & { captureStream: () => MediaStream }).captureStream()
        if (stream.getAudioTracks().length === 0) throw new Error('No audio track was found in this video.')

        audioContext = new AudioContext()
        await audioContext.resume()
        const source = audioContext.createMediaStreamSource(stream)
        const destination = audioContext.createMediaStreamDestination()
        source.connect(destination)

        const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : 'audio/webm'
        recorder = new MediaRecorder(destination.stream, { mimeType })
        const chunks: BlobPart[] = []
        const recording = new Promise<Blob>((resolve, reject) => {
          recorder!.addEventListener('dataavailable', (event) => { if (event.data.size) chunks.push(event.data) })
          recorder!.addEventListener('stop', () => resolve(new Blob(chunks, { type: 'audio/webm' })), { once: true })
          recorder!.addEventListener('error', () => reject(new Error('Audio capture failed. Please try again.')), { once: true })
        })
        const playback = new Promise<void>((resolve, reject) => {
          video!.addEventListener('ended', () => resolve(), { once: true })
          video!.addEventListener('error', () => reject(new Error('Video playback stopped unexpectedly. Please try again.')), { once: true })
          stopTimer = setTimeout(() => reject(new Error('Video playback took too long. Please try again.')), (duration ?? MAX_DURATION) * 1000 + 15_000)
        })

        recorder.start()
        await video.play()
        await playback
        if (recorder.state === 'recording') recorder.stop()
        const audio = await recording
        if (!audio.size) throw new Error('No audio could be captured from this video.')

        const form = new FormData()
        form.append('audio', audio, 'video-audio.webm')
        const response = await fetch('/api/transcribe', { method: 'POST', body: form })
        const result = await response.json() as TranscriptResponse
        if (!response.ok) throw new Error(result.error || 'Transcription failed. Please try again.')
        if (!result.text?.trim()) throw new Error('No speech was detected in this video.')
        nextTranscript = result.text
        nextUnits = result.units ?? []
        setTranscript(nextTranscript)
        setUnits(nextUnits)
      }

      if (!nextUnits.length) throw new Error('OpenAI did not return verified speech timings. Please try again.')
      setStage('analyzing')
      const visualFrames = await analyzeVideoFrames(file)
      setStage('designing')
      const response = await fetch('/api/captions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcript: nextTranscript, units: nextUnits, duration, visualFrames }),
      })
      const result = await response.json() as EditResponse
      if (!response.ok) throw new Error(result.error || 'AI caption generation failed. Please try again.')
      setCaptionResult(result)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Something went wrong. Please try again.')
    } finally {
      if (stopTimer) clearTimeout(stopTimer)
      if (recorder?.state === 'recording') recorder.stop()
      if (video) {
        video.pause()
        video.src = ''
        video.remove()
      }
      if (audioUrl) URL.revokeObjectURL(audioUrl)
      if (audioContext && audioContext.state !== 'closed') await audioContext.close()
      setStage(null)
      setBusy(false)
    }
  }

  async function copyTranscript() {
    await navigator.clipboard.writeText(transcript)
    setCopied(true)
    setTimeout(() => setCopied(false), 1800)
  }

  function reset() {
    setFile(null)
    setDuration(null)
    setTranscript('')
    setUnits([])
    setCaptionResult(null)
    setError('')
    if (fileInput.current) fileInput.current.value = ''
  }

  return (
    <main className="page-shell">
      <header className="topbar"><a className="brand" href="#" aria-label="Vocal home"><span className="brand-icon"><AudioLines size={18} strokeWidth={2.2} /></span><span>vocal</span></a><span className="topbar-note">A little clarity from every video</span></header>
      <section className="workspace" aria-labelledby="page-title">
        <div className="intro"><div className="eyebrow"><span className="eyebrow-dot" /> AI VIDEO EDITOR</div><h1 id="page-title">Your video,<br className="mobile-break" /> in motion.</h1><p className="intro-copy">VocalAgents Creative Runtime gives GPT-6.1 Sol a flexible motion-graphics toolkit to compose each moment. Your transcript and video guide the design; the motion engine brings it to life.</p></div>
        <div className="steps" aria-label="Two simple steps"><span className="step active"><span>1</span> Add video</span><i /><span className="step"><span>2</span> Create motion graphics</span></div>
        <section className="form-card" aria-label="Generate AI video edit">
          <div className="field-group"><div className="field-heading"><span className="number">01</span><label htmlFor="video-upload">Choose a video</label></div><p className="field-help">MP4 or WebM · up to 2 minutes</p>
            <input ref={fileInput} id="video-upload" className="visually-hidden" type="file" accept="video/*" onChange={(event) => chooseFile(event.target.files?.[0])} />
            {file ? <div className="file-row"><span className="file-icon"><FileVideo2 size={20} /></span><span className="file-name"><strong>{file.name}</strong><small>{formatTime(duration ?? 0)} · {(file.size / (1024 * 1024)).toFixed(1)} MB</small></span><button className="text-button" onClick={reset} disabled={busy} aria-label="Choose a different video">Change</button></div> : <button className="upload-zone" onClick={() => fileInput.current?.click()} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); chooseFile(event.dataTransfer.files[0]) }}><span className="upload-icon"><Upload size={20} /></span><span className="upload-copy"><strong>Choose a video <span>or drop it here</span></strong><small>Nothing is processed until you generate the edit</small></span><span className="browse-label">Browse files</span></button>}
          </div>
          <div className="divider" />
          <div className="field-group"><div className="field-heading"><span className="number">02</span><span className="step-title">Creative Runtime</span></div><p className="field-help">GPT builds the first cut; then refine every layer, type style, color, depth, and camera move.</p><p className="privacy-note"><LockKeyhole size={14} aria-hidden="true" /> Verified speech timing and sampled video frames guide the composition.</p></div>
          <button className="transcribe-button" onClick={generateAICaptions} disabled={!file || busy || Boolean(editResult)}>{busy ? <><LoaderCircle className="spinner" size={18} /> {stage === 'transcribing' ? 'Transcribing your video…' : stage === 'analyzing' ? 'Reading the video composition…' : 'Directing the Creative Runtime…'}</> : editResult ? <><Check size={18} /> Edit ready</> : <><WandSparkles size={18} /> Generate AI Edit <span>→</span></>}</button>
          <p className="time-note">The transcript provides exact words and timing. GPT directs; the motion engine renders.</p>
          {error && <p className="error-message" role="alert">{error}</p>}
        </section>
        {editResult && videoUrl && <section className="caption-result" aria-labelledby="caption-result-title"><div className="caption-result-heading"><div className="result-label"><Check size={14} /> SCENE GRAPH COMPOSED</div><h2 id="caption-result-title">Your video, in motion</h2><p>GPT directs the composition. VocalAgents Motion Engine renders every layer, frame by frame.</p></div><CaptionedVideoPreview src={videoUrl} edit={editResult} /></section>}
        {transcript && <section className="result-card" aria-labelledby="transcript-title"><div className="result-heading"><div><div className="result-label"><Check size={14} /> TRANSCRIPTION COMPLETE</div><h2 id="transcript-title">Your transcript</h2></div><button className="copy-button" onClick={copyTranscript}>{copied ? <Check size={16} /> : <Clipboard size={16} />}{copied ? 'Copied' : 'Copy text'}</button></div><p className="transcript-text">{transcript}</p><button className="start-over" onClick={reset}><RotateCcw size={14} /> Transcribe another video</button></section>}
        <footer className="page-footer"><span><LockKeyhole size={13} /> Your video isn’t saved by this app.</span><span>Transcription and edit direction by OpenAI</span></footer>
      </section>
    </main>
  )
}
