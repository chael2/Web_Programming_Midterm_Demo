'use client';
// Admin mission manager: list / edit / create / unpublish / delete missions stored in
// MongoDB. The server re-validates everything (validateMission) and re-checks admin.
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { owaspCategories } from '@/lib/labs';
import { evaluate, ruleErrors, validateMission, type MissionData, type MissionRule } from '@/lib/mission-engine';
import { PageHeader, StatusTag } from '@/components/ui';

type Draft = Omit<MissionData, 'rule' | 'lesson' | 'hints' | 'defenseLab'> & { ruleText: string; lessonText: string; defenseText: string; hints: string[] };
const toDraft = (m: MissionData): Draft => ({ ...m, ruleText: JSON.stringify(m.rule, null, 2), lessonText: JSON.stringify(m.lesson, null, 2), defenseText: JSON.stringify(m.defenseLab ?? {}, null, 2), hints: [...m.hints, '', '', ''].slice(0, 3) });
function fromDraft(d: Draft): { mission: unknown; parseError: string | null } {
  try {
    const { ruleText, lessonText, defenseText, ...rest } = d;
    return { mission: { ...rest, rule: JSON.parse(ruleText), lesson: JSON.parse(lessonText), defenseLab: JSON.parse(defenseText) }, parseError: null };
  } catch (e) { return { mission: null, parseError: `JSON 형식 오류: ${e instanceof Error ? e.message : ''}` }; }
}
const TEXT: { key: keyof Draft; label: string; rows?: number }[] = [
  { key: 'title', label: '제목' }, { key: 'ko', label: '한글 이름' }, { key: 'category', label: '세부 분류' }, { key: 'icon', label: '아이콘(1~4자)' }, { key: 'color', label: '색상(#RRGGBB)' },
  { key: 'description', label: '설명', rows: 2 }, { key: 'objective', label: '미션 목표', rows: 2 }, { key: 'field', label: '입력란 이름' },
  { key: 'sample', label: '공격 예제 (서버 전용, 힌트 3단계에서 공개)' }, { key: 'normal', label: '정상 입력' },
  { key: 'cause', label: '원인', rows: 2 }, { key: 'defense', label: '방어 방법', rows: 2 },
  { key: 'vulnerable', label: '취약한 코드', rows: 3 }, { key: 'secure', label: '안전한 코드', rows: 3 },
  { key: 'flagPrefix', label: 'FLAG 접두어 (실제 FLAG = SG{접두어_사용자별 난수})' }, { key: 'evidence', label: '결과 데이터 ({{flag}} 자리에 사용자별 FLAG)', rows: 4 },
  { key: 'trace', label: '서버가 받는 모습 (학습자 화면에 공개, {input} 자리에 입력이 실시간 표시)', rows: 3 },
];

