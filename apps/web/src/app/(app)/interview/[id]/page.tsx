"use client";

import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthUser } from "@/lib/useAuthUser";
import { useSettingsContext } from "@/lib/SettingsContext";
import { useRouteParams } from "@/lib/useRouteParams";
import { SignInButton } from "@/components/SignInButton";
import { callInterviewAi } from "@/lib/interviewAi";
import {
  buildNextTurnPrompt,
  buildQuestionPlanPrompt,
  buildTranslatePrompt,
  parseNextTurn,
  parseQuestionPlan,
  parseTranslation,
} from "@/lib/interviewPrompts";
import { answeredMainIndexes, buildReportPrompt, parseReport } from "@/lib/interviewReportPrompt";
import {
  completeInterviewSession,
  deleteInterviewSession,
  getInterviewSession,
  saveInterviewPlan,
  saveInterviewTurns,
} from "@/lib/interviewSessions";
import {
  canFollowUp,
  initialInterviewState,
  interviewReducer,
  resumeIndex,
  type InterviewState,
} from "@/lib/interviewMachine";
import { useInterviewAudio } from "@/lib/useInterviewAudio";
import { useRecorder, type RecordedAudio } from "@/lib/useRecorder";
import { transcribeAudio } from "@/lib/transcribeAudioClient";
import { warmUpSpeech } from "@/lib/warmUpSpeechClient";
import {
  INTERVIEW_CLOSING,
  INTERVIEW_GREETING,
  INTERVIEW_LEVELS,
  INTERVIEW_TYPES,
  MAX_ANSWER_SECONDS,
  type InterviewReport,
  type InterviewSession,
  type InterviewTurn,
} from "@/lib/interviewTypes";
import { SessionThread } from "@/components/interview/SessionThread";
import { SessionDock } from "@/components/interview/SessionDock";
import { InterviewerCard, type InterviewerTone } from "@/components/interview/InterviewerCard";
import { StarTips } from "@/components/interview/StarTips";

const QUESTION_VISIBLE = new Set<InterviewState["phase"]>(["speaking", "idle", "recording", "transcribing", "sttError", "review"]);

function interviewerStatus(state: InterviewState): { text: string; tone: InterviewerTone } {
  switch (state.phase) {
    case "speaking":
    case "closing":
      return { text: "Đang nói", tone: "speaking" };
    case "recording":
      return { text: "Đang lắng nghe", tone: "listening" };
    case "warming":
      return { text: "Đang khởi động", tone: "thinking" };
    case "transcribing":
    case "processing":
    case "grading":
      return { text: "Đang suy nghĩ", tone: "thinking" };
    default:
      return { text: "Đang chờ bạn trả lời", tone: "neutral" };
  }
}

