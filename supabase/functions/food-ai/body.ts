// Body measurements: BMI, a daily calorie target from height, weight, age and activity, and progress to a target weight.
// Pure code, shared by the app and the food-ai edge function (copied to supabase/functions/food-ai/body.ts).

export type Sex = 'female' | 'male'
export type Activity = 'sedentary' | 'light' | 'moderate' | 'active' | 'very_active'
export type Body = {
  sex: Sex | null; birth_year: number | null; height_cm: number | null; weight_kg: number | null
  target_weight_kg: number | null; activity: Activity | null
}

export const ACTIVITY: { id: Activity; label: string; factor: number }[] = [
  { id: 'sedentary', label: /*i18n*/ 'Mostly sitting (little exercise)', factor: 1.2 },
  { id: 'light', label: /*i18n*/ 'Light (exercise 1–3 days a week)', factor: 1.375 },
  { id: 'moderate', label: /*i18n*/ 'Moderate (exercise 3–5 days a week)', factor: 1.55 },
  { id: 'active', label: /*i18n*/ 'Active (hard exercise 6–7 days a week)', factor: 1.725 },
  { id: 'very_active', label: /*i18n*/ 'Very active (physical job and training)', factor: 1.9 },
]

export const age = (birthYear: number | null, now = new Date()) => (birthYear ? now.getFullYear() - birthYear : null)

export function bmi(heightCm: number | null, weightKg: number | null): number | null {
  if (!heightCm || !weightKg || heightCm < 50) return null
  return Math.round((weightKg / (heightCm / 100) ** 2) * 10) / 10
}

export type BmiBand = 'under' | 'healthy' | 'over' | 'obese'
export const bmiBand = (b: number): BmiBand => (b < 18.5 ? 'under' : b < 25 ? 'healthy' : b < 30 ? 'over' : 'obese')
export const BMI_LABEL: Record<BmiBand, string> = { under: /*i18n*/ 'Below the healthy range', healthy: /*i18n*/ 'Healthy range', over: /*i18n*/ 'Above the healthy range', obese: /*i18n*/ 'Well above the healthy range' }

/** Healthy weight range (BMI 18.5 to 24.9) for a height. */
export function healthyRange(heightCm: number | null): [number, number] | null {
  if (!heightCm || heightCm < 50) return null
  const m2 = (heightCm / 100) ** 2
  return [Math.round(18.5 * m2 * 10) / 10, Math.round(24.9 * m2 * 10) / 10]
}

/** Why a target weight is not accepted, or '' when it is fine. Targets below a healthy BMI are not supported. */
export type Problem = { text: string; vars?: Record<string, number> } | null
const fillIn = (p: Problem) => (p ? p.text.replace(/\{(\w+)\}/g, (m, k) => String(p.vars?.[k] ?? m)) : '')

export function targetIssue(b: Pick<Body, 'height_cm' | 'target_weight_kg'>): Problem {
  if (!b.target_weight_kg) return null
  const r = healthyRange(b.height_cm)
  if (r && b.target_weight_kg < r[0]) return { text: /*i18n*/ 'For your height, a healthy weight starts at about {kg} kg. Please choose a target of at least {kg} kg.', vars: { kg: r[0] } }
  return null
}
export const targetProblem = (b: Pick<Body, 'height_cm' | 'target_weight_kg'>) => fillIn(targetIssue(b))

export type CalorieTarget = { kcal: number; maintenance: number; direction: 'lose' | 'gain' | 'keep'; kgPerWeek: number; note: string }

/** Daily calories from the body measurements (Mifflin-St Jeor), or null when something is missing. */
export function bodyTarget(b: Body, now = new Date()): CalorieTarget | null {
  const a = age(b.birth_year, now)
  if (!b.sex || !a || a < 13 || a > 110 || !b.height_cm || !b.weight_kg) return null
  const bmr = 10 * b.weight_kg + 6.25 * b.height_cm - 5 * a + (b.sex === 'male' ? 5 : -161)
  const factor = ACTIVITY.find((x) => x.id === b.activity)?.factor ?? 1.375
  const maintenance = Math.round((bmr * factor) / 10) * 10
  const floor = b.sex === 'male' ? 1500 : 1200
  const target = b.target_weight_kg
  if (a < 18) return { kcal: maintenance, maintenance, direction: 'keep', kgPerWeek: 0, note: /*i18n*/ 'Under 18: the plan keeps to normal growing needs. Speak to a doctor before trying to lose weight.' }
  if (target && target < b.weight_kg - 0.5 && !targetProblem({ height_cm: b.height_cm, target_weight_kg: target })) {
    const deficit = Math.min(500, Math.round(maintenance * 0.2))
    const kcal = Math.max(floor, Math.round((maintenance - deficit) / 10) * 10)
    return { kcal, maintenance, direction: 'lose', kgPerWeek: Math.round(((maintenance - kcal) * 7) / 7700 * 100) / 100, note: '' }
  }
  if (target && target > b.weight_kg + 0.5) {
    const kcal = Math.round((maintenance + 300) / 10) * 10
    return { kcal, maintenance, direction: 'gain', kgPerWeek: Math.round((300 * 7) / 7700 * 100) / 100, note: '' }
  }
  return { kcal: maintenance, maintenance, direction: 'keep', kgPerWeek: 0, note: '' }
}

/** Weeks to reach the target at the planned pace, or null. */
export function weeksToTarget(b: Body, t: CalorieTarget | null): number | null {
  if (!t || !t.kgPerWeek || !b.weight_kg || !b.target_weight_kg) return null
  return Math.ceil(Math.abs(b.weight_kg - b.target_weight_kg) / t.kgPerWeek)
}

/** How far from the start weight to the target the person has come (0 to 100), or null. */
export function progress(start: number | null, now: number | null, target: number | null): number | null {
  if (start == null || now == null || target == null || start === target) return null
  return Math.max(0, Math.min(100, Math.round(((start - now) / (start - target)) * 100)))
}

/** Checks body numbers typed into a form. Returns the problem (English text with {placeholders}), or null when fine. */
export function bodyIssue(b: Partial<Body>, now = new Date()): Problem {
  const y = now.getFullYear()
  if (b.birth_year != null && (b.birth_year < y - 110 || b.birth_year > y - 13)) return { text: /*i18n*/ 'Please enter a real year of birth (CDM Food is for people aged 13 and over).' }
  if (b.height_cm != null && (b.height_cm < 100 || b.height_cm > 250)) return { text: /*i18n*/ 'Height should be between 100 and 250 cm.' }
  if (b.weight_kg != null && (b.weight_kg < 25 || b.weight_kg > 350)) return { text: /*i18n*/ 'Weight should be between 25 and 350 kg.' }
  if (b.target_weight_kg != null && (b.target_weight_kg < 25 || b.target_weight_kg > 350)) return { text: /*i18n*/ 'Target weight should be between 25 and 350 kg.' }
  return targetIssue({ height_cm: b.height_cm ?? null, target_weight_kg: b.target_weight_kg ?? null })
}
/** The same check as plain English text ('' when fine), for the AI. */
export const bodyProblem = (b: Partial<Body>, now = new Date()) => fillIn(bodyIssue(b, now))

export const lbToKg = (lb: number) => Math.round(lb * 0.45359237 * 10) / 10
export const kgToLb = (kg: number) => Math.round(kg / 0.45359237 * 10) / 10
export const ftInToCm = (ft: number, inch: number) => Math.round((ft * 12 + inch) * 2.54)
export function cmToFtIn(cm: number): [number, number] { const total = Math.round(cm / 2.54); return [Math.floor(total / 12), total % 12] }
