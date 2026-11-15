'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Download, Pause, Play } from 'lucide-react'
import { FaceLandmarker, FilesetResolver, ImageSegmenter } from '@mediapipe/tasks-vision'
import { fetchFile, toBlobURL } from '@ffmpeg/util'
import type { CaptionResult } from '@/lib/captions'

type CaptionedVideoPreviewProps = { src: string; edit: CaptionResult }

const yellow = '#ffe22b'
const MAX_PREVIEW_WIDTH = 1280

type FFmpegInstance = {
  load(config: { classWorkerURL: string; coreURL: string; wasmURL: string }): Promise<boolean>
  writeFile(path: string, data: Uint8Array): Promise<boolean>
  exec(args: string[]): Promise<number>
  readFile(path: string): Promise<Uint8Array | string>
  deleteFile(path: string): Promise<boolean>
  terminate(): void
}

type FFmpegGlobal = { FFmpeg: new () => FFmpegInstance }

function loadFFmpegLibrary() {
  return new Promise<FFmpegGlobal['FFmpeg']>((resolve, reject) => {
    const scope = window as Window & { FFmpegWASM?: FFmpegGlobal }
    if (scope.FFmpegWASM?.FFmpeg) { resolve(scope.FFmpegWASM.FFmpeg); return }
    const script = document.createElement('script')
    script.src = 'https://cdn.jsdelivr.net/npm/@ffmpeg/ffmpeg@0.12.15/dist/umd/ffmpeg.js'
    script.onload = () => scope.FFmpegWASM?.FFmpeg ? resolve(scope.FFmpegWASM.FFmpeg) : reject(new Error('Could not load the MP4 encoder.'))
    script.onerror = () => reject(new Error('Could not load the MP4 encoder. Check your connection and try again.'))
    document.head.appendChild(script)
  })
}

function activeCue<T extends { start: number; end: number }>(cues: T[], time: number) {
  return cues.find((cue) => time >= cue.start && time < cue.end)
}

