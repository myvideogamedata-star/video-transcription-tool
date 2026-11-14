import { z } from 'zod'

export const CaptionUnitSchema = z.object({
  text: z.string().trim().min(1).max(1_000),
  start: z.number().finite().min(0),
  end: z.number().finite().positive(),
  kind: z.enum(['word', 'phrase']),
}).refine((unit) => unit.end > unit.start && unit.end <= 130, 'Caption timing is outside the supported video duration')

export type CaptionUnit = z.infer<typeof CaptionUnitSchema>

export const CaptionStyleSchema = z.object({
  fontFamily: z.literal('sans'),
  fontSize: z.literal('large'),
  textColor: z.literal('white'),
  highlightColor: z.literal('lemon'),
  background: z.literal('none'),
  position: z.literal('bottom'),
  animation: z.literal('pop'),
})

export const CaptionCuePlanSchema = z.object({
  unitIndexes: z.array(z.number().int().nonnegative()).min(1).max(8),
  highlightedUnitIndexes: z.array(z.number().int().nonnegative()).max(8),
})

export const HeadlinePlanSchema = z.object({
  text: z.string().trim().min(1).max(60),
  unitIndexes: z.array(z.number().int().nonnegative()).min(1).max(8),
  placement: z.enum(['upper', 'above-head', 'behind-subject']),
})

export const ZoomPlanSchema = z.object({
  unitIndexes: z.array(z.number().int().nonnegative()).min(1).max(8),
  scale: z.number().min(1.04).max(1.16),
})

export const CaptionPlanSchema = z.object({
  captions: z.array(CaptionCuePlanSchema).min(1).max(120),
  headlines: z.array(HeadlinePlanSchema).max(12),
  zooms: z.array(ZoomPlanSchema).max(8),
})

export const VisualFrameSchema = z.object({
  time: z.number().finite().min(0).max(120),
  image: z.string().regex(/^data:image\/(jpeg|webp);base64,/).max(400_000),
  subject: z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1), width: z.number().min(0).max(1), height: z.number().min(0).max(1) }).nullable(),
  head: z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1), width: z.number().min(0).max(1), height: z.number().min(0).max(1) }).nullable(),
})

export const CaptionRequestSchema = z.object({
  transcript: z.string().trim().min(1).max(20_000),
  units: z.array(CaptionUnitSchema).min(1).max(1_800),
  duration: z.number().finite().positive().max(120),
  visualFrames: z.array(VisualFrameSchema).min(1).max(4),
}).refine((request) => request.units.every((unit) => unit.end <= request.duration + 0.5), 'Speech timing extends beyond the uploaded video')

export type CaptionStyle = z.infer<typeof CaptionStyleSchema>
export type CaptionCue = {
  start: number
  end: number
  units: Array<CaptionUnit & { highlighted: boolean }>
}
export type HeadlineCue = { start: number; end: number; text: string; placement: z.infer<typeof HeadlinePlanSchema>['placement'] }
export type ZoomCue = { start: number; end: number; scale: number }
export type CaptionResult = {
  style: CaptionStyle
  captions: CaptionCue[]
  headlines: HeadlineCue[]
  zooms: ZoomCue[]
  timingPrecision: 'word' | 'phrase'
  segmentationAvailable: boolean
}
