'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { labs, owaspCategories, categoryUrl, normalizeCompleted, completedCategories } from '@/lib/labs';
import { basePoints, maxTotalScore, normalizeRecords, totalScore, MAX_HINTS, type MissionRecord } from '@/lib/wargame';
import { logoutAction } from '@/app/actions';
import { MissionDetail } from '@/components/Wargame';
import { Meter, PageHeader, SectionHeader, StatusTag, type TagState } from '@/components/ui';

const GUEST_PROGRESS_KEY = 'secureguard-guest-progress';
const GUEST_WARGAME_KEY = 'secureguard-guest-wargame';
const labIds = labs.map(lab => lab.id) as string[];

type Tab = 'dashboard' | 'labs' | 'guide' | 'report' | 'notices';
type Lab = typeof labs[number];
type Records = Record<string, MissionRecord>;
type Notice = { _id: string; title: string; content: string; author: string; authorId: string; createdAt: string };
const nav: { id: Tab; title: string }[] = [{ id: 'dashboard', title: '대시보드' }, { id: 'labs', title: '워게임 미션' }, { id: 'guide', title: '시큐어코딩 가이드' }, { id: 'report', title: '학습 리포트' }, { id: 'notices', title: '학습 게시판' }];
const formatWhen = (iso: string) => new Date(iso).toLocaleString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });

