import { useEffect, useState } from 'react'
import FoodForm from '../components/FoodForm'
import { Alert, Icon, kcal, Modal, Spinner, Tags } from '../components/ui'
import { deleteFood, flag, myFoods, type ProfileRow } from '../lib/api'
import { MEAL_LABEL, type Food } from '../lib/planner'

/** Foods the person added themselves: anything missing from the catalogue, with their own or AI-estimated figures. */
export default function MyFoods({ profile }: { profile: ProfileRow }) {
  const [list, setList] = useState<Food[] | null>(null)
  const [edit, setEdit] = useState<Food | 'new' | null>(null)
  const [err, setErr] = useState('')
  const load = () => myFoods().then(setList, (e) => { setErr(e.message); setList([]) })
  useEffect(() => { load() }, [])

  async function remove(f: Food) {
    if (!window.confirm(`Delete "${f.name}"? It will also be removed from your plan.`)) return
    try { await deleteFood(f.id); load() } catch (e) { setErr((e as Error).message) }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">My foods</h1>
          <p className="text-sm text-slate-600">Add any dish, drink or snack that is not in the catalogue. Only you can see these.</p>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => setEdit('new')}><Icon.plus /> Add a food</button>
      </div>
      {err && <Alert>{err}</Alert>}
      {list === null ? <Spinner /> : list.length === 0 ? (
        <div className="card p-6 text-center">
          <div className="text-4xl">⭐</div>
          <p className="mt-2 font-semibold">No foods of your own yet</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-slate-600">Add your family recipes or favourite local foods. Type the name and tap <b>Fill in with AI</b> to estimate the nutrition for you.</p>
        </div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {list.map((f) => (
            <li key={f.id} className="card p-4">
              <div className="flex items-start justify-between gap-2"><span className="font-semibold">{f.name}</span><span className="text-sm text-slate-600">{kcal(f.kcal)}</span></div>
              <div className="mt-1 text-xs text-slate-500">{f.country_code ? `${flag(f.country_code)} · ` : ''}{f.meals.map((m) => MEAL_LABEL[m]).join(' · ')}{f.serving ? ` · ${f.serving}` : ''}</div>
              <div className="mt-2"><Tags food={f} max={4} /></div>
              <div className="mt-3 flex gap-2">
                <button type="button" className="chip chip-off" onClick={() => setEdit(f)}><Icon.mine className="h-3.5 w-3.5" /> Edit</button>
                <button type="button" className="chip chip-off text-red-700" onClick={() => remove(f)}><Icon.trash className="h-3.5 w-3.5" /> Delete</button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <Modal open={!!edit} title={edit === 'new' ? 'Add a food' : 'Edit food'} onClose={() => setEdit(null)} wide>
        {edit && <FoodForm food={edit === 'new' ? undefined : edit} country={profile.country_code} onCancel={() => setEdit(null)} onSaved={() => { setEdit(null); load() }} />}
      </Modal>
    </div>
  )
}
