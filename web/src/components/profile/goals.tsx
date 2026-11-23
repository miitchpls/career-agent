import { useState } from "react"
import { PencilIcon, PlusIcon } from "lucide-react"

import { Field, FormDialog, SkillPicker } from "@/components/profile/fields"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { CURRENCIES, formatAmount, parseSalary, type Currency } from "@/lib/currencies"
import { useT } from "@/lib/i18n"
import { goalSalary, goalsSet, useGoals, useSaveGoals } from "@/lib/job-score"
import { useDraft } from "@/lib/use-draft"

const MODES = ["onsite", "hybrid", "remote"] as const

/** Profile sidebar: what the user is looking for, read by the fit score. */
export function GoalsCard() {
  const all = useT()
  const t = all.goals
  const { goals, loading } = useGoals()
  const [open, setOpen] = useState(false)
  const set = goalsSet(goals)
  const salary = goalSalary(goals)
  const lines = [
    goals.roles.join(", "),
    [salary && t.salaryFrom(salary), goals.workModes.map((m) => all.modes[m]).join(", ")].filter(Boolean).join(" · "),
    goals.places.join(", "),
    goals.dealbreakers.length ? t.dealbreakersCount(goals.dealbreakers.length) : "",
  ].filter(Boolean)

  return (
    <Card className="gap-3 px-5 py-4">
      <h2 className="text-sm font-medium">{t.card}</h2>
      {set ? (
        <div className="space-y-1 text-xs">
          {lines.map((l, i) => (
            <p key={i} className={i === 0 ? "text-foreground" : "text-muted-foreground"}>
              {l}
            </p>
          ))}
        </div>
      ) : (
        <p className="text-xs text-pretty text-muted-foreground">{t.empty}</p>
      )}
      <Button variant="outline" size="sm" disabled={loading} onClick={() => setOpen(true)}>
        {set ? <PencilIcon /> : <PlusIcon />}
        {set ? t.edit : t.add}
      </Button>
      <GoalsDialog open={open} onOpenChange={setOpen} />
    </Card>
  )
}

/** Edits the goals; also opened from a posting's fit tab. */
export function GoalsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const all = useT()
  const t = all.goals
  const { goals } = useGoals()
  const save = useSaveGoals()
  const [g, setG] = useDraft(open, goals)
  const [salaryText, setSalaryText] = useDraft(
    open,
    goals.minSalary ? formatAmount(goals.minSalary, goals.salaryCurrency as Currency) : "",
  )
  const cur = g.salaryCurrency as Currency
  const amount = salaryText.trim() ? parseSalary(salaryText, cur) : null
  const salaryWrong = !!salaryText.trim() && amount === null
  const list = (key: "roles" | "places" | "company" | "dealbreakers") => (
    <SkillPicker value={g[key]} onChange={(v) => setG({ ...g, [key]: v })} known={[]} placeholder={t.placeholder} />
  )

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t.title}
      description={t.description}
      footnote=""
      canSave={!salaryWrong}
      onSave={() => save.mutate({ ...g, minSalary: amount })}
    >
      <Field label={t.roles} hint={t.rolesHint}>
        {list("roles")}
      </Field>
      <Field label={t.salary} hint={t.salaryHint} error={salaryWrong ? t.salaryInvalid : null}>
        <div className="flex gap-2">
          <Input
            value={salaryText}
            onChange={(e) => setSalaryText(e.target.value)}
            inputMode="numeric"
            aria-invalid={salaryWrong || undefined}
            className="font-mono"
          />
          <Select value={g.salaryCurrency} onValueChange={(v) => setG({ ...g, salaryCurrency: v })}>
            <SelectTrigger className="w-24" aria-label={t.salary}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CURRENCIES.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </Field>
      <Field label={t.modes} hint={t.modesHint}>
        <ToggleGroup
          type="multiple"
          variant="outline"
          size="sm"
          value={g.workModes}
          onValueChange={(v) => setG({ ...g, workModes: MODES.filter((m) => v.includes(m)) })}
          className="justify-start"
        >
          {MODES.map((m) => (
            <ToggleGroupItem key={m} value={m} className="px-3 data-[state=on]:border-foreground/50 data-[state=on]:bg-muted">
              {all.modes[m]}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </Field>
      <Field label={t.places} hint={t.placesHint}>
        {list("places")}
      </Field>
      <Field label={t.company} hint={t.companyHint}>
        {list("company")}
      </Field>
      <Field label={t.dealbreakers} hint={t.dealbreakersHint}>
        {list("dealbreakers")}
      </Field>
    </FormDialog>
  )
}