export default function Playground({ user }: { user: { name: string; id: string } | null }) {
  const [tab, setTab] = useState<Tab>('dashboard');
  const [selected, setSelected] = useState<string | null>(null);
  const [completed, setCompleted] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [level, setLevel] = useState('전체');
  const [categoryFilter, setCategoryFilter] = useState('전체');
  const [records, setRecords] = useState<Records>({});
  const [message, setMessage] = useState('');
  const [notices, setNotices] = useState<Notice[]>([]);
  const [noticeError, setNoticeError] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<Notice | null>(null);
  const activeLab = labs.find(lab => lab.id === selected);
  const progress = Math.round(completed.length / labs.length * 100);
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        if (user) {
          const response = await fetch('/api/progress'); const data = await response.json();
          if (!response.ok) throw new Error(data.error);
          if (!cancelled) { setCompleted(normalizeCompleted(data.completed)); setRecords(normalizeRecords(data.wargame, labIds)); }
        } else {
          const stored = JSON.parse(localStorage.getItem(GUEST_PROGRESS_KEY) ?? '[]');
          if (!cancelled && Array.isArray(stored)) setCompleted(normalizeCompleted(stored));
          const storedWargame = JSON.parse(localStorage.getItem(GUEST_WARGAME_KEY) ?? '[]');
          if (!cancelled) setRecords(normalizeRecords(storedWargame, labIds));
        }
      } catch { if (!cancelled) setMessage('학습 기록을 불러오지 못했습니다. 저장소 설정을 확인하세요.'); }
    }
    void load(); return () => { cancelled = true; };
  }, [user]);
  useEffect(() => {
    if (tab !== 'notices') return;
    fetch('/api/notices').then(async response => { const data = await response.json(); if (!response.ok) throw new Error(data.error); setNotices(data.notices); if (!data.configured) setNoticeError('게시판 작성·저장은 MongoDB와 인증 설정 후 사용할 수 있습니다.'); }).catch(() => setNoticeError('게시글을 불러오지 못했습니다.'));
  }, [tab]);
  function navigate(next: Tab) { setTab(next); setSelected(null); setMessage(''); window.scrollTo({ top: 0 }); }
  function openCategory(id: string) { navigate('labs'); setCategoryFilter(id); setSearch(''); setLevel('전체'); }
  function openLab(id: string) { setSelected(id); setTab('labs'); setMessage(''); window.scrollTo({ top: 0 }); }
  function persistGuest(key: string, value: unknown) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { setMessage('브라우저 저장소에 기록하지 못했습니다.'); } }
  // Records shown on screen; for signed-in users the server already stored them.
  function updateRecord(record: MissionRecord) {
    setRecords(old => { const next = { ...old, [record.missionId]: record }; if (!user) persistGuest(GUEST_WARGAME_KEY, Object.values(next)); return next; });
  }
  function markCompleted(id: string, serverList?: string[]) {
    if (serverList) { setCompleted(normalizeCompleted(serverList)); return; }
    setCompleted(old => { const next = normalizeCompleted([...old, id]); if (!user) persistGuest(GUEST_PROGRESS_KEY, next); return next; });
  }
  const score = totalScore(records);
  const maxScore = maxTotalScore(labs.map(l => l.level));
  const hintMissions = Object.values(records).filter(r => r.hintsUsed > 0).length;
  const doneCategories = completedCategories(completed);
  async function deleteNotice(id: string) {
    setSaving(true);
    try {
      const response = await fetch('/api/notices', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setNotices(old => old.filter(n => n._id !== id));
      if (editing?._id === id) setEditing(null);
    } catch (error) { setNoticeError(error instanceof Error ? error.message : 'Delete failed'); }
    finally { setSaving(false); }
  }
  function exportReport() {
    const report = ['SecureGuard 학습 리포트', `학습자: ${user?.name ?? '게스트'}`, `생성 시각: ${new Date().toLocaleString('ko-KR')}`, '기준: OWASP Top 10:2025', `분류 완료: ${doneCategories.length} / ${owaspCategories.length}`, `실습 완료: ${completed.length} / ${labs.length}`, `워게임 점수: ${score} / ${maxScore} (미션별 최고 점수 합산)`, '', ...labs.map(l => { const r = records[l.id]; return `${completed.includes(l.id) ? '[완료]' : '[미완료]'} ${l.tag} / ${l.title}\n점수: ${r?.bestScore ? `${r.bestScore} / ${basePoints(l.level)}` : '-'} · 힌트 ${r?.hintsUsed ?? 0}/${MAX_HINTS}${r?.solvedAt ? ` · 최근 완료 ${new Date(r.solvedAt).toLocaleString('ko-KR')}` : ''}\n원인: ${l.cause}\n방어: ${l.defense}`; }), '', '진도는 공격·방어 시연 완료 기록이며, 워게임 점수는 교육용 게임 점수로 보안 역량 평가 점수가 아닙니다.'].join('\n');
    const url = URL.createObjectURL(new Blob([report], { type: 'text/plain;charset=utf-8' })); const a = document.createElement('a'); a.href = url; a.download = 'secureguard-report.txt'; a.click(); URL.revokeObjectURL(url);
  }
  const filtered = labs.filter(l => (categoryFilter === '전체' || l.categoryId === categoryFilter) && (level === '전체' || l.level === level) && `${l.title} ${l.ko} ${l.category} ${l.tag} ${owaspCategories.find(c => c.id === l.categoryId)?.ko}`.toLowerCase().includes(search.toLowerCase()));
  const nextLab = labs.find(l => !completed.includes(l.id)) ?? labs[0];
  const recent = Object.values(records).filter(r => r.solvedAt).sort((a, b) => (b.solvedAt ?? '').localeCompare(a.solvedAt ?? '')).slice(0, 6);
  const state = (id: string) => missionState(id, completed, records);
  const crumb = nav.find(n => n.id === tab)?.title;

  return <div className="app-shell">
    <aside className="sidebar">
      <Link href="/" className="brand"><strong>SecureGuard</strong><span className="brand-sub">OWASP WARGAME</span></Link>
      <nav className="nav" aria-label="주 메뉴">
        <span className="nav-label">MENU</span>
        {nav.map(item => <button key={item.id} className="nav-item" aria-current={tab === item.id ? 'page' : undefined} onClick={() => navigate(item.id)}>{item.title}{item.id === 'labs' && <span className="nav-count">{completed.length}/{labs.length}</span>}</button>)}
      </nav>
      <div className="sidebar-foot">
        <div><span className="user-name">{user?.name ?? '게스트'}</span><span className="user-meta">{user ? '계정에 진도 저장' : '이 브라우저에 진도 저장'}</span></div>
        {user ? <form action={logoutAction}><button className="btn btn-ghost btn-sm">로그아웃</button></form> : <Link href="/login" className="btn btn-secondary btn-sm">로그인</Link>}
      </div>
    </aside>

    <div className="main">
      <header className="topbar">
        <nav className="crumbs" aria-label="현재 위치"><span>SecureGuard</span><span aria-hidden="true">/</span>{activeLab && tab === 'labs' ? <><button className="link-btn" onClick={() => setSelected(null)}>{crumb}</button><span aria-hidden="true">/</span><span aria-current="page">Mission {activeLab.number}</span></> : <span aria-current="page">{crumb}</span>}</nav>
        <div className="topbar-right"><span className="topbar-note">로컬 시뮬레이션 · 실제 공격 요청 없음</span></div>
      </header>

      <main className="content">
        {message && <div className="toast" role="status">{message}<button className="btn btn-ghost btn-sm" onClick={() => setMessage('')} aria-label="알림 닫기">닫기</button></div>}

        {tab === 'dashboard' && <>
          <PageHeader eyebrow="OWASP Top 10:2025 · 워게임" title={`${user?.name ?? '게스트'}님의 학습 현황`} description="미션을 골라 공격으로 취약점을 확인하고, 방어 코드로 막히는 것까지 비교하세요. 모든 실습은 브라우저와 서버의 규칙 기반 시뮬레이션입니다." />
          <section className="summary" aria-label="학습 요약">
            <dl className="summary-figures">
              <div><dt>완료한 미션</dt><dd><b>{completed.length}</b><span>/ {labs.length}</span></dd></div>
              <div><dt>워게임 총점</dt><dd><b>{score}</b><span>/ {maxScore}</span></dd></div>
              <div><dt>완료한 분류</dt><dd><b>{doneCategories.length}</b><span>/ {owaspCategories.length}</span></dd></div>
            </dl>
            <div className="summary-progress"><span className="fine">전체 진행률 · 점수는 교육용 게임 점수이며 보안 역량 평가가 아닙니다</span><Meter value={completed.length} max={labs.length} label="전체 미션 진행률" /></div>
            <div className="summary-next">
              <div><p className="eyebrow">{progress === 100 ? '복습' : '다음 미션'} · Mission {nextLab.number}</p><h2>{nextLab.title}</h2><p>{nextLab.categoryId}:2025 {owaspCategories.find(c => c.id === nextLab.categoryId)!.ko} · {nextLab.level}</p></div>
              <button className="btn btn-primary" onClick={() => openLab(nextLab.id)}>{progress === 100 ? '다시 풀어보기' : completed.length ? '이어서 하기' : '첫 미션 시작'} →</button>
            </div>
          </section>

          <div className="dash-grid">
            <section aria-labelledby="cat-progress">
              <SectionHeader id="cat-progress" title="분류별 진행" meta={`${doneCategories.length}/${owaspCategories.length} 분류 완료`} />
              <div className="table-wrap"><table className="data-table category-table">
                <thead><tr><th scope="col">분류</th><th scope="col">이름</th><th scope="col">진행</th><th scope="col" className="right">미션</th></tr></thead>
                <tbody>{owaspCategories.map(c => {
                  const items = labs.filter(l => l.categoryId === c.id);
                  const count = items.filter(l => completed.includes(l.id)).length;
                  return <tr key={c.id}><td className="num">{c.id}</td><td><button className="row-link" onClick={() => openCategory(c.id)}>{c.ko}</button><small>{c.title}</small></td><td><Meter value={count} max={items.length} label={`${c.id} ${c.ko} 진행률`} /></td><td className="right mono">{count === items.length ? <StatusTag state="done">{count}/{items.length}</StatusTag> : `${count}/${items.length}`}</td></tr>;
                })}</tbody>
              </table></div>
            </section>
            <aside>
              <section className="side-block" aria-labelledby="recent-title">
                <SectionHeader id="recent-title" title="최근 완료" meta="FLAG 제출 기준" />
                {recent.length ? <ol className="activity-list">{recent.map(r => { const lab = labs.find(l => l.id === r.missionId)!; return <li key={r.missionId}><span className="when">{formatWhen(r.solvedAt!)}</span><button className="what row-link" onClick={() => openLab(lab.id)}>{lab.title}</button><span className="score">{r.lastScore}점</span></li>; })}</ol> : <p className="empty">아직 FLAG를 제출한 미션이 없습니다.</p>}
              </section>
              <section className="side-block" aria-labelledby="best-title">
                <SectionHeader id="best-title" title="미션별 최고 점수" meta={`${score} / ${maxScore}`} />
                <ol className="score-list">{labs.map(lab => { const r = records[lab.id]; return <li key={lab.id}><span className="num">{lab.number}</span><button className="t" onClick={() => openLab(lab.id)}>{lab.title}</button><span className="s">{r?.bestScore ? <><b>{r.bestScore}</b>/{basePoints(lab.level)}</> : completed.includes(lab.id) ? '이전 기록' : '—'}</span></li>; })}</ol>
              </section>
            </aside>
          </div>
        </>}

        {tab === 'labs' && !activeLab && <>
          <PageHeader eyebrow="OWASP Top 10:2025 · 12 missions" title="워게임 미션" description={`취약점의 원리를 읽고, 공격으로 FLAG를 찾고, 방어 모드로 같은 입력이 막히는지 확인하세요. 최대 ${maxScore}점.`} />
          <div className="toolbar">
            <div className="segmented" role="group" aria-label="난이도">{['전체', '입문', '중급'].map(value => <button aria-pressed={value === level} onClick={() => setLevel(value)} key={value}>{value}</button>)}</div>
            <select aria-label="OWASP 분류 선택" value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}><option value="전체">전체 분류</option>{owaspCategories.map(c => <option key={c.id} value={c.id}>{c.id} · {c.ko}</option>)}</select>
            <input type="search" aria-label="미션 검색" placeholder="미션 이름, 유형 검색" value={search} onChange={e => setSearch(e.target.value)} />
            <span className="toolbar-count" aria-live="polite">{filtered.length}개 미션</span>
          </div>
          {owaspCategories.map(category => {
            const items = filtered.filter(lab => lab.categoryId === category.id);
            if (!items.length) return null;
            return <section className="mission-group" key={category.id} aria-labelledby={`g-${category.id}`}>
              <div className="group-head"><span className="group-code">{category.id}</span><h2 id={`g-${category.id}`}>{category.ko}<small>{category.title}</small></h2><a href={categoryUrl(category)} target="_blank" rel="noopener noreferrer">OWASP 문서 ↗</a><p>{category.summary}</p></div>
              <ol>{items.map(lab => <li key={lab.id}><MissionRow lab={lab} record={records[lab.id]} status={state(lab.id)} onOpen={() => openLab(lab.id)} /></li>)}</ol>
            </section>;
          })}
          {!filtered.length && <p className="empty">조건에 맞는 미션이 없습니다. 필터나 검색어를 바꿔 보세요.</p>}
          <p className="note">학습 범위: OWASP Top 10:2025의 10개 분류를 모두 다룹니다. A01은 접근 제어·CSRF, A05는 SQL Injection·XSS를 포함해 12개 대표 시나리오로 구성했으며, 각 분류의 모든 취약점 변형을 구현한 것은 아닙니다.</p>
        </>}

        {tab === 'labs' && activeLab && <MissionDetail key={activeLab.id} lab={activeLab} signedIn={Boolean(user)} record={records[activeLab.id]} done={completed.includes(activeLab.id)} nextLab={nextMissionAfter(activeLab.id, completed)} onBack={() => setSelected(null)} onOpen={openLab} onRecord={updateRecord} onCompleted={markCompleted} />}

        {tab === 'guide' && <>
          <PageHeader eyebrow="Secure coding handbook" title="시큐어코딩 가이드" description="OWASP Top 10:2025의 10개 분류와 12개 대표 시나리오의 발생 원인과 방어 코드를 정리했습니다." />
          <div className="guide-list">{labs.map(lab => <section className="guide-row" key={lab.id}>
            <button className="guide-toggle" aria-expanded={expanded === lab.id} onClick={() => setExpanded(expanded === lab.id ? null : lab.id)}><span className="code">{lab.categoryId}:2025</span><span><strong>{lab.title}</strong><small>{lab.ko}</small></span><span className="sign" aria-hidden="true">{expanded === lab.id ? '−' : '+'}</span></button>
            {expanded === lab.id && <div className="guide-body"><div><h3>발생 원인</h3><p>{lab.cause}</p></div><div><h3>시큐어코딩 원칙</h3><p>{lab.defense}</p></div><div className="span"><pre className="code"><code>{lab.secure}</code></pre></div><div className="span"><button className="btn btn-secondary btn-sm" onClick={() => openLab(lab.id)}>이 미션 풀어보기 →</button></div></div>}
          </section>)}</div>
          <p className="note">기준 자료: 팀 프로젝트 회의록 · 웹보안프로그래밍 1~7주차 수업 · <a className="link-btn" href="https://top10.owasp.org/2025/" target="_blank" rel="noopener noreferrer">OWASP Top 10:2025 공식 문서 ↗</a></p>
        </>}

        {tab === 'report' && <article className="report-doc">
          <PageHeader eyebrow={`Learning report · ${new Date().toLocaleDateString('ko-KR')}`} title={`${user?.name ?? '게스트'}님의 학습 리포트`} description={user ? '계정에 저장된 공격·방어 실습과 워게임 기록입니다.' : '이 브라우저에 저장된 게스트 기록입니다. 로그인 계정으로 자동 이전되지 않습니다.'} actions={<button className="btn btn-secondary" onClick={exportReport}>텍스트 리포트 다운로드</button>} />

          <section className="report-section" aria-labelledby="r1"><h2 id="r1"><span className="mono">01</span>요약</h2>
            <dl className="report-summary">
              <div><dt>미션 완료</dt><dd>{completed.length} / {labs.length} ({progress}%)</dd></div>
              <div><dt>분류 완료</dt><dd>{doneCategories.length} / {owaspCategories.length}</dd></div>
              <div><dt>워게임 총점</dt><dd>{score} / {maxScore}</dd></div>
              <div><dt>힌트 사용 미션</dt><dd>{hintMissions}개</dd></div>
              <div><dt>다음 목표</dt><dd>{progress === 100 ? '복습' : `Mission ${nextLab.number} ${nextLab.title}`}</dd></div>
              <div><dt>기준</dt><dd>OWASP Top 10:2025</dd></div>
            </dl>
            <p className="fine" style={{ marginTop: 12 }}>진도는 공격·방어 비교 완료 기록이며, 점수는 교육용 게임 점수로 보안 역량 평가가 아닙니다.</p>
          </section>

          <section className="report-section" aria-labelledby="r2"><h2 id="r2"><span className="mono">02</span>미션 기록</h2>
            <div className="table-wrap"><table className="data-table">
              <thead><tr><th scope="col">#</th><th scope="col">미션</th><th scope="col">힌트</th><th scope="col" className="right">최고 점수</th><th scope="col">최근 완료</th><th scope="col">상태</th></tr></thead>
              <tbody>{labs.map(lab => { const r = records[lab.id]; const s = state(lab.id); return <tr key={lab.id}>
                <td className="num">{lab.number}</td>
                <td><button className="row-link" onClick={() => openLab(lab.id)}>{lab.title}</button><small>{lab.categoryId}:2025 · {lab.category}</small></td>
                <td className="mono">{r?.hintsUsed ?? 0}/{MAX_HINTS}</td>
                <td className="right mono">{r?.bestScore ? `${r.bestScore}/${basePoints(lab.level)}` : '—'}</td>
                <td className="mono">{r?.solvedAt ? formatWhen(r.solvedAt) : '—'}</td>
                <td><StatusTag state={s.state}>{s.label}</StatusTag></td>
              </tr>; })}</tbody>
            </table></div>
          </section>

          <section className="report-section" aria-labelledby="r3"><h2 id="r3"><span className="mono">03</span>취약점별 결과</h2>
            {labs.filter(l => completed.includes(l.id)).length ? labs.filter(l => completed.includes(l.id)).map(lab => <div className="finding" key={lab.id}>
              <span className="code">{lab.categoryId}:2025</span>
              <div><h3>{lab.title} <small className="fine">· {lab.ko}</small></h3><p><b>원인</b>{lab.cause}</p><p><b>방어</b>{lab.defense}</p></div>
            </div>) : <p className="empty">완료한 미션이 생기면 취약점별 원인과 방어 방법이 여기에 정리됩니다.</p>}
          </section>
        </article>}

        {tab === 'notices' && <>
          <PageHeader eyebrow="Learn together" title="학습 게시판" description="실습하며 발견한 내용과 학습 노트를 팀원들과 나누세요." />
          <div className="notice-layout">
            <section className="notice-list" aria-label="게시글 목록">
              <article className="notice-pinned"><span className="notice-meta">공지 · SecureGuard</span><h2>시큐어가드 실습실에 오신 것을 환영합니다.</h2><p>미션에서 공격 모드와 방어 모드를 비교하고, 유출 데이터에서 찾은 FLAG를 제출하면 학습 리포트에 기록됩니다. 실습용 입력만 사용하고 개인정보나 실제 비밀번호는 입력하지 마세요.</p></article>
              {noticeError && <p className="fine" role="status">{noticeError}</p>}
              {notices.map(notice => <article key={notice._id}><span className="notice-meta">{notice.author} · {new Date(notice.createdAt).toLocaleDateString('ko-KR')}</span><h2>{notice.title}</h2><p>{notice.content}</p>{user?.id === notice.authorId && <div className="notice-actions"><button className="btn btn-secondary btn-sm" onClick={() => setEditing(notice)}>수정</button><button className="btn btn-ghost btn-sm" disabled={saving} onClick={() => { void deleteNotice(notice._id); }}>삭제</button></div>}</article>)}
              {!notices.length && <p className="empty">첫 번째 학습 노트를 남겨보세요.</p>}
            </section>
            <form key={editing?._id ?? 'new'} className="notice-form" onSubmit={async event => { event.preventDefault(); const form = event.currentTarget; const data = new FormData(form); setSaving(true); setNoticeError(''); try { const response = await fetch('/api/notices', { method: editing ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: editing?._id, title: data.get('title'), content: data.get('content') }) }); const body = await response.json(); if (!response.ok) throw new Error(body.error); setNotices(old => editing ? old.map(n => n._id === editing._id ? body.notice : n) : [body.notice, ...old]); setEditing(null); form.reset(); } catch (error) { setNoticeError(error instanceof Error ? error.message : '저장 실패'); } finally { setSaving(false); } }}>
              <h2>{editing ? '학습 노트 수정' : '학습 노트 작성'}</h2>
              <label className="field"><span className="field-label">제목</span><input name="title" defaultValue={editing?.title ?? ''} required maxLength={100} placeholder="어떤 내용을 배웠나요?" /></label>
              <label className="field"><span className="field-label">내용</span><textarea name="content" defaultValue={editing?.content ?? ''} required maxLength={5000} rows={8} placeholder="실습 과정과 배운 내용을 공유하세요." /></label>
              <button className="btn btn-primary btn-block" disabled={!user || saving}>{saving ? '저장 중…' : editing ? '수정 내용 저장' : '게시글 등록'}</button>
              {editing && <button type="button" className="btn btn-secondary btn-block" onClick={() => setEditing(null)}>수정 취소</button>}
              {!user && <p className="fine"><Link className="link-btn" href="/login">로그인</Link> 후 작성할 수 있습니다.</p>}
            </form>
          </div>
        </>}

        <footer className="site-footer"><span>SecureGuard · 웹 보안 학습 워게임</span><span>중부대학교 웹보안프로그래밍 · Team 시큐어가드</span></footer>
      </main>
    </div>
  </div>;
}

