import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const maxDuration = 150

const MAX_AUDIO_BYTES = 25 * 1024 * 1024

export async function POST(request: Request) {
  try {
    const form = await request.formData()
    const audio = form.get('audio')
    const apiKey = form.get('apiKey')

    if (!(audio instanceof File) || !audio.size) {
      return NextResponse.json({ error: 'Please add a video with an audio track.' }, { status: 400 })
    }
    if (audio.size > MAX_AUDIO_BYTES) {
      return NextResponse.json({ error: 'The audio is too large to transcribe. Try a shorter or smaller video.' }, { status: 413 })
    }
    if (typeof apiKey !== 'string' || !/^sk-[A-Za-z0-9_-]{20,}$/.test(apiKey)) {
      return NextResponse.json({ error: 'Enter a valid OpenAI API key.' }, { status: 400 })
    }

    const openAiForm = new FormData()
    openAiForm.append('file', audio, 'video-audio.webm')
    openAiForm.append('model', 'whisper-1')
    openAiForm.append('response_format', 'json')

    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: openAiForm,
      signal: AbortSignal.timeout(120_000),
    })
    const result = await response.json().catch(() => ({}))
    if (!response.ok) {
      const message = typeof result?.error?.message === 'string' ? result.error.message : 'OpenAI could not transcribe this video. Check your API key and try again.'
      return NextResponse.json({ error: message }, { status: response.status === 401 ? 401 : 502 })
    }
    return NextResponse.json({ text: typeof result.text === 'string' ? result.text : '' })
  } catch (error) {
    const message = error instanceof Error && error.name === 'TimeoutError'
      ? 'Transcription took too long. Please try again.'
      : 'We couldn’t reach OpenAI. Check your connection and try again.'
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
