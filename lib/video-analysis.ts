'use client'

import { FaceLandmarker, FilesetResolver, ImageSegmenter } from '@mediapipe/tasks-vision'
import type { VisualFrameSchema } from '@/lib/captions'
import { z } from 'zod'

export type VisualFrame = z.infer<typeof VisualFrameSchema>

function seek(video: HTMLVideoElement, time: number) {
  return new Promise<void>((resolve, reject) => {
    const onSeeked = () => { cleanup(); resolve() }
    const onError = () => { cleanup(); reject(new Error('Could not analyze this video frame.')) }
    const cleanup = () => {
      video.removeEventListener('seeked', onSeeked)
      video.removeEventListener('error', onError)
    }
    video.addEventListener('seeked', onSeeked, { once: true })
    video.addEventListener('error', onError, { once: true })
    video.currentTime = time
  })
}

export async function analyzeVideoFrames(file: File): Promise<VisualFrame[]> {
  const url = URL.createObjectURL(file)
  const video = document.createElement('video')
  video.muted = true
  video.playsInline = true
  video.preload = 'auto'
  video.src = url

  try {
    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve()
      video.onerror = () => reject(new Error('Could not read the video for visual analysis.'))
    })

    const vision = await FilesetResolver.forVisionTasks('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.2.3/wasm')
    const [segmenter, faceLandmarker] = await Promise.all([
      ImageSegmenter.createFromOptions(vision, {
        baseOptions: { modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/1/selfie_segmenter.tflite' },
        runningMode: 'IMAGE',
        outputConfidenceMasks: true,
      }),
      FaceLandmarker.createFromOptions(vision, {
        baseOptions: { modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task' },
        runningMode: 'IMAGE',
        numFaces: 1,
      }),
    ])

    const canvas = document.createElement('canvas')
    const maxDimension = 384
    const scale = Math.min(1, maxDimension / Math.max(video.videoWidth, video.videoHeight))
    canvas.width = Math.max(1, Math.round(video.videoWidth * scale))
    canvas.height = Math.max(1, Math.round(video.videoHeight * scale))
    const context = canvas.getContext('2d', { willReadFrequently: true })
    if (!context) throw new Error('This browser cannot analyze video frames.')
    const sampleTimes = [...new Set([0.15, video.duration * 0.5, Math.max(0.15, video.duration - 0.2)])]
      .filter((time) => time < video.duration)
      .slice(0, 3)
    const frames: VisualFrame[] = []

    for (const time of sampleTimes) {
      await seek(video, time)
      context.drawImage(video, 0, 0, canvas.width, canvas.height)
      const face = faceLandmarker.detect(canvas).faceLandmarks[0]
      let head: VisualFrame['head'] = null
      if (face?.length) {
        const xs = face.map((point) => point.x)
        const ys = face.map((point) => point.y)
        const x = Math.min(...xs), y = Math.min(...ys)
        head = { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y }
      }

      let subject: VisualFrame['subject'] = null
      segmenter.segment(canvas, (result) => {
        const mask = result.confidenceMasks?.[0]
        if (!mask) return
        const probabilities = mask.getAsFloat32Array()
        const step = Math.max(1, Math.floor(probabilities.length / 12000))
        let minX = 1, minY = 1, maxX = 0, maxY = 0, included = 0
        const width = mask.width, height = mask.height
        for (let i = 0; i < probabilities.length; i += step) {
          if (probabilities[i] < 0.55) continue
          const x = (i % width) / width, y = Math.floor(i / width) / height
          minX = Math.min(minX, x); minY = Math.min(minY, y)
          maxX = Math.max(maxX, x); maxY = Math.max(maxY, y)
          included++
        }
        const coverage = included / Math.ceil(probabilities.length / step)
        if (coverage > 0.035 && coverage < 0.85 && maxX > minX && maxY > minY) {
          subject = { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
        }
        mask.close()
      })

      frames.push({ time, image: canvas.toDataURL('image/jpeg', 0.62), head, subject })
    }
    segmenter.close()
    faceLandmarker.close()
    return frames
  } catch {
    return await analyzeFramesWithoutModels(video)
  } finally {
    video.pause()
    video.removeAttribute('src')
    video.load()
    URL.revokeObjectURL(url)
  }
}

async function analyzeFramesWithoutModels(video: HTMLVideoElement): Promise<VisualFrame[]> {
  const canvas = document.createElement('canvas')
  const scale = Math.min(1, 384 / Math.max(video.videoWidth, video.videoHeight))
  canvas.width = Math.max(1, Math.round(video.videoWidth * scale))
  canvas.height = Math.max(1, Math.round(video.videoHeight * scale))
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Could not analyze the video composition. Try a supported browser.')
  const times = [...new Set([0.15, video.duration * 0.5, Math.max(0.15, video.duration - 0.2)])].filter((time) => time < video.duration).slice(0, 3)
  const frames: VisualFrame[] = []
  for (const time of times) {
    await seek(video, time)
    context.drawImage(video, 0, 0, canvas.width, canvas.height)
    frames.push({ time, image: canvas.toDataURL('image/jpeg', 0.62), head: null, subject: null })
  }
  return frames
}
