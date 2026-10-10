"use client";

import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthUser } from "@/lib/useAuthUser";
import { useSettingsContext } from "@/lib/SettingsContext";
import { useRouteParams } from "@/lib/useRouteParams";
import { SignInButton } from "@/components/SignInButton";
import { callInterviewAi } from "@/lib/interviewAi";
import {
  buildCondensePrompt,
  buildConversationTranslatePrompt,
  buildHintPrompt,
  buildOpeningPrompt,
  buildReplyPrompt,
  buildSuggestPrompt,
  parseCondense,
  parseConversationTranslation,
  parseHint,
  parseOpening,
  parseReply,
  parseSuggest,
} from "@/lib/conversationPrompts";
import { InterviewAiError } from "@/lib/interviewPrompts";
import { buildConversationReportPrompt, parseConversationReport, userMessageIndexes } from "@/lib/conversationReportPrompt";
import { planCondense, unsummarizedWindow } from "@/lib/conversationHistory";
import {
  completeConversationSession,
  deleteConversationSession,
  getConversationSession,
  saveConversationProgress,
  type ConversationProgress,
} from "@/lib/conversationSessions";
import {
  canSend,
  conversationReducer,
  initialConversationState,
  isScenarioComplete,
  joinSegments,
  replyFlags,
  type ConversationState,
} from "@/lib/conversationMachine";
import { MAX_USER_TURNS, userTurnCount, type ConversationMessage, type ConversationReport, type ConversationSession } from "@/lib/conversationTypes";
import { MAX_ANSWER_SECONDS } from "@/lib/interviewTypes";
import { useInterviewAudio } from "@/lib/useInterviewAudio";
import { useRecorder, type RecordedAudio } from "@/lib/useRecorder";
import { conversationSttPrompt } from "@/lib/sttPrompt";
import { transcribeAudio } from "@/lib/transcribeAudioClient";
import { warmUpSpeech } from "@/lib/warmUpSpeechClient";
import { clearOtherSessions, conversationRecordingKey, saveRecordings } from "@/lib/recordedAudioStore";
import { ChatThread } from "@/components/conversation/ChatThread";
import { Composer } from "@/components/conversation/Composer";
import { GoalChecklist } from "@/components/conversation/GoalChecklist";

const RECORDING_START_PHASES = new Set<ConversationState["phase"]>(["idle", "sttError", "review"]);