export default function CaptionedVideoPreview({ src, edit }: CaptionedVideoPreviewProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [ready, setReady] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [exportMessage, setExportMessage] = useState('')
  const [currentTime, setCurrentTime] = useState(0)
  const lastUiUpdate = useRef(0)
  const [visualStatus, setVisualStatus] = useState<'loading' | 'ready' | 'fallback'>('loading')
  const foregroundRef = useRef<HTMLCanvasElement | null>(null)
  const faceBoxRef = useRef<{ x: number; y: number; width: number; height: number } | null>(null)
  const lastSegmentAt = useRef(0)
  const lastSegmentVideoTime = useRef(-1)

  const togglePlayback = useCallback(() => {
    const video = videoRef.current
    if (!video) return
    if (video.paused) void video.play()
    else video.pause()
  }, [])

  useEffect(() => {
    let cancelled = false
    let frame = 0
    let segmentBusy = false
    let segmenter: ImageSegmenter | null = null
    let faceLandmarker: FaceLandmarker | null = null
    const segmentationFrame = document.createElement('canvas')
    const video = videoRef.current
    const canvas = canvasRef.current
    const context = canvas?.getContext('2d')
    if (!video || !canvas || !context) return

    const loadVision = async () => {
      try {
        const vision = await FilesetResolver.forVisionTasks('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.2.3/wasm')
        const [nextSegmenter, nextFace] = await Promise.all([
          ImageSegmenter.createFromOptions(vision, {
            baseOptions: { modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/1/selfie_segmenter.tflite' },
            runningMode: 'VIDEO',
            outputConfidenceMasks: true,
          }),
          FaceLandmarker.createFromOptions(vision, {
            baseOptions: { modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task' },
            runningMode: 'VIDEO',
            numFaces: 1,
          }),
        ])
        if (cancelled) { nextSegmenter.close(); nextFace.close(); return }
        segmenter = nextSegmenter
        faceLandmarker = nextFace
        setVisualStatus('ready')
      } catch {
        setVisualStatus('fallback')
      }
    }
    void loadVision()

    const draw = (now: number) => {
      frame = requestAnimationFrame(draw)
      if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || !video.videoWidth || !video.videoHeight) return
      const scale = Math.min(1, MAX_PREVIEW_WIDTH / video.videoWidth)
      const width = Math.max(1, Math.round(video.videoWidth * scale))
      const height = Math.max(1, Math.round(video.videoHeight * scale))
      if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height }
      const time = video.currentTime
      const zoom = activeCue(edit.zooms, time)
      const face = faceBoxRef.current
      const pivotX = face ? (face.x + face.width / 2) * width : width / 2
      const pivotY = face ? (face.y + face.height / 2) * height : height / 2
      const easedScale = zoom ? 1 + (zoom.scale - 1) * Math.min(1, (time - zoom.start) / 0.2, (zoom.end - time) / 0.25) : 1
      context.save()
      context.translate(pivotX, pivotY)
      context.scale(Math.max(1, easedScale), Math.max(1, easedScale))
      context.translate(-pivotX, -pivotY)
      context.drawImage(video, 0, 0, width, height)
      context.restore()

      if (segmenter && faceLandmarker && (!video.paused || time !== lastSegmentVideoTime.current) && !segmentBusy && now - lastSegmentAt.current > 110) {
        segmentBusy = true
        lastSegmentAt.current = now
        lastSegmentVideoTime.current = time
        try {
          const timestamp = Math.max(0, Math.round(now))
          if (segmentationFrame.width !== video.videoWidth || segmentationFrame.height !== video.videoHeight) {
            segmentationFrame.width = video.videoWidth
            segmentationFrame.height = video.videoHeight
          }
          segmentationFrame.getContext('2d')?.drawImage(video, 0, 0, segmentationFrame.width, segmentationFrame.height)
          const faceResult = faceLandmarker.detectForVideo(segmentationFrame, timestamp)
          const landmarks = faceResult.faceLandmarks[0]
          if (landmarks?.length) {
            const xs = landmarks.map((point) => point.x), ys = landmarks.map((point) => point.y)
            const x = Math.min(...xs), y = Math.min(...ys)
            const nextFace = { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y }
            const previousFace = faceBoxRef.current
            faceBoxRef.current = previousFace ? {
              x: previousFace.x + (nextFace.x - previousFace.x) * 0.38,
              y: previousFace.y + (nextFace.y - previousFace.y) * 0.38,
              width: previousFace.width + (nextFace.width - previousFace.width) * 0.38,
              height: previousFace.height + (nextFace.height - previousFace.height) * 0.38,
            } : nextFace
          }
          segmenter.segmentForVideo(segmentationFrame, timestamp, (result) => {
            const mask = result.confidenceMasks?.[0]
            if (!mask) { foregroundRef.current = null; segmentBusy = false; return }
            const maskWidth = mask.width, maskHeight = mask.height
            const values = mask.getAsFloat32Array()
            const maskCanvas = document.createElement('canvas')
            maskCanvas.width = maskWidth; maskCanvas.height = maskHeight
            const maskContext = maskCanvas.getContext('2d')
            if (maskContext) {
              const pixels = maskContext.createImageData(maskWidth, maskHeight)
              let foreground = 0
              for (let i = 0; i < values.length; i++) {
                const alpha = Math.max(0, Math.min(255, Math.round((values[i] - 0.38) * 410)))
                pixels.data[i * 4] = 255; pixels.data[i * 4 + 1] = 255; pixels.data[i * 4 + 2] = 255; pixels.data[i * 4 + 3] = alpha
                if (alpha > 128) foreground++
              }
              if (foreground / values.length > 0.035 && foreground / values.length < 0.88) {
                maskContext.putImageData(pixels, 0, 0)
                const subject = document.createElement('canvas')
                subject.width = width; subject.height = height
                const subjectContext = subject.getContext('2d')
                if (subjectContext) {
                  subjectContext.drawImage(segmentationFrame, 0, 0, width, height)
                  subjectContext.globalCompositeOperation = 'destination-in'
                  subjectContext.drawImage(maskCanvas, 0, 0, width, height)
                  foregroundRef.current = subject
                }
              } else foregroundRef.current = null
            }
            mask.close()
            segmentBusy = false
          })
        } catch {
          segmentBusy = false
          foregroundRef.current = null
        }
      }

      const headline = activeCue(edit.headlines, time)
      const caption = activeCue(edit.captions, time)
      const maskAvailable = Boolean(foregroundRef.current)
      const headlineBehind = Boolean(maskAvailable && headline?.placement === 'behind-subject')
      const captionBehind = Boolean(maskAvailable && caption?.placement === 'behind-subject')

      if (headline) {
        const size = Math.max(28, Math.min(width * 0.14, height * 0.19))
        const faceY = face ? face.y * height : height * 0.3
        const aboveHeadY = faceY - size * 0.78
        const hasRoomAboveHead = aboveHeadY >= size * 0.68 + height * 0.035
        const y = headline.placement === 'behind-subject' && maskAvailable
          ? height * 0.54
          : headline.placement === 'above-head' && face && hasRoomAboveHead ? aboveHeadY : height * 0.21
        context.font = `1000 ${size}px Impact, Haettenschweiler, "Arial Narrow Bold", sans-serif`
        const headlineWidth = Math.min(width * 0.9, context.measureText(headline.text.toUpperCase()).width)
        const headlineTop = y - size * 0.62
        const headlineBottom = y + size * 0.62
        const faceLeft = face ? (face.x - 0.035) * width : 0
        const faceRight = face ? (face.x + face.width + 0.035) * width : 0
        const faceTop = face ? (face.y - 0.025) * height : 0
        const faceBottom = face ? (face.y + face.height + 0.025) * height : 0
        const overlapsFace = Boolean(face && headlineTop < faceBottom && headlineBottom > faceTop && width / 2 - headlineWidth / 2 < faceRight && width / 2 + headlineWidth / 2 > faceLeft)
        if (headlineBehind || !overlapsFace) {
          const intro = Math.min(1, (time - headline.start) / 0.18)
          context.save()
          context.globalAlpha = intro
          context.translate(width / 2, y - (1 - intro) * 16)
          context.scale(0.94 + intro * 0.06, 0.94 + intro * 0.06)
          context.textAlign = 'center'
          context.textBaseline = 'middle'
          context.font = `1000 ${size}px Impact, Haettenschweiler, "Arial Narrow Bold", sans-serif`
          context.lineJoin = 'round'
          context.lineWidth = Math.max(2, size * 0.035)
          context.strokeStyle = 'rgba(20, 12, 4, .48)'
          context.shadowColor = 'rgba(0, 0, 0, .5)'
          context.shadowBlur = size * 0.17
          context.shadowOffsetY = size * 0.08
          context.strokeText(headline.text.toUpperCase(), 0, 0, width * 0.9)
          context.fillStyle = headlineBehind ? yellow : '#fff'
          context.fillText(headline.text.toUpperCase(), 0, 0, width * 0.9)
          context.restore()
        }
      }

      if (caption) {
        const activeWord = Math.max(0, caption.words.findIndex((word) => time >= word.start && time < word.end))
        const behind = caption.placement === 'behind-subject' && maskAvailable
        const editorial = caption.style === 'editorial'
        const baseSize = Math.max(26, Math.min(width * (behind ? 0.105 : 0.084), height * 0.15))
        const maxLineWidth = width * 0.9
        const faceY = face ? face.y * height : height * 0.3
        const aboveHeadY = faceY - baseSize * 0.9
        const hasRoomAboveHead = aboveHeadY >= baseSize * 0.8 + height * 0.035
        const y = behind
          ? height * 0.56
          : caption.placement === 'above-head' && face && hasRoomAboveHead ? aboveHeadY : caption.placement === 'upper' ? height * 0.2 : height * 0.78
        const words = caption.words.map((word, index) => {
          const active = index === activeWord
          const scale = caption.style === 'impact'
            ? active ? 1.28 : 1
            : editorial ? active ? 1.16 : 0.88
              : active ? 1.22 : 0.78
          const fontSize = baseSize * scale
          const family = editorial && active ? 'Georgia, "Times New Roman", serif' : 'Impact, Haettenschweiler, "Arial Narrow Bold", sans-serif'
          context.font = `${editorial && active ? 'italic 700' : '1000'} ${fontSize}px ${family}`
          return { text: editorial && active ? word.text : word.text.toUpperCase(), active, fontSize, family, width: context.measureText(editorial && active ? word.text : word.text.toUpperCase()).width, kineticOffset: caption.style === 'kinetic' ? Math.sin(index * 1.7) * baseSize * 0.12 : 0 }
        })
        const gap = baseSize * 0.2
        const totalWidth = words.reduce((sum, word) => sum + word.width, 0) + gap * Math.max(0, words.length - 1)
        const fit = Math.min(1, maxLineWidth / totalWidth)
        const intro = Math.min(1, (time - caption.start) / 0.12)
        let x = (width - totalWidth * fit) / 2
        context.save()
        context.globalAlpha = intro * (behind ? 0.96 : 1)
        context.textAlign = 'left'
        context.textBaseline = 'middle'
        context.lineJoin = 'round'
        context.shadowColor = 'rgba(0, 0, 0, .5)'
        context.shadowBlur = baseSize * 0.16
        context.shadowOffsetY = baseSize * 0.06
        for (const word of words) {
          const wordWidth = word.width * fit
          const pop = word.active ? 1 + Math.sin(Math.min(1, (time - caption.words[activeWord].start) / 0.12) * Math.PI) * 0.08 : 1
          const centerX = x + wordWidth / 2
          context.save()
          context.translate(centerX, y + word.kineticOffset - (1 - intro) * 12)
          context.scale(fit * pop, fit * pop)
          context.font = `${word.active && editorial ? 'italic 700' : '1000'} ${word.fontSize}px ${word.family}`
          context.strokeStyle = 'rgba(18, 18, 16, .72)'
          context.lineWidth = Math.max(2, word.fontSize * 0.075)
          context.strokeText(word.text, -word.width / 2, 0)
          context.fillStyle = word.active ? yellow : '#fff'
          context.fillText(word.text, -word.width / 2, 0)
          context.restore()
          x += (wordWidth + gap * fit)
        }
        context.restore()
      }

      if ((headlineBehind || captionBehind) && foregroundRef.current) {
        context.save()
        context.translate(pivotX, pivotY)
        context.scale(Math.max(1, easedScale), Math.max(1, easedScale))
        context.translate(-pivotX, -pivotY)
        context.drawImage(foregroundRef.current, 0, 0, width, height)
        context.restore()
      }

      if (now - lastUiUpdate.current > 120) {
        lastUiUpdate.current = now
        setCurrentTime(time)
      }
    }

    const onMetadata = () => setReady(true)
    const onPlay = () => setPlaying(true)
    const onPause = () => setPlaying(false)
    video.addEventListener('loadedmetadata', onMetadata)
    video.addEventListener('play', onPlay)
    video.addEventListener('pause', onPause)
    video.addEventListener('ended', onPause)
    if (video.readyState >= HTMLMediaElement.HAVE_METADATA) onMetadata()
    frame = requestAnimationFrame(draw)
    return () => {
      cancelled = true
      cancelAnimationFrame(frame)
      video.removeEventListener('loadedmetadata', onMetadata)
      video.removeEventListener('play', onPlay)
      video.removeEventListener('pause', onPause)
      video.removeEventListener('ended', onPause)
      segmenter?.close()
      faceLandmarker?.close()
    }
  }, [edit])

  async function exportVideo() {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas || exporting) return
    if (!canvas.captureStream || typeof MediaRecorder === 'undefined') {
      setExportMessage('Video export is not supported in this browser. Try the latest Chrome or Edge.')
      return
    }
    setExporting(true)
    setExportMessage('Rendering your edited video…')
    const previousTime = video.currentTime
    const wasPlaying = !video.paused
    let ffmpeg: FFmpegInstance | null = null
    try {
      video.pause()
      if (video.currentTime !== 0) {
        video.currentTime = 0
        await new Promise<void>((resolve) => video.addEventListener('seeked', () => resolve(), { once: true }))
      }
      const stream = canvas.captureStream(30)
      const videoStream = (video as HTMLVideoElement & { captureStream?: () => MediaStream }).captureStream?.()
      if (!videoStream?.getAudioTracks().length) throw new Error('This browser cannot include the video audio in an export. Try the latest Chrome or Edge.')
      videoStream.getAudioTracks().forEach((track) => stream.addTrack(track))
      const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus') ? 'video/webm;codecs=vp9,opus' : 'video/webm'
      const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 4_000_000 })
      const chunks: BlobPart[] = []
      const finished = new Promise<Blob>((resolve, reject) => {
        recorder.addEventListener('dataavailable', (event) => { if (event.data.size) chunks.push(event.data) })
        recorder.addEventListener('stop', () => resolve(new Blob(chunks, { type: mimeType })), { once: true })
        recorder.addEventListener('error', () => reject(new Error('The video render failed. Please try again.')), { once: true })
      })
      recorder.start(250)
      await video.play()
      await new Promise<void>((resolve) => video.addEventListener('ended', () => resolve(), { once: true }))
      recorder.stop()
      const webm = await finished
      setExportMessage('Converting your edit to MP4…')
      const FFmpeg = await loadFFmpegLibrary()
      ffmpeg = new FFmpeg()
      const coreBase = 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/umd'
      const workerUrl = `${window.location.origin}/ffmpeg/worker.js`
      await ffmpeg.load({
        classWorkerURL: workerUrl,
        coreURL: await toBlobURL(`${coreBase}/ffmpeg-core.js`, 'text/javascript'),
        wasmURL: await toBlobURL(`${coreBase}/ffmpeg-core.wasm`, 'application/wasm'),
      })
      await ffmpeg.writeFile('edit.webm', await fetchFile(webm))
      const conversion = await ffmpeg.exec(['-i', 'edit.webm', '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '23', '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', 'edit.mp4'])
      if (conversion !== 0) throw new Error('MP4 conversion failed. Please try exporting again in Chrome or Edge.')
      const mp4Data = await ffmpeg.readFile('edit.mp4')
      const mp4 = new Blob([mp4Data as Uint8Array<ArrayBuffer>], { type: 'video/mp4' })
      await ffmpeg.deleteFile('edit.webm')
      await ffmpeg.deleteFile('edit.mp4')
      const link = document.createElement('a')
      link.href = URL.createObjectURL(mp4)
      link.download = 'vocal-ai-edit.mp4'
      link.click()
      setTimeout(() => URL.revokeObjectURL(link.href), 60_000)
      setExportMessage('MP4 export downloaded.')
    } catch (error) {
      setExportMessage(error instanceof Error ? error.message : 'Could not export this video.')
    } finally {
      ffmpeg?.terminate()
      video.pause()
      video.currentTime = Math.min(previousTime, video.duration || previousTime)
      if (wasPlaying) void video.play()
      setExporting(false)
    }
  }

  const activeHeadline = activeCue(edit.headlines, currentTime)
  const activeCaption = activeCue(edit.captions, currentTime)
  const activeSpokenWord = activeCaption?.words.find((word) => currentTime >= word.start && currentTime < word.end)

  return (
    <section className="video-preview-card" aria-label="AI-edited video preview">
      <div className="video-frame" style={ready ? { aspectRatio: `${videoRef.current?.videoWidth || 16} / ${videoRef.current?.videoHeight || 9}` } : undefined}>
        <video ref={videoRef} className="caption-preview-video" src={src} playsInline preload="metadata" aria-label="Source video for the AI edit" />
        <canvas ref={canvasRef} className="creator-render-canvas" aria-label="Rendered AI-edited video" />
        <div className="render-controls">
          <button type="button" className="render-control" onClick={togglePlayback} aria-label={playing ? 'Pause edited video' : 'Play edited video'}>
            {playing ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" />}
          </button>
          <input aria-label="Video playback position" type="range" min="0" max={videoRef.current?.duration || 1} step="0.05" value={currentTime} onChange={(event) => { if (videoRef.current) videoRef.current.currentTime = Number(event.target.value) }} />
          <span>{Math.floor(currentTime / 60)}:{String(Math.floor(currentTime % 60)).padStart(2, '0')}</span>
        </div>
      </div>
      <div className="preview-footer">
        <span className={`vision-status vision-status-${visualStatus}`}><i />{visualStatus === 'ready' ? 'Subject tracking active' : visualStatus === 'loading' ? 'Loading subject tracking…' : 'Using clean text placement'}</span>
        <button type="button" className="export-button" onClick={exportVideo} disabled={!ready || exporting}><Download size={15} />{exporting ? 'Rendering…' : 'Download video'}</button>
      </div>
      {activeSpokenWord && <p className="sr-only" aria-live="polite">Caption: {activeSpokenWord.text}</p>}
      {activeHeadline && <p className="sr-only" aria-live="polite">Headline: {activeHeadline.text}</p>}
      <p className="caption-preview-note">Every spoken word appears in animated, speech-synced caption bursts. The AI chooses the typography, movement, and subject-aware placement.</p>
      {exportMessage && <p className="export-message" role="status">{exportMessage}</p>}
    </section>
  )
}
