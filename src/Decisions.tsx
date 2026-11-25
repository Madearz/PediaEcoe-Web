import type { Interaction } from '../shared/clinical.mjs';
import { type ReasoningNote, type TreatmentOption, type TreatmentPlan } from '../shared/decisions.mjs';

export function ReasoningFields({ diagnoses, observed, notes, nextTest, disabled, update, updateTest }: {
  diagnoses: Interaction[]; observed: Interaction[]; notes: ReasoningNote[]; nextTest: string; disabled: boolean;
  update: (note: ReasoningNote) => void; updateTest: (test: string) => void;
}) {
  return <fieldset className="differential-options" disabled={disabled}>
    <legend>Fundamenta tus hipótesis</legend>
    {!diagnoses.length && <p>Selecciona un diagnóstico para anotar qué lo apoya o lo hace menos probable.</p>}
    {diagnoses.map(({ id, label }) => {
      const row = notes.find((note) => note.diagnosis === id) ?? { diagnosis: id };
      return <fieldset className="decision-form" key={id}>
        <legend>{label}</legend>
        <label>Hallazgo a favor<select value={row.support ?? ''} onChange={(event) => update({ ...row, support: event.target.value })}>
          <option value="">Selecciona un hallazgo obtenido</option>{observed.filter((item) => item.id !== row.counter).map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
        </select></label>
        <label>Hallazgo en contra<select value={row.counter ?? ''} onChange={(event) => update({ ...row, counter: event.target.value })}>
          <option value="">Selecciona un hallazgo obtenido</option>{observed.filter((item) => item.id !== row.support).map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
        </select></label>
        <label>¿Por qué lo consideras?<textarea rows={2} maxLength={160} value={row.for ?? ''} onChange={(event) => update({ ...row, for: event.target.value })}/></label>
        <label>¿Qué lo hace menos probable?<textarea rows={2} maxLength={160} value={row.against ?? ''} onChange={(event) => update({ ...row, against: event.target.value })}/></label>
      </fieldset>;
    })}
    <label>¿Qué hallazgo o estudio ayudaría a distinguir tus hipótesis?<textarea rows={2} maxLength={240} value={nextTest}
      onChange={(event) => updateTest(event.target.value)}/></label>
  </fieldset>;
}

export function TreatmentFields({ options = [], value, disabled, update }: {
  options?: TreatmentOption[]; value: TreatmentPlan; disabled: boolean; update: (plan: TreatmentPlan) => void;
}) {
  return <fieldset className="differential-options" disabled={disabled}>
    <legend>{options.length ? 'Pauta y seguimiento' : 'Seguimiento'}</legend>
    {options.length > 0 && <div className="option-list" aria-label="Pautas de tratamiento">
      {options.map(({ id, label }) => <button type="button" className={'button secondary ' + (value.option === id ? 'picked' : '')}
        key={id} aria-pressed={value.option === id} onClick={() => update({ ...value, option: value.option === id ? '' : id })}>{label}</button>)}
    </div>}
    <label>¿Qué revisarías y cuándo?<textarea rows={2} maxLength={350} value={value.monitor ?? ''}
      onChange={(event) => update({ ...value, monitor: event.target.value })}/></label>
  </fieldset>;
}