function missionState(id: string, completed: string[], records: Records): { state: TagState; label: string } {
  const r = records[id];
  if (completed.includes(id)) return { state: 'done', label: r?.clears ? 'FLAG 획득' : '학습 완료' };
  if (r && (r.hintsUsed || r.attackVerified || r.defenseVerified || r.wrongSubmissions)) return { state: 'active', label: '진행 중' };
  return { state: 'idle', label: '시작 전' };
}
function MissionRow({ lab, record, status, onOpen }: { lab: Lab; record?: MissionRecord; status: { state: TagState; label: string }; onOpen: () => void }) {
  return <button className={`mission-row ${status.state === 'done' ? 'is-done' : ''}`} onClick={onOpen}>
    <span className="num">{lab.number}</span>
    <span><strong>{lab.title}</strong><span className="desc">{lab.description}</span></span>
    <span className="lvl">{lab.level}</span>
    <StatusTag state={status.state}>{status.label}</StatusTag>
    <span className="pts">{record?.bestScore ? <><b>{record.bestScore}</b>/{basePoints(lab.level)}</> : <>{basePoints(lab.level)}점</>}{record?.hintsUsed ? <small>힌트 {record.hintsUsed}단계</small> : null}</span>
  </button>;
}
function nextMissionAfter(id: string, completed: string[]) {
  const index = labs.findIndex(l => l.id === id);
  const ordered = [...labs.slice(index + 1), ...labs.slice(0, index)];
  return ordered.find(l => !completed.includes(l.id)) ?? ordered[0] ?? null;
}
