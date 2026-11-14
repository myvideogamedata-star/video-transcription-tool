'use client'

import { useRef, useState } from 'react'
import { AudioLines, Check, Clipboard, FileVideo2, KeyRound, LoaderCircle, LockKeyhole, RotateCcw, Upload, WandSparkles } from 'lucide-react'

type TranscriptResponse = { text?: string; error?: string }

const MAX_DURATION = 120
const MAX_FILE_SIZE = 100 * 1024 * 1024

function formatTime(seconds: number) {
  const minutes = Math.floor(seconds / 60)
  const remainder = Math.floor(seconds % 60)
  return `${minutes}:${String(remainder).padStart(2, '0')}`
}

export default function Home() {
  const fileInput = useRef<HTMLInputElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [duration, setDuration] = useState<number | null>(null)
  const [apiKey, setApiKey] = useState('')
  const [transcript, setTranscript] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)

  function chooseFile(next: File | undefined) {
    if (!next) return
    setError('')
    setTranscript('')
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
      setError('We couldn’t read this video. Try an MP4 or WebM file.')
    }
    probe.src = url
  }

  async function transcribe() {
    if (!file || !apiKey.trim() || busy) return
    setError('')
    setTranscript('')
    setBusy(true)
    const video = videoRef.current
    let audioContext: AudioContext | undefined
    let recorder: MediaRecorder | undefined
    let timeout: ReturnType<typeof setTimeout> | undefined
    try {
      if (!video || !('captureStream' in video)) throw new Error('Your browser can’t capture audio from this video. Try the latest Chrome or Edge.')
      video.src = URL.createObjectURL(file)
      video.muted = false
      video.currentTime = 0
      await new Promise<void>((resolve, reject) => {
        video.onloadedmetadata = () => resolve()
        video.onerror = () => reject(new Error('Couldn’t open this video. Try an MP4 or WebM file.'))
      })
      const stream = (video as HTMLVideoElement & { captureStream: () => MediaStream }).captureStream()
      if (stream.getAudioTracks().length === 0) throw new Error('No audio track was found in this video.')
      audioContext = new AudioContext()
      const source = audioContext.createMediaStreamSource(stream)
      const destination = audioContext.createMediaStreamDestination()
      source.connect(destination)
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : 'audio/webm'
      recorder = new MediaRecorder(destination.stream, { mimeType })
      const chunks: BlobPart[] = []
      const recording = new Promise<Blob>((resolve, reject) => {
        recorder!.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data) }
        recorder!.onstop = () => resolve(new Blob(chunks, { type: 'audio/webm' }))
        recorder!.onerror = () => reject(new Error('Audio capture failed. Please try again.'))
      })
      recorder.start()
      await video.play()
      timeout = setTimeout(() => { if (recorder?.state === 'recording') recorder.stop() }, MAX_DURATION * 1000 + 2000)
      await new Promise<void>((resolve) => { video.onended = () => resolve() })
      if (recorder.state === 'recording') recorder.stop()
      const audio = await recording
      if (!audio.size) throw new Error('No audio could be captured from this video.')
      const form = new FormData()
      form.append('audio', audio, 'video-audio.webm')
      form.append('apiKey', apiKey.trim())
      const response = await fetch('/api/transcribe', { method: 'POST', body: form })
      const result = await response.json() as TranscriptResponse
      if (!response.ok) throw new Error(result.error || 'Transcription failed. Please try again.')
      setTranscript(result.text || '')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Something went wrong. Please try again.')
    } finally {
      if (timeout) clearTimeout(timeout)
      if (recorder?.state === 'recording') recorder.stop()
      video?.pause()
      if (audioContext && audioContext.state !== 'closed') await audioContext.close()
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
    setError('')
    if (fileInput.current) fileInput.current.value = ''
  }

  return (
    <main className="page-shell">
      <header className="topbar"><a className="brand" href="#" aria-label="Vocal home"><span className="brand-icon"><AudioLines size={18} strokeWidth={2.2} /></span><span>vocal</span></a><span className="topbar-note">A little clarity from every video</span></header>
      <section className="workspace" aria-labelledby="page-title">
        <div className="intro"><div className="eyebrow"><span className="eyebrow-dot" /> VIDEO TO TEXT</div><h1 id="page-title">Your video,<br className="mobile-break" /> in words.</h1><p className="intro-copy">Drop in a short video and get a clear, ready-to-use transcript. No editing timeline, no fuss.</p></div>
        <div className="steps" aria-label="Three simple steps"><span className="step active"><span>1</span> Add video</span><i /><span className="step"><span>2</span> Add your key</span><i /><span className="step"><span>3</span> Get transcript</span></div>
        <section className="form-card" aria-label="Transcribe a video">
          <div className="field-group"><div className="field-heading"><span className="number">01</span><label htmlFor="video-upload">Choose a video</label></div><p className="field-help">MP4 or WebM · up to 2 minutes</p>
            <input ref={fileInput} id="video-upload" className="visually-hidden" type="file" accept="video/*" onChange={(event) => chooseFile(event.target.files?.[0])} />
            {file ? <div className="file-row"><span className="file-icon"><FileVideo2 size={20} /></span><span className="file-name"><strong>{file.name}</strong><small>{formatTime(duration ?? 0)} · {(file.size / (1024 * 1024)).toFixed(1)} MB</small></span><button className="text-button" onClick={reset} disabled={busy} aria-label="Remove video">Remove</button></div> : <button className="upload-zone" onClick={() => fileInput.current?.click()} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); chooseFile(event.dataTransfer.files[0]) }}><span className="upload-icon"><Upload size={20} /></span><span className="upload-copy"><strong>Choose a video <span>or drop it here</span></strong><small>Nothing is uploaded until you transcribe</small></span><span className="browse-label">Browse files</span></button>}
          </div>
          <div className="divider" />
          <div className="field-group"><div className="field-heading"><span className="number">02</span><label htmlFor="api-key">Your OpenAI API key</label></div><p className="field-help">Used just for this transcription. Never saved.</p><div className="key-wrap"><KeyRound size={17} aria-hidden="true" /><input id="api-key" type="password" autoComplete="off" spellCheck={false} placeholder="sk-…" value={apiKey} onChange={(event) => setApiKey(event.target.value)} /><LockKeyhole className="key-lock" size={16} aria-hidden="true" /></div><p className="privacy-note">Your key is sent securely to OpenAI through this app and is not stored.</p></div>
          <button className="transcribe-button" onClick={transcribe} disabled={!file || !apiKey.trim() || busy}>{busy ? <><LoaderCircle className="spinner" size={18} /> Listening to your video…</> : <><WandSparkles size={18} /> Transcribe video <span>→</span></>}</button>
          <p className="time-note">Your video plays once while the audio is prepared, then OpenAI transcribes it.</p>
          {error && <p className="error-message" role="alert">{error}</p>}
        </section>
        {transcript && <section className="result-card" aria-labelledby="transcript-title"><div className="result-heading"><div><div className="result-label"><Check size={14} /> TRANSCRIPTION COMPLETE</div><h2 id="transcript-title">Your transcript</h2></div><button className="copy-button" onClick={copyTranscript}>{copied ? <Check size={16} /> : <Clipboard size={16} />}{copied ? 'Copied' : 'Copy text'}</button></div><p className="transcript-text">{transcript}</p><button className="start-over" onClick={reset}><RotateCcw size={14} /> Transcribe another video</button></section>}
        <video ref={videoRef} className="hidden-video" playsInline aria-hidden="true" />
        <footer className="page-footer"><span><LockKeyhole size={13} /> Your video isn’t saved by this app.</span><span>Powered by OpenAI speech recognition</span></footer>
      </section>
    </main>
  )
}
