import { useState } from "react"
import { PencilIcon, PlusIcon } from "lucide-react"

import { Field, FormDialog, SkillPicker } from "@/components/profile/fields"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import { useT } from "@/lib/i18n"
import { useSaveScorePrefs, useScorePrefs } from "@/lib/job-score"
import { useDraft } from "@/lib/use-draft"

/** Profile sidebar: what the fit score reads whatever the search. */
export function ScorePrefsCard() {
  const t = useT().scorePrefs
  const { prefs, loading } = useScorePrefs()
  const [open, setOpen] = useState(false)
  const set = prefs.dealbreakers.length > 0 || !!prefs.note

  return (
    <Card className="gap-3 px-5 py-4">
      <h2 className="text-sm font-medium">{t.card}</h2>
      {set ? (
        <div className="space-y-1 text-xs">
          {prefs.dealbreakers.length > 0 && <p>{t.dealbreakersCount(prefs.dealbreakers.length)}</p>}
          {prefs.note && <p className="line-clamp-2 text-muted-foreground">{prefs.note}</p>}
        </div>
      ) : (
        <p className="text-xs text-pretty text-muted-foreground">{t.empty}</p>
      )}
      <Button variant="outline" size="sm" disabled={loading} onClick={() => setOpen(true)}>
        {set ? <PencilIcon /> : <PlusIcon />}
        {set ? t.edit : t.add}
      </Button>
      <ScorePrefsDialog open={open} onOpenChange={setOpen} />
    </Card>
  )
}

/** Edits the dealbreakers and the note; also opened from a posting's fit tab. */
export function ScorePrefsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const t = useT().scorePrefs
  const { prefs } = useScorePrefs()
  const save = useSaveScorePrefs()
  const [d, setD] = useDraft(open, prefs)

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t.title}
      description={t.description}
      footnote=""
      onSave={() => save.mutate(d)}
    >
      <Field label={t.dealbreakers} hint={t.dealbreakersHint}>
        <SkillPicker
          value={d.dealbreakers}
          onChange={(dealbreakers) => setD({ ...d, dealbreakers })}
          known={[]}
          placeholder={t.placeholder}
        />
      </Field>
      <Field label={t.note} hint={t.noteHint}>
        <Textarea value={d.note} onChange={(e) => setD({ ...d, note: e.target.value })} maxLength={1000} className="min-h-24" />
      </Field>
    </FormDialog>
  )
}