export default function AdminMissions({ adminEmail }: { adminEmail: string }) {
  const [missions, setMissions] = useState<MissionData[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  async function fetchMissions(): Promise<{ missions?: MissionData[]; error?: string }> {
    const r = await fetch('/api/admin/missions');
    const data = await r.json().catch(() => ({}));
    return r.ok ? { missions: data.missions } : { error: data.error ?? '미션을 불러오지 못했습니다.' };
  }
  async function load() {
    const res = await fetchMissions();
    if (res.missions) setMissions(res.missions); else setMessage(res.error!);
  }
  useEffect(() => {
    let cancelled = false;
    fetchMissions().then(res => { if (cancelled) return; if (res.missions) setMissions(res.missions); else setMessage(res.error!); }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  // Live preview with the same engine the server uses.
  const preview = useMemo(() => {
    if (!draft) return null;
    let rule: MissionRule;
    try { rule = JSON.parse(draft.ruleText); } catch { return { error: 'rule JSON을 해석할 수 없습니다.' }; }
    const errs = ruleErrors(rule);
    if (errs.length) return { error: errs.join(' / ') };
    const row = (label: string, input: string, defense: boolean) => { const r = evaluate(rule, input, defense); return { label, input, verdict: r.blocked ? '차단됨' : r.attacked ? '공격 성공' : r.title === '시나리오 입력을 확인하세요' ? '입력 확인 필요' : '공격 아님', output: r.output }; };
    return { rows: [row('공격 예제 · 공격 모드', draft.sample, false), row('공격 예제 · 방어 모드', draft.sample, true), row('정상 입력 · 공격 모드', draft.normal, false)] };
  }, [draft]);

  function edit(m: MissionData) { setDraft(toDraft(m)); setIsNew(false); setErrors([]); setMessage(''); window.scrollTo({ top: 0 }); }
  function create() {
    const base = missions[0];
    if (!base) return;
    setDraft({ ...toDraft(base), missionId: '', title: '새 미션', order: (missions.at(-1)?.order ?? 0) + 10, published: false, flagPrefix: 'new_mission_flag' });
    setIsNew(true); setErrors([]); setMessage('기존 미션을 복제한 초안입니다. missionId와 내용을 바꾼 뒤 저장하세요. (처음에는 비공개)');
  }
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft(d => d ? { ...d, [k]: v } : d);

  async function save() {
    if (!draft) return;
    const { mission, parseError } = fromDraft(draft);
    if (parseError) { setErrors([parseError]); return; }
    const local = validateMission(mission);
    if (local.errors.length) { setErrors(local.errors); return; }
    setBusy(true); setErrors([]);
    try {
      const r = await fetch('/api/admin/missions', { method: isNew ? 'POST' : 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mission }) });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) { setErrors(data.errors ?? [data.error ?? '저장하지 못했습니다.']); return; }
      setMessage(`${draft.missionId} 저장 완료. 학습 화면에는 최대 30초 안에 반영됩니다.`); setIsNew(false);
      await load();
    } finally { setBusy(false); }
  }
  async function remove(m: MissionData) {
    if (!window.confirm(`${m.missionId} 미션을 삭제할까요? 이 미션의 발급된 FLAG도 함께 삭제되며 되돌릴 수 없습니다. (숨기기만 하려면 '공개'를 끄고 저장하세요)`)) return;
    setBusy(true);
    try {
      const r = await fetch('/api/admin/missions', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ missionId: m.missionId }) });
      const data = await r.json().catch(() => ({}));
      setMessage(r.ok ? `${m.missionId} 삭제 완료` : data.error ?? '삭제하지 못했습니다.');
      if (r.ok) { setDraft(null); await load(); }
    } finally { setBusy(false); }
  }

  return <main className="content admin">
    <PageHeader eyebrow={`SecureGuard · Admin · ${adminEmail}`} title="미션 관리" description="미션은 데이터베이스에 저장됩니다. 저장 시 서버가 필드·판정 규칙·학습 문구와 동작(공격 예제는 공격 성공·방어 시 차단, 정상 입력은 공격 아님)을 검사합니다." actions={<><Link className="btn btn-ghost" href="/">학습 화면</Link><button className="btn btn-secondary" onClick={create} disabled={!missions.length}>새 미션</button></>} />
    {message && <p className="toast" role="status">{message}</p>}

    {draft && <section className="admin-editor" aria-labelledby="editor-title">
      <h2 id="editor-title">{isNew ? '새 미션' : `${draft.missionId} 편집`}</h2>
      <div className="admin-grid">
        <label className="field"><span className="field-label">missionId (영문 소문자·숫자·-)</span><input className="mono" value={draft.missionId} disabled={!isNew} onChange={e => set('missionId', e.target.value)} /></label>
        <label className="field"><span className="field-label">순서(order)</span><input type="number" value={draft.order} onChange={e => set('order', Number(e.target.value))} /></label>
        <label className="field"><span className="field-label">OWASP 분류</span><select value={draft.categoryId} onChange={e => set('categoryId', e.target.value)}>{owaspCategories.map(c => <option key={c.id} value={c.id}>{c.id} · {c.ko}</option>)}</select></label>
        <label className="field"><span className="field-label">난이도</span><select value={draft.level} onChange={e => set('level', e.target.value as Draft['level'])}><option>입문</option><option>중급</option></select></label>
        <label className="field admin-check"><input type="checkbox" checked={draft.published} onChange={e => set('published', e.target.checked)} /><span className="field-label">공개 (학습 화면에 표시)</span></label>
      </div>
      <div className="admin-grid">
        {TEXT.map(f => <label key={f.key} className={`field ${f.rows ? 'wide' : ''}`}><span className="field-label">{f.label}</span>
          {f.rows ? <textarea className={f.key === 'vulnerable' || f.key === 'secure' || f.key === 'evidence' ? 'mono' : ''} rows={f.rows} value={String(draft[f.key])} onChange={e => set(f.key, e.target.value as never)} />
            : <input className={f.key === 'flagPrefix' || f.key === 'sample' || f.key === 'normal' ? 'mono' : ''} value={String(draft[f.key])} onChange={e => set(f.key, e.target.value as never)} />}
        </label>)}
        {[0, 1, 2].map(i => <label key={i} className="field wide"><span className="field-label">힌트 {i + 1}단계</span><input value={draft.hints[i]} onChange={e => set('hints', draft.hints.map((h, j) => j === i ? e.target.value : h))} /></label>)}
        <label className="field wide"><span className="field-label">판정 규칙 (rule JSON) — 조건: equals, regex(+flags), startsWith, lengthLessThan, intOutside, intAtLeast</span><textarea className="mono" rows={12} value={draft.ruleText} onChange={e => set('ruleText', e.target.value)} /></label>
        <label className="field wide"><span className="field-label">방어 실습 (defenseLab JSON) — options[].effect: fix(필수 핵심 방어) · extra(보조) · partial(내 공격만 막음) · none(효과 없음) · harmful(부작용). effect·why·variant는 학습자에게 검증 후에만 보입니다.</span><textarea className="mono" rows={12} value={draft.defenseText} onChange={e => set('defenseText', e.target.value)} /></label>
        <label className="field wide"><span className="field-label">학습 문구 (lesson JSON)</span><textarea className="mono" rows={12} value={draft.lessonText} onChange={e => set('lessonText', e.target.value)} /></label>
      </div>

      <h3>판정 미리보기</h3>
      {preview && 'error' in preview ? <p className="form-error">{preview.error}</p> : preview && <div className="table-wrap"><table className="data-table">
        <thead><tr><th scope="col">경우</th><th scope="col">입력</th><th scope="col">판정</th><th scope="col">출력</th></tr></thead>
        <tbody>{preview.rows.map(r => <tr key={r.label}><td>{r.label}</td><td><code className="mono">{r.input}</code></td><td>{r.verdict}</td><td>{r.output}</td></tr>)}</tbody>
      </table></div>}

      {errors.length > 0 && <ul className="admin-errors" role="alert">{errors.map(e => <li key={e}>{e}</li>)}</ul>}
      <div className="admin-actions">
        <button className="btn btn-primary" disabled={busy} onClick={() => { void save(); }}>{busy ? '저장 중…' : isNew ? '미션 추가' : '변경 저장'}</button>
        <button className="btn btn-ghost" onClick={() => { setDraft(null); setErrors([]); }}>닫기</button>
      </div>
    </section>}

    <section aria-labelledby="list-title">
      <h2 id="list-title" className="admin-list-title">미션 목록 ({missions.length})</h2>
      <div className="table-wrap"><table className="data-table">
        <thead><tr><th scope="col">순서</th><th scope="col">missionId</th><th scope="col">제목</th><th scope="col">분류</th><th scope="col">난이도</th><th scope="col">공개</th><th scope="col"></th></tr></thead>
        <tbody>{missions.map(m => <tr key={m.missionId}>
          <td className="num">{m.order}</td><td className="mono">{m.missionId}</td><td>{m.title}</td><td>{m.categoryId}</td><td>{m.level}</td>
          <td>{m.published ? <StatusTag state="done">공개</StatusTag> : <StatusTag state="idle">비공개</StatusTag>}</td>
          <td className="right"><button className="btn btn-secondary btn-sm" onClick={() => edit(m)}>편집</button> <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => { void remove(m); }}>삭제</button></td>
        </tr>)}</tbody>
      </table></div>
    </section>
  </main>;
}
