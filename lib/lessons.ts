// Types and shared defaults for the guided-learning content of a mission.
// The content itself is stored per mission in MongoDB (missions.lesson); the initial
// version lives in data/missions.seed.json and is checked by tests/lessons.test.mjs.

export type QuizOption = { text: string; correct?: true; why: string };
export type Lesson = {
  goal: string;
  scenario: string;
  terms: { term: string; plain: string }[];
  concept: { what: string; why: string; when: string; check: string; more: string };
  /** `sample` (explanation of the attack example) is server-only and stripped before reaching the browser. */
  input: { field: string; sample?: string; normal: string };
  attack: { happened: string; meaning: string; next: string };
  /** What a non-attack (normal) result means for this mission. */
  normal: string;
  defense: { diff: string; check: string; compare: string; result: string };
  quiz: { question: string; options: QuizOption[] };
  takeaway: string;
  /** Mission-specific content for the 5-step guided screen; shared parts fall back to defaults (resolveGuided). */
  guided?: GuidedSource;
};
type Opt = 'brief' | 'situation' | 'goal' | 'todo' | 'customNote' | 'defenseBefore' | 'flagWhere' | 'howto';
export type GuidedSource = Omit<GuidedContent, Opt | 'observe'> & Partial<Pick<GuidedContent, Opt>> & {
  observe: Pick<GuidedContent['observe'], 'success' | 'why'> & Partial<GuidedContent['observe']>;
};
export type GuidedContent = {
  brief: string;
  situation: string;
  goal: string;
  todo: string[];
  modes: { attack: string; defense: string };
  /** How the simulation judges input — must match the mission's rule. */
  rule: string;
  customNote: string;
  observe: { success: string[]; why: string; dataNote: string; normal: string[] };
  defenseBefore: string;
  defenseObserve: string[];
  codeDiff: { added: string; explain: string };
  /** Label for a blocked attack in defense mode (default 차단됨), e.g. 탐지·대응 for logging. */
  blockedLabel?: string;
  flagWhere: string;
  howto: string[][];
};

const DEFAULT_HOWTO = [
  ['설명을 위에서부터 읽으세요. 모르는 단어는 ‘용어 풀이’를 펼쳐 보세요.', '다 읽었으면 ‘실습 시작’을 누르세요.'],
  ['입력란에 값을 넣으면 “서버가 받는 모습”에 입력이 어디에 들어가는지 바로 보입니다.', '결과를 예상해 본 뒤 실행하세요. 실패해도 감점이 없으니 여러 번 시도해도 됩니다.', '‘공격 예제 입력’은 값을 채우기만 하고 실행하지 않습니다. 사용하면 힌트 3단계로 기록되어 감점됩니다.'],
  ['판정 결과가 “공격 성공”인지 먼저 보세요.', '실패했다면 ‘다시 시도하기’를 눌러 다른 값을 넣어 보세요. 막히면 ‘판정 규칙 보기’를 열 수 있습니다.', '성공했다면 ‘확인할 것’ 목록을 하나씩 확인한 뒤 ‘직접 방어하기’로 넘어가세요.'],
  ['방어책 목록에서 이 공격을 막는 데 필요하다고 생각하는 것을 모두 고르세요.', '‘패치 적용 후 재공격’을 누르면 내 공격·변형된 공격·정상 요청 세 가지로 검증합니다. 공격은 막히고 정상 요청은 통과해야 성공입니다.', '고른 방어책마다 효과(핵심 방어, 불완전한 방어, 효과 없음, 부작용)와 이유가 표시됩니다. 고쳐서 몇 번이든 다시 검증할 수 있고, 감점은 없습니다.'],
  ['‘결과 데이터 다시 보기’를 펼쳐 SG{…} 형식의 문자열을 찾으세요.', '찾은 문자열을 그대로 입력하고 ‘FLAG 제출’을 누르세요. 틀리면 감점되지만 형식 오류는 감점되지 않습니다. FLAG는 사용자마다 다릅니다.'],
];
const SIM = '이 실습은 정해진 규칙으로 결과를 판정하는 시뮬레이션이며, 실제 서버나 데이터베이스에 요청을 보내지 않습니다.';

/**
 * Fills the shared parts of a mission's guided content from its lesson text.
 * Missions created on /admin without `guided` still get a complete (generic) screen.
 */
export function resolveGuided(lesson: Lesson): GuidedContent {
  const g: GuidedSource = lesson.guided ?? {
    modes: {
      attack: `보안 검증이 빠진 상황을 가정하고 입력이 어떻게 처리되는지 실습합니다. ${lesson.defense.diff}`,
      defense: `보안 검증을 적용했을 때 같은 입력이 어떻게 처리되는지 비교합니다. 적용되는 검증: ${lesson.defense.check}`,
    },
    rule: `${SIM} ${lesson.concept.check}`,
    observe: { success: ['판정이 “공격 성공”으로 표시되었는지', '“시스템이 처리한 결과”에 어떤 동작이 일어났는지', lesson.attack.meaning], why: lesson.attack.happened },
    defenseObserve: ['같은 입력의 판정이 “공격 성공”에서 “차단됨”으로 바뀌었는지', lesson.defense.compare],
    codeDiff: { added: '', explain: lesson.defense.result },
  };
  return {
    ...g,
    brief: g.brief ?? lesson.concept.what,
    situation: g.situation ?? lesson.scenario,
    goal: g.goal ?? lesson.goal,
    todo: g.todo ?? ['취약한 상황에서 공격이 성립하는 입력을 실행합니다.', '시스템이 돌려준 결과를 읽고 무엇이 문제인지 확인합니다.', '같은 입력으로 방어 모드를 실행해 결과를 비교합니다.', '공격 결과에서 찾은 FLAG를 제출합니다.'],
    customNote: g.customNote ?? '직접 입력한 값입니다. 실행하면 위에 설명된 판정 규칙에 따라 결과가 정해집니다.',
    defenseBefore: g.defenseBefore ?? `3단계에서 공격에 성공한 값을 그대로 다시 보냅니다. ${lesson.defense.diff}`,
    flagWhere: g.flagWhere ?? '공격 모드에서 성공했을 때 함께 표시된 “결과 데이터” 안에 SG{…} 형식의 문자열로 들어 있습니다. FLAG는 사용자마다 다르게 발급됩니다.',
    howto: g.howto ?? DEFAULT_HOWTO,
    observe: {
      ...g.observe,
      dataNote: g.observe.dataNote ?? '결과 데이터는 이 시뮬레이션에 미리 준비된 가상 응답입니다. 그 안의 FLAG는 지금 로그인한 사용자(또는 이 브라우저의 게스트)에게만 발급된 값입니다.',
      normal: g.observe.normal ?? ['판정이 “공격 아님”으로 표시되었는지', '시스템이 처리한 결과가 정상 처리 내용인지', '아래 “왜 이런 결과가 나왔나요?”에서 공격이 성립하지 않은 이유를 확인하세요'],
    },
  };
}
