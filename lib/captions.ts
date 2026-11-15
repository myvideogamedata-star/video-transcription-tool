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

export const HeadlinePlanSchema = z.object({
  text: z.string().trim().min(1).max(60),
  unitIndexes: z.array(z.number().int().nonnegative()).min(1).max(8),
  placement: z.enum(['upper', 'above-head', 'behind-subject']),
})

export const CaptionGroupPlanSchema = z.object({
  unitIndexes: z.array(z.number().int().nonnegative()).min(1).max(8),
  style: z.enum(['impact', 'editorial', 'kinetic']),
  placement: z.enum(['upper', 'above-head', 'behind-subject']),
})

export const ZoomPlanSchema = z.object({
  unitIndexes: z.array(z.number().int().nonnegative()).min(1).max(8),
  scale: z.number().min(1.04).max(1.16),
})

export const CaptionPlanSchema = z.object({
  captions: z.array(CaptionGroupPlanSchema).max(140),
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
  visualFrames: z.array(VisualFrameSchema).min(1).max(60),
}).refine((request) => request.units.every((unit) => unit.end <= request.duration + 0.5), 'Speech timing extends beyond the uploaded video')

export type CaptionStyle = z.infer<typeof CaptionStyleSchema>
export type HeadlineCue = { start: number; end: number; text: string; placement: z.infer<typeof HeadlinePlanSchema>['placement'] }
export type MotionCaptionCue = {
  start: number
  end: number
  words: { text: string; start: number; end: number }[]
  style: z.infer<typeof CaptionGroupPlanSchema>['style']
  placement: z.infer<typeof CaptionGroupPlanSchema>['placement']
}
export type ZoomCue = { start: number; end: number; scale: number }
export type CaptionResult = {
  captions: MotionCaptionCue[]
  headlines: HeadlineCue[]
  zooms: ZoomCue[]
  timingPrecision: 'word' | 'phrase'
  segmentationAvailable: boolean
}
