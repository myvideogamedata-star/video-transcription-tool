import { z } from 'zod'

export const CaptionUnitSchema = z.object({
  text: z.string().trim().min(1).max(1_000),
  start: z.number().finite().min(0),
  end: z.number().finite().positive(),
  kind: z.enum(['word', 'phrase']),
}).refine((unit) => unit.end > unit.start && unit.end <= 130, 'Caption timing is outside the supported video duration')

export type CaptionUnit = z.infer<typeof CaptionUnitSchema>

export const CaptionStyleSchema = z.object({
  fontFamily: z.enum(['sans', 'serif']),
  fontSize: z.enum(['medium', 'large', 'extra-large']),
  textColor: z.enum(['white', 'ink']),
  highlightColor: z.enum(['lemon', 'mint', 'coral']),
  background: z.enum(['dark', 'light', 'none']),
  position: z.enum(['top', 'center', 'bottom']),
  animation: z.enum(['pop', 'lift', 'fade']),
})

export const CaptionCuePlanSchema = z.object({
  unitIndexes: z.array(z.number().int().nonnegative()).min(1).max(8),
  highlightedUnitIndexes: z.array(z.number().int().nonnegative()).max(8),
})

export const CaptionPlanSchema = z.object({
  style: CaptionStyleSchema,
  captions: z.array(CaptionCuePlanSchema).min(1).max(120),
})

export const CaptionRequestSchema = z.object({
  transcript: z.string().trim().min(1).max(20_000),
  units: z.array(CaptionUnitSchema).min(1).max(1_800),
})

export type CaptionStyle = z.infer<typeof CaptionStyleSchema>
export type CaptionCue = {
  start: number
  end: number
  units: Array<CaptionUnit & { highlighted: boolean }>
}
export type CaptionResult = {
  style: CaptionStyle
  captions: CaptionCue[]
  timingPrecision: 'word' | 'phrase'
}
