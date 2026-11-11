import { ANSWER_TONES, pendingConference, type AnswerTone, type PressAnswer, type PressConference } from '@fm-immersion/module-fm';
import { PageHero } from '../components/PageHero';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { useCareer } from '../lib/career';
import { fmData } from '../lib/data';
import { useHistory } from '../lib/fm-cache';
import { answerText, pressKeyOf, usePressHeld, usePressQuestions } from '../lib/press';

/** Conférence de presse : la presse interroge le coach avant une affiche et après chaque match officiel. */
export function Press() {
  const { t, i18n } = useTranslation();
  const { saveId, fmSaves } = useCareer();
  const { data: history = [], isLoading } = useHistory(saveId);
  const { data: held = [], isLoading: heldLoading } = usePressHeld(saveId);
  const done = useMemo(() => new Set(held.map((h) => h.key)), [held]);
  const pending = useMemo(() => (heldLoading ? null : pendingConference(history, done)), [history, done, heldLoading]);
  const [note, setNote] = useState<'saved' | 'declined' | null>(null);
  useEffect(() => setNote(null), [saveId]);

  return (
    <div className="w-full max-w-3xl">
      {/* Bandeau de la maquette : la conférence qui attend, s'il y en a une. */}
      {pending && (
        <PageHero
          eyebrow={t('press.page.today')}
          title={t(pending.kind === 'pre' ? 'press.page.todayPre' : 'press.page.todayPost', { opponent: pending.opponent })}
          text={t('press.page.heroText')}
        />
      )}
      {!fmSaves.length && (
        <div className="card mt-6">
          <p className="text-brun">{t('press.page.noSave')}</p>
          <Link to="/parties" className="btn-primary mt-4">
            {t('layout.career.create')}
          </Link>
        </div>
      )}
      {note && (
        <p className="mt-4 rounded-lg bg-eau/10 px-3 py-2 text-sm font-bold text-eau-fonce" role="status">
          {t(`press.page.${note}`)}
        </p>
      )}
      {!!fmSaves.length && !isLoading && !heldLoading && !pending && <p className="card mt-6 text-brun">{t('press.page.none')}</p>}
      {pending && <Conference key={pending.key} saveId={saveId} club={history.at(-1)?.data.club ?? pending.club} conference={pending} onDone={setNote} />}

      {held.length > 0 && (
        <section className="mt-8">
          <h2 className="text-xs font-bold uppercase tracking-wide text-brun">{t('press.page.past')}</h2>
          <ul className="mt-3 space-y-4">
            {held.map((h) => (
              <li key={h.key} className="card">
                <p className="font-display text-lg font-semibold">{t(`press.page.${h.kind}`, { opponent: h.opponent })}</p>
                <p className="text-xs text-brun">{t('press.page.date', { date: dateLabel(h.matchDate, i18n.resolvedLanguage) })}</p>
                {h.answers.length ? (
                  <dl className="mt-3 space-y-3 text-sm">
                    {h.answers.map((a) => (
                      <div key={a.question}>
                        <dt className="text-brun">{h.questions.find((q) => q.id === a.question)?.text}</dt>
                        <dd className="mt-1 font-semibold">« {a.text} »</dd>
                      </div>
                    ))}
                  </dl>
                ) : (
                  <p className="mt-2 text-sm italic text-brun">{t('press.page.pastDeclined')}</p>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

const dateLabel = (iso: string, lang?: string) => new Intl.DateTimeFormat(lang, { dateStyle: 'long', timeZone: 'UTC' }).format(new Date(`${iso.slice(0, 10)}T00:00:00Z`));

function Conference({ saveId, club, conference: c, onDone }: { saveId: string; club: string; conference: PressConference; onDone: (n: 'saved' | 'declined') => void }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage;
  const qc = useQueryClient();
  const { texts, rewording } = usePressQuestions(club, c);
  const [tones, setTones] = useState<(AnswerTone | null)[]>(() => c.questions.map(() => null));
  const [answers, setAnswers] = useState<string[]>(() => c.questions.map(() => ''));
  const save = useMutation({
    mutationFn: async (declined: boolean) => {
      const out: PressAnswer[] = declined
        ? []
        : c.questions.flatMap((q, i) => (answers[i]!.trim() ? [{ question: q.id, tone: tones[i] ?? null, text: answers[i]!.trim() }] : []));
      await fmData.savePressConference({
        saveId,
        key: c.key,
        kind: c.kind,
        matchDate: c.date,
        club: c.club,
        opponent: c.opponent,
        competition: c.competition,
        questions: c.questions.map((q, i) => ({ id: q.id, text: texts[i]! })),
        answers: out,
      });
      return out.length ? 'saved' : 'declined';
    },
    onSuccess: async (n) => {
      onDone(n);
      await qc.invalidateQueries({ queryKey: pressKeyOf(saveId) });
    },
  });
  const pick = (i: number, tone: AnswerTone) => {
    setTones((x) => x.map((v, j) => (j === i ? tone : v)));
    setAnswers((x) => x.map((v, j) => (j === i ? answerText(t, c.questions[i]!, tone, lang) : v)));
  };
  const any = answers.some((a) => a.trim());

  return (
    <section className="card mt-6" aria-labelledby="press-now">
      <h2 id="press-now" className="font-display text-xl font-semibold">
        {t(`press.page.${c.kind}`, { opponent: c.opponent })}
      </h2>
      <p className="text-xs text-brun">
        {t('press.page.date', { date: dateLabel(c.date, lang) })}
        {c.competition ? ` · ${c.competition}` : ''}
      </p>
      {rewording && <p className="mt-2 text-xs text-brun">{t('press.page.aiRewording')}</p>}
      <ol className="mt-4 space-y-5">
        {c.questions.map((q, i) => (
          <li key={q.id}>
            <p className="font-semibold">{texts[i]}</p>
            <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label={t('press.page.answer')}>
              {ANSWER_TONES.map((tone) => (
                <button key={tone} type="button" className={`chip ${tones[i] === tone ? 'chip-on' : ''}`} onClick={() => pick(i, tone)}>
                  {t(`press.tones.${tone}`)}
                </button>
              ))}
            </div>
            <label className="mt-2 block">
              <span className="sr-only">{t('press.page.answer')}</span>
              <textarea
                className="input mt-1 w-full"
                rows={2}
                maxLength={400}
                value={answers[i]}
                placeholder={t('press.page.placeholder')}
                onChange={(e) => {
                  const v = e.target.value;
                  setAnswers((x) => x.map((a, j) => (j === i ? v : a)));
                }}
              />
            </label>
          </li>
        ))}
      </ol>
      <div className="mt-5 flex flex-wrap gap-3">
        <button type="button" className="btn-primary" disabled={!any || save.isPending} onClick={() => save.mutate(false)}>
          {t('press.page.send')}
        </button>
        <button type="button" className="btn-secondary" disabled={save.isPending} onClick={() => save.mutate(true)}>
          {t('press.page.decline')}
        </button>
      </div>
      {save.isError && <p className="mt-3 text-sm text-corail">{t('press.page.error', { error: String(save.error) })}</p>}
    </section>
  );
}
