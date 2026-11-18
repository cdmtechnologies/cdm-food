// Translated wording for rules that live in the shared planner code.
import { unsuitableParts, type Food, type Profile } from '../lib/planner'
import { t } from './index'

/** Why a food does not suit the person, in their language ('' when it does). */
export function whyNot(food: Food, p: Pick<Profile, 'diet' | 'allergies'>): string {
  const r = unsuitableParts(food, p)
  return r ? t(r.text, { diet: r.diet ? t(r.diet) : '', tag: t(r.tag) }) : ''
}

// Messages that come back from the server in English. Listed here so they are translated too.
export const SERVER_TEXT = [
  /*i18n*/ 'Please sign in again.', /*i18n*/ 'Type a question first.', /*i18n*/ 'Ask AI is not set up yet.',
  /*i18n*/ 'Recipes, cooking steps and videos are part of Premium.', /*i18n*/ 'Recipes are not set up yet.',
  /*i18n*/ 'The recipe did not come out right. Please try again.', /*i18n*/ 'The recipe could not load just now. Please try again in a moment.',
  /*i18n*/ 'You have opened a lot of new recipes today. Recipes you have already opened still work; new ones are back tomorrow.',
  /*i18n*/ 'That food was not found.', /*i18n*/ 'Pick a food first.', /*i18n*/ 'That date is too far away.', /*i18n*/ 'That food is not available.',
  /*i18n*/ 'You can only tick meals for today or earlier.', /*i18n*/ 'A meal can hold up to 10 foods.', /*i18n*/ 'That date is in the future.',
  /*i18n*/ 'Something went wrong. Please try again.',
]
/** Translates a server message when it is one of ours; other text is shown as it is. */
export const serverText = (msg: string) => t(msg)