export default function InterviewSessionPage({ params }: { params: Promise<{ id: string }> }) {
  const resolved = useRouteParams(params);
  const id = resolved?.id ?? null;
  const router = useRouter();
  const { user, loading: authLoading } = useAuthUser();
  const { settings } = useSettingsContext();
  const [session, setSession] = useState<InterviewSession | null>(null);
  const [missing, setMissing] = useState(false);
  const [turns, setTurns] = useState<InterviewTurn[]>([]);
  const [translation, setTranslation] = useState<{ question: string; vi: string } | null>(null);
  const [translating, setTranslating] = useState(false);
  const [state, dispatch] = useReducer(interviewReducer, initialInterviewState);
  const turnsRef = useRef<InterviewTurn[]>([]);
  const recordingRef = useRef<RecordedAudio | null>(null);
  const handledRef = useRef<InterviewState | null>(null);
  const audio = useInterviewAudio(session?.setup.voice ?? "male2");
  const { start: startRecorder, stop: stopRecorder, cancel: cancelRecorder, elapsed, error: micError } = useRecorder();

  useEffect(() => {
    if (!user || !id) return;
    let cancelled = false;
    void warmUpSpeech();
    getInterviewSession(user.uid, id)
      .then((s) => {
        if (cancelled) return;
        if (!s) {
          setMissing(true);
        } else if (s.status === "completed") {
          router.replace(`/interview/${id}/report`);
        } else {
          turnsRef.current = s.turns;
          setTurns(s.turns);
          setSession(s);
        }
      })
      .catch(() => {
        if (!cancelled) setMissing(true);
      });
    return () => {
      cancelled = true;
    };
  }, [user, id, router]);

  const appendTurn = useCallback(
    (turn: InterviewTurn) => {
      const next = [...turnsRef.current, turn];
      turnsRef.current = next;
      setTurns(next);
      if (user && id) void saveInterviewTurns(user.uid, id, next).catch(() => {});
    },
    [user, id]
  );

  // One side effect per state transition. handledRef makes this idempotent
  // under StrictMode's double effect run and when unrelated deps change.
  useEffect(() => {
    if (!session || !settings || !user || !id) return;
    if (handledRef.current === state) return;
    handledRef.current = state;
    const uid = user.uid;

    switch (state.phase) {
      case "warming": {
        if (state.notice) return;
        if (session.plan.length > 0) {
          dispatch({ type: "PLAN_READY", plan: session.plan, startIndex: resumeIndex(turnsRef.current) });
          return;
        }
        void (async () => {
          const greeting = audio.speak(INTERVIEW_GREETING);
          try {
            const raw = await callInterviewAi(settings, buildQuestionPlanPrompt(session.setup));
            const plan = parseQuestionPlan(raw, session.setup.questionCount);
            await saveInterviewPlan(uid, id, plan);
            setSession((s) => (s ? { ...s, plan } : s));
            await greeting;
            dispatch({ type: "PLAN_READY", plan });
          } catch {
            dispatch({ type: "PLAN_FAILED" });
          }
        })();
        return;
      }
      case "speaking": {
        void (async () => {
          const ok =
            state.kind === "main"
              ? await audio.playPrefetched(`main-${state.mainIndex}`, state.question)
              : await audio.speak(state.question);
          dispatch({ type: "SPEECH_ENDED", ttsFailed: !ok });
        })();
        return;
      }
      case "idle": {
        const next = state.plan[state.mainIndex + 1];
        if (next) audio.prefetch(`main-${state.mainIndex + 1}`, next);
        return;
      }
      case "transcribing": {
        const review = session.setup.reviewTranscript;
        void (async () => {
          const rec = recordingRef.current;
          if (!rec) {
            dispatch({ type: "TRANSCRIBED", text: "", review });
            return;
          }
          try {
            dispatch({ type: "TRANSCRIBED", text: await transcribeAudio(rec.blob), review });
          } catch {
            dispatch({ type: "TRANSCRIBE_FAILED" });
          }
        })();
        return;
      }
      case "processing": {
        appendTurn({
          mainIndex: state.mainIndex,
          kind: state.kind,
          question: state.question,
          answer: state.draft.trim(),
          skipped: false,
          answerSeconds: recordingRef.current?.seconds ?? 0,
        });
        recordingRef.current = null;
        if (!canFollowUp(state)) {
          dispatch({ type: "NEXT_MAIN" });
          return;
        }
        void (async () => {
          try {
            const exchanges = turnsRef.current
              .filter((t) => t.mainIndex === state.mainIndex && !t.skipped)
              .map((t) => ({ question: t.question, answer: t.answer }));
            const raw = await callInterviewAi(
              settings,
              buildNextTurnPrompt({
                setup: session.setup,
                mainQuestion: state.plan[state.mainIndex],
                exchanges,
                nextMainQuestion: state.plan[state.mainIndex + 1] ?? null,
              })
            );
            const decision = parseNextTurn(raw);
            if (decision.action === "follow_up") {
              dispatch({ type: "FOLLOW_UP", question: decision.say });
              return;
            }
            if (decision.ack) await audio.speak(decision.ack);
          } catch {
            // Spec §8: a failed next-turn decision never blocks the interview.
          }
          dispatch({ type: "NEXT_MAIN" });
        })();
        return;
      }
      case "closing": {
        void audio.speak(INTERVIEW_CLOSING).then(() => dispatch({ type: "CLOSING_ENDED" }));
        return;
      }
      case "grading": {
        void (async () => {
          const finalTurns = turnsRef.current;
          const answered = answeredMainIndexes(finalTurns);
          if (answered.length === 0) {
            await deleteInterviewSession(uid, id).catch(() => {});
            router.push("/interview");
            return;
          }
          let report: InterviewReport | null = null;
          try {
            report = parseReport(
              await callInterviewAi(settings, buildReportPrompt(session.setup, state.plan, finalTurns)),
              answered
            );
          } catch {
            report = null;
          }
          await saveInterviewTurns(uid, id, finalTurns).catch(() => {});
          await completeInterviewSession(uid, id, report).catch(() => {});
          router.push(`/interview/${id}/report`);
        })();
        return;
      }
      default:
        return;
    }
  }, [state, session, settings, user, id, audio, appendTurn, router]);

  const handleStop = useCallback(async () => {
    const rec = await stopRecorder();
    if (!rec) return;
    recordingRef.current = rec;
    dispatch({ type: "STOP_RECORDING" });
  }, [stopRecorder]);

  useEffect(() => {
    if (state.phase === "recording" && elapsed >= MAX_ANSWER_SECONDS) void handleStop();
  }, [state.phase, elapsed, handleStop]);

  if (authLoading || (user && !resolved)) return <p>Đang tải…</p>;
  if (!user) {
    return (
      <div>
        <h2 className="scr-title">Phỏng vấn tiếng Anh</h2>
        <p className="scr-sub">Đăng nhập để tiếp tục.</p>
        <SignInButton />
      </div>
    );
  }
  if (missing) {
    return (
      <div>
        <h2 className="scr-title">Không tìm thấy buổi phỏng vấn</h2>
        <button type="button" className="btn-secondary" onClick={() => router.push("/interview")}>Về trang Phỏng vấn</button>
      </div>
    );
  }
  if (!session) return <p>Đang tải…</p>;
  if (state.phase === "grading") {
    return (
      <div className="iv-grading" role="status">
        <h2 className="scr-title">Đang chấm bài…</h2>
        <p className="scr-sub">AI đang đọc lại các câu trả lời của bạn. Thường mất 10–30 giây.</p>
      </div>
    );
  }

  async function handleStart() {
    audio.stop();
    if (await startRecorder()) dispatch({ type: "START_RECORDING" });
  }

  function handleSkipSpeech() {
    dispatch({ type: "SPEECH_ENDED" });
    audio.stop();
  }

  function handleSkip() {
    audio.stop();
    cancelRecorder();
    recordingRef.current = null;
    appendTurn({ mainIndex: state.mainIndex, kind: state.kind, question: state.question, answer: "", skipped: true, answerSeconds: 0 });
    dispatch({ type: "SKIP" });
  }

  function handleEnd() {
    audio.stop();
    cancelRecorder();
    if (state.phase === "review" && state.draft.trim()) {
      appendTurn({
        mainIndex: state.mainIndex,
        kind: state.kind,
        question: state.question,
        answer: state.draft.trim(),
        skipped: false,
        answerSeconds: recordingRef.current?.seconds ?? 0,
      });
    }
    dispatch({ type: "END_EARLY" });
  }

  async function handleTranslate() {
    if (!settings) return;
    const question = state.question;
    setTranslating(true);
    try {
      setTranslation({ question, vi: parseTranslation(await callInterviewAi(settings, buildTranslatePrompt(question))) });
    } catch {
      setTranslation({ question, vi: "Không dịch được — thử lại sau." });
    }
    setTranslating(false);
  }

  const typeLabel = INTERVIEW_TYPES.find((t) => t.id === session.setup.type)?.label ?? session.setup.type;
  const levelLabel = INTERVIEW_LEVELS.find((l) => l.id === session.setup.level)?.label ?? session.setup.level;
  const total = state.plan.length || session.setup.questionCount;
  const status = interviewerStatus(state);

  return (
    <div className="iv-session">
      <header className="iv-session-head">
        <button type="button" className="btn-secondary" onClick={handleEnd}>Kết thúc buổi</button>
        <div className="iv-session-title">
          <strong>{`${session.setup.role} · ${typeLabel} · ${levelLabel}`}</strong>
          <span className="iv-muted">{`Câu ${Math.min(state.mainIndex + 1, total)} / ${total}`}</span>
          <div className="iv-progress" aria-hidden="true">
            {Array.from({ length: total }, (_, i) => (
              <span key={i} className={i < state.mainIndex ? "done" : i === state.mainIndex ? "current" : undefined} />
            ))}
          </div>
        </div>
      </header>

      <div className="iv-session-body">
        <SessionThread
          turns={turns}
          question={state.question}
          kind={state.kind}
          showQuestion={QUESTION_VISIBLE.has(state.phase) && state.question.length > 0}
          translation={translation && translation.question === state.question ? translation.vi : null}
          translating={translating}
          onReplay={() => dispatch({ type: "REPLAY" })}
          onTranslate={() => void handleTranslate()}
          replayDisabled={state.phase !== "idle"}
        />
        <aside className="iv-session-side">
          <InterviewerCard statusText={status.text} tone={status.tone} />
          {(session.setup.type === "behavioral" || session.setup.type === "mixed") && <StarTips />}
          <p className="iv-note">Nhận xét chi tiết từng câu (ngữ pháp, từ vựng, cấu trúc) sẽ có ở cuối buổi.</p>
        </aside>
      </div>

      <SessionDock
        state={state}
        elapsed={elapsed}
        micError={micError === "denied"}
        onStart={() => void handleStart()}
        onStop={() => void handleStop()}
        onSend={() => dispatch({ type: "SEND" })}
        onEditDraft={(text) => dispatch({ type: "EDIT_DRAFT", text })}
        onRetryTranscribe={() => dispatch({ type: "RETRY_TRANSCRIBE" })}
        onSkip={handleSkip}
        onSkipSpeech={handleSkipSpeech}
        onReplay={() => dispatch({ type: "REPLAY" })}
        onRetryPlan={() => dispatch({ type: "RETRY_PLAN" })}
      />
    </div>
  );
}