export default function ConversationSessionPage({ params }: { params: Promise<{ id: string }> }) {
  const resolved = useRouteParams(params);
  const id = resolved?.id ?? null;
  const router = useRouter();
  const { user, loading: authLoading } = useAuthUser();
  const { settings } = useSettingsContext();
  const [session, setSession] = useState<ConversationSession | null>(null);
  const [missing, setMissing] = useState(false);
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [goalsDone, setGoalsDone] = useState<number[]>([]);
  const [translations, setTranslations] = useState<Record<number, string>>({});
  const [translatingIndex, setTranslatingIndex] = useState<number | null>(null);
  const [hintLoadingIndex, setHintLoadingIndex] = useState<number | null>(null);
  const [helperError, setHelperError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<string[] | null>(null);
  const [suggesting, setSuggesting] = useState(false);
  const [openingError, setOpeningError] = useState<string | null>(null);
  const [state, dispatch] = useReducer(conversationReducer, initialConversationState);
  const messagesRef = useRef<ConversationMessage[]>([]);
  const goalsDoneRef = useRef<number[]>([]);
  const summaryRef = useRef("");
  const summarizedRef = useRef(0);
  const condensingRef = useRef(false);
  const recordingRef = useRef<RecordedAudio | null>(null);
  // Blobs of the voice segments (successfully transcribed) that make up the
  // user message being composed; saved to the in-memory recordedAudioStore
  // when the message is appended. Side channel only — never persisted.
  const pendingBlobsRef = useRef<Blob[]>([]);
  const handledRef = useRef<ConversationState | null>(null);
  const stoppingRef = useRef(false);
  const unmountedRef = useRef(false);
  const audio = useInterviewAudio(session?.setup.voice ?? "female1");
  const { start: startRecorder, stop: stopRecorder, cancel: cancelRecorder, elapsed, error: micError } = useRecorder();

  // Mirrors `state.phase` for handleStart's post-await check (see the
  // interview session page for why reading `state.phase` there is stale).
  const phaseRef = useRef(state.phase);
  phaseRef.current = state.phase;

  // Reset on every (re)mount: StrictMode's simulated unmount would otherwise
  // leave a permanent `true` that turns every later router.push into a no-op.
  useEffect(() => {
    unmountedRef.current = false;
    return () => {
      unmountedRef.current = true;
    };
  }, []);

  // Free the in-memory voice recordings of earlier sessions of this feature.
  // Not done on the report page: it must still play its own session's audio.
  useEffect(() => {
    if (id) clearOtherSessions("conversation:", id);
  }, [id]);

  useEffect(() => {
    if (!user || !id) return;
    let cancelled = false;
    void warmUpSpeech();
    getConversationSession(user.uid, id)
      .then((s) => {
        if (cancelled) return;
        if (!s) {
          setMissing(true);
        } else if (s.status === "completed") {
          router.replace(`/conversation/${id}/report`);
        } else {
          messagesRef.current = s.messages;
          goalsDoneRef.current = s.goalsDone;
          summaryRef.current = s.summary;
          summarizedRef.current = s.summarizedCount;
          setMessages(s.messages);
          setGoalsDone(s.goalsDone);
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

  const persist = useCallback(
    (patch: ConversationProgress) => {
      if (user && id) void saveConversationProgress(user.uid, id, patch).catch(() => {});
    },
    [user, id]
  );

  const appendMessage = useCallback(
    (message: ConversationMessage, extra: ConversationProgress = {}) => {
      const next = [...messagesRef.current, message];
      messagesRef.current = next;
      setMessages(next);
      persist({ messages: next, ...extra });
    },
    [persist]
  );

  // Call right BEFORE appending a user message: keys its pending voice blobs
  // by the index that message is about to take, then resets the pending list.
  const commitPendingRecordings = useCallback(() => {
    if (id && pendingBlobsRef.current.length > 0) {
      saveRecordings(conversationRecordingKey(id, messagesRef.current.length), pendingBlobsRef.current);
    }
    pendingBlobsRef.current = [];
  }, [id]);

  // Background: folds old messages into the rolling summary. Failure is
  // ignored — later turns just send more history until a condense succeeds.
  const maybeCondense = useCallback(() => {
    if (!settings || condensingRef.current) return;
    const plan = planCondense(messagesRef.current, summarizedRef.current);
    if (!plan) return;
    condensingRef.current = true;
    void (async () => {
      try {
        const summary = parseCondense(
          await callInterviewAi(settings, buildCondensePrompt({ previousSummary: summaryRef.current, messages: plan.toFold }))
        );
        summaryRef.current = summary;
        summarizedRef.current = plan.newCount;
        persist({ summary, summarizedCount: plan.newCount });
      } catch {
        // ignored on purpose
      } finally {
        condensingRef.current = false;
      }
    })();
  }, [settings, persist]);

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
        const existing = messagesRef.current;
        if (existing.length > 0) {
          const lastIsUser = existing[existing.length - 1].role === "user";
          const turns = userTurnCount(existing);
          dispatch({ type: "RESUME", userTurns: turns, needsReply: lastIsUser });
          // The conversation already ended on the AI's closing line: go straight
          // to grading instead of letting the learner continue a finished chat.
          if (!lastIsUser && (turns >= MAX_USER_TURNS || isScenarioComplete(session.setup.goals, goalsDoneRef.current))) {
            dispatch({ type: "END" });
          }
          return;
        }
        void (async () => {
          try {
            const { say, vi } = parseOpening(await callInterviewAi(settings, buildOpeningPrompt(session.setup)));
            if (handledRef.current !== state) return;
            appendMessage({ role: "ai", text: say, ...(vi ? { vi } : {}) });
            dispatch({ type: "OPENING_READY" });
          } catch (err) {
            if (handledRef.current !== state) return;
            setOpeningError(err instanceof InterviewAiError ? err.message : null);
            dispatch({ type: "OPENING_FAILED" });
          }
        })();
        return;
      }
      case "aiSpeaking": {
        const last = messagesRef.current[messagesRef.current.length - 1];
        if (!session.setup.speakAloud || !last || last.role !== "ai") {
          if (state.final) {
            // Give the learner a moment to read the closing line before grading
            // replaces the screen.
            setTimeout(() => {
              if (handledRef.current !== state) return;
              dispatch({ type: "SPEECH_ENDED" });
            }, 2500);
            return;
          }
          dispatch({ type: "SPEECH_ENDED" });
          return;
        }
        void (async () => {
          const ok = await audio.speak(last.text);
          if (handledRef.current !== state) return;
          dispatch({ type: "SPEECH_ENDED", ttsFailed: !ok });
        })();
        return;
      }
      case "transcribing": {
        const review = session.setup.reviewTranscript;
        void (async () => {
          const rec = recordingRef.current;
          if (!rec) {
            if (handledRef.current !== state) return;
            dispatch({ type: "TRANSCRIBED", text: "", review });
            return;
          }
          try {
            const lastAi = [...messagesRef.current].reverse().find((m) => m.role === "ai")?.text ?? "";
            const text = await transcribeAudio(rec.blob, {
              prompt: conversationSttPrompt(session.setup, lastAi),
            });
            if (handledRef.current !== state) return;
            if (text.trim()) pendingBlobsRef.current = [...pendingBlobsRef.current, rec.blob];
            if (!review && text.trim()) {
              // Persist the user's message BEFORE the AI call, so a failure
              // can never lose what they said.
              commitPendingRecordings();
              appendMessage({ role: "user", text: joinSegments(state.segments, text) });
              recordingRef.current = null;
              setSuggestions(null);
            }
            dispatch({ type: "TRANSCRIBED", text, review });
          } catch {
            if (handledRef.current !== state) return;
            dispatch({ type: "TRANSCRIBE_FAILED" });
          }
        })();
        return;
      }
      case "aiThinking": {
        void (async () => {
          const flags = replyFlags(session.setup.mode, state.userTurns);
          try {
            const raw = await callInterviewAi(
              settings,
              buildReplyPrompt({
                setup: session.setup,
                summary: summaryRef.current,
                window: unsummarizedWindow(messagesRef.current, summarizedRef.current),
                goalsDone: goalsDoneRef.current,
                ...flags,
              })
            );
            if (handledRef.current !== state) return;
            const reply = parseReply(raw, session.setup.goals.length);
            const merged = [...new Set([...goalsDoneRef.current, ...reply.goalsDone])].sort((a, b) => a - b);
            goalsDoneRef.current = merged;
            setGoalsDone(merged);
            appendMessage({ role: "ai", text: reply.say, ...(reply.vi ? { vi: reply.vi } : {}) }, { goalsDone: merged });
            const final = flags.mustClose || isScenarioComplete(session.setup.goals, merged);
            const suggestEnd = session.setup.mode === "topic" && (reply.suggestEnd || flags.offerEnd);
            dispatch({ type: "REPLY_RECEIVED", final, suggestEnd });
            maybeCondense();
          } catch {
            if (handledRef.current !== state) return;
            dispatch({ type: "REPLY_FAILED" });
          }
        })();
        return;
      }
      case "grading": {
        void (async () => {
          const finalMessages = messagesRef.current;
          const userIndexes = userMessageIndexes(finalMessages);
          if (userIndexes.length === 0) {
            await deleteConversationSession(uid, id).catch(() => {});
            if (unmountedRef.current) return;
            router.push("/conversation");
            return;
          }
          let report: ConversationReport | null = null;
          try {
            report = parseConversationReport(
              await callInterviewAi(
                settings,
                buildConversationReportPrompt(session.setup, summaryRef.current, finalMessages, goalsDoneRef.current)
              ),
              userIndexes,
              session.setup.mode === "roleplay"
            );
          } catch {
            report = null;
          }
          await saveConversationProgress(uid, id, { messages: finalMessages, goalsDone: goalsDoneRef.current }).catch(() => {});
          await completeConversationSession(uid, id, report).catch(() => {});
          if (unmountedRef.current) return;
          router.push(`/conversation/${id}/report`);
        })();
        return;
      }
      default:
        return;
    }
  }, [state, session, settings, user, id, audio, appendMessage, commitPendingRecordings, maybeCondense, router]);

  const handleStop = useCallback(async () => {
    if (stoppingRef.current) return;
    stoppingRef.current = true;
    const rec = await stopRecorder();
    if (!rec) {
      stoppingRef.current = false;
      return;
    }
    recordingRef.current = rec;
    dispatch({ type: "STOP_RECORDING" });
    stoppingRef.current = false;
  }, [stopRecorder]);

  useEffect(() => {
    if (state.phase === "recording" && elapsed >= MAX_ANSWER_SECONDS) void handleStop();
  }, [state.phase, elapsed, handleStop]);

  if (authLoading || (user && !resolved)) return <p>Đang tải…</p>;
  if (!user) {
    return (
      <div>
        <h2 className="scr-title">Hội thoại tiếng Anh</h2>
        <p className="scr-sub">Đăng nhập để tiếp tục.</p>
        <SignInButton />
      </div>
    );
  }
  if (missing) {
    return (
      <div>
        <h2 className="scr-title">Không tìm thấy buổi trò chuyện</h2>
        <button type="button" className="btn-secondary" onClick={() => router.push("/conversation")}>Về trang Hội thoại</button>
      </div>
    );
  }
  if (!session) return <p>Đang tải…</p>;
  if (state.phase === "grading") {
    return (
      <div className="iv-grading" role="status">
        <h2 className="scr-title">Đang chấm bài…</h2>
        <p className="scr-sub">AI đang đọc lại cuộc trò chuyện của bạn. Thường mất 10–30 giây.</p>
      </div>
    );
  }

  const setup = session.setup;

  async function handleStart() {
    audio.stop();
    const ok = await startRecorder();
    if (!ok) return;
    if (!RECORDING_START_PHASES.has(phaseRef.current)) {
      // The session moved on while the mic prompt was pending: release the mic.
      cancelRecorder();
      return;
    }
    // Re-recording from review discards the previous transcript (the reducer
    // clears the draft), so its blob must not be kept either.
    if (phaseRef.current === "review") pendingBlobsRef.current = pendingBlobsRef.current.slice(0, -1);
    dispatch({ type: "START_RECORDING" });
  }

  function handleCancelRecording() {
    cancelRecorder();
    // cancel() nulls recorder.onstop, so a pending stop would never clear this.
    stoppingRef.current = false;
    recordingRef.current = null;
    dispatch({ type: "CANCEL_RECORDING" });
  }

  function handleSend() {
    // Same rule the reducer uses for SEND, so a double-click can never append
    // a user message that the reducer then ignores (which would break the
    // one-user-message-one-AI-reply alternation).
    if (!canSend(state)) return;
    const text = joinSegments(state.segments, state.draft);
    audio.stop();
    commitPendingRecordings();
    appendMessage({ role: "user", text });
    recordingRef.current = null;
    setSuggestions(null);
    dispatch({ type: "SEND" });
  }

  function handleEnd() {
    audio.stop();
    cancelRecorder();
    stoppingRef.current = false;
    const flushPhases: ConversationState["phase"][] = ["idle", "review", "recording", "sttError", "transcribing"];
    if (flushPhases.includes(state.phase)) {
      // Only idle/review hold a live draft; in the other phases the typed draft
      // has already been moved into `segments`.
      const draft = state.phase === "idle" || state.phase === "review" ? state.draft : "";
      const text = joinSegments(state.segments, draft);
      if (text) {
        commitPendingRecordings();
        appendMessage({ role: "user", text });
      }
    }
    pendingBlobsRef.current = [];
    recordingRef.current = null;
    setSuggestions(null);
    dispatch({ type: "END" });
  }

  function handleReplay(index: number) {
    const m = messagesRef.current[index];
    if (!m) return;
    audio.stop();
    void audio.speak(m.text);
  }

  async function handleTranslate(index: number) {
    const m = messagesRef.current[index];
    if (!m || translations[index]) return;
    if (m.vi) {
      setTranslations((t) => ({ ...t, [index]: m.vi as string }));
      return;
    }
    if (!settings) return;
    setTranslatingIndex(index);
    setHelperError(null);
    try {
      const vi = parseConversationTranslation(await callInterviewAi(settings, buildConversationTranslatePrompt(m.text)));
      setTranslations((t) => ({ ...t, [index]: vi }));
      // Persist so the next click (and later visits) is instant.
      const next = messagesRef.current.map((x, i) => (i === index ? { ...x, vi } : x));
      messagesRef.current = next;
      setMessages(next);
      persist({ messages: next });
    } catch {
      setHelperError("Không dịch được — thử lại sau.");
    }
    setTranslatingIndex(null);
  }

  async function handleHint(index: number) {
    const m = messagesRef.current[index];
    if (!m || m.role !== "user" || m.hint || !settings) return;
    setHintLoadingIndex(index);
    setHelperError(null);
    try {
      const previousAi = [...messagesRef.current.slice(0, index)].reverse().find((x) => x.role === "ai")?.text ?? "";
      const hint = parseHint(await callInterviewAi(settings, buildHintPrompt({ setup, userText: m.text, previousAi })));
      const next = messagesRef.current.map((x, i) => (i === index ? { ...x, hint } : x));
      messagesRef.current = next;
      setMessages(next);
      persist({ messages: next });
    } catch {
      setHelperError("Không lấy được gợi ý sửa — bấm lại để thử.");
    }
    setHintLoadingIndex(null);
  }

  async function handleSuggest() {
    if (!settings) return;
    setSuggesting(true);
    setHelperError(null);
    const countBefore = messagesRef.current.length;
    try {
      const currentGoal = setup.goals.find((_, i) => !goalsDoneRef.current.includes(i)) ?? null;
      const options = parseSuggest(
        await callInterviewAi(
          settings,
          buildSuggestPrompt({ setup, currentGoal, summary: summaryRef.current, window: messagesRef.current.slice(-4) })
        )
      );
      // A message was sent while this was in flight: the options are stale.
      if (messagesRef.current.length === countBefore) setSuggestions(options);
    } catch {
      setHelperError("Không gợi ý được — bấm lại để thử.");
    }
    setSuggesting(false);
  }

  const canReplay = state.phase === "idle" || state.phase === "review";
  // Unsent takes the learner can hear before sending. The refs are always
  // mutated BEFORE the dispatch that triggers the re-render reading them.
  let listenBlobs: Blob[] = [];
  if (state.phase === "sttError") {
    listenBlobs = recordingRef.current ? [...pendingBlobsRef.current, recordingRef.current.blob] : [...pendingBlobsRef.current];
  } else if (state.phase === "review" || state.phase === "idle") {
    listenBlobs = pendingBlobsRef.current;
  }
  const roleplay = setup.mode === "roleplay";

  return (
    <div className="iv-session">
      <header className="iv-session-head">
        <button type="button" className="btn-secondary" onClick={handleEnd} disabled={state.phase === "transcribing"}>
          Kết thúc &amp; xem báo cáo
        </button>
        <div className="iv-session-title">
          <strong>{`${setup.topic} · ${setup.level}`}</strong>
          <span className="iv-muted">{`${roleplay ? "Nhập vai" : "Chủ đề tự do"} · Lượt ${state.userTurns} / ${MAX_USER_TURNS}`}</span>
        </div>
      </header>

      <div className="iv-session-body">
        <div className="cv-main">
          <ChatThread
            messages={messages}
            thinking={state.phase === "aiThinking"}
            hintLoadingIndex={hintLoadingIndex}
            translations={translations}
            translatingIndex={translatingIndex}
            canReplay={canReplay}
            onReplay={handleReplay}
            onTranslate={(i) => void handleTranslate(i)}
            onHint={(i) => void handleHint(i)}
            recordingKeyFor={(i) => conversationRecordingKey(session.id, i)}
          />
          {helperError && <p className="iv-error" role="alert">{helperError}</p>}
          {state.wrapUpOffered && !roleplay && state.phase === "idle" && (
            <div className="cv-wrapup" role="status">
              <span>Bạn đã trò chuyện khá lâu — kết thúc và xem báo cáo?</span>
              <button type="button" className="btn-primary" onClick={handleEnd}>Kết thúc</button>
              <button type="button" className="btn-secondary" onClick={() => dispatch({ type: "DISMISS_WRAP_UP" })}>Nói tiếp</button>
            </div>
          )}
        </div>
        {roleplay && (
          <aside className="iv-session-side">
            <GoalChecklist persona={setup.persona} goals={setup.goals} goalsDone={goalsDone} />
          </aside>
        )}
      </div>

      <Composer
        state={state}
        elapsed={elapsed}
        micError={micError === "denied"}
        suggestions={suggestions}
        suggesting={suggesting}
        openingError={openingError ?? undefined}
        listenBlobs={listenBlobs}
        onEditDraft={(text) => dispatch({ type: "EDIT_DRAFT", text })}
        onSend={handleSend}
        onAddSegment={() => dispatch({ type: "ADD_SEGMENT" })}
        onStart={() => void handleStart()}
        onStop={() => void handleStop()}
        onRetryTranscribe={() => dispatch({ type: "RETRY_TRANSCRIBE" })}
        onCancelRecording={handleCancelRecording}
        onDismissSttError={() => {
          recordingRef.current = null;
          dispatch({ type: "DISMISS_STT_ERROR" });
        }}
        onSuggest={() => void handleSuggest()}
        onPickSuggestion={(text) => {
          dispatch({ type: "EDIT_DRAFT", text });
          setSuggestions(null);
        }}
        onCloseSuggestions={() => setSuggestions(null)}
        onRetryReply={() => dispatch({ type: "RETRY_REPLY" })}
        onRetryOpening={() => dispatch({ type: "RETRY_OPENING" })}
        onSkipSpeech={() => {
          dispatch({ type: "SPEECH_ENDED" });
          audio.stop();
        }}
      />
    </div>
  );
}
