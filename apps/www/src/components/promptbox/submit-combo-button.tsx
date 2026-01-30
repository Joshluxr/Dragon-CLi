import { useState } from "react";
import { SendButton, SendComboButton, TSubmitForm } from "./send-button";
import { StopButton } from "./stop-button";
import { SpeechToTextButton } from "./speech-to-text-button";

export function SubmitComboButton({
  onTranscript,
  isSubmitting,
  submitForm,
  handleStop,
  disabled,
  className,
  showStopButton,
  hideSubmitButton,
  initialIsProcessingAudio,
  initialIsRecording,
  onRecordingChange,
  supportSaveAsDraft,
  supportSchedule,
  hideVoiceInput = false,
}: {
  onTranscript: (transcript: string) => void;
  isSubmitting: boolean;
  submitForm: TSubmitForm;
  handleStop: () => void;
  disabled: boolean;
  className?: string;
  showStopButton: boolean;
  hideSubmitButton: boolean;
  initialIsProcessingAudio?: boolean;
  initialIsRecording?: boolean;
  onRecordingChange?: (isRecording: boolean) => void;
  supportSaveAsDraft: boolean;
  supportSchedule?: boolean;
  hideVoiceInput?: boolean;
}) {
  const [isProcessingAudio, setIsProcessingAudio] = useState(
    initialIsProcessingAudio ?? false,
  );
  const [isRecording, setIsRecording] = useState(initialIsRecording ?? false);

  const handleRecordingChange = (recording: boolean) => {
    setIsRecording(recording);
    onRecordingChange?.(recording);
  };

  return (
    <>
      {!hideVoiceInput && !isProcessingAudio && (
        <SpeechToTextButton
          onProcessing={setIsProcessingAudio}
          onTranscript={onTranscript}
          onRecordingChange={handleRecordingChange}
          initialIsRecording={initialIsRecording}
        />
      )}
      {showStopButton && !isRecording && !isProcessingAudio ? (
        <StopButton handleStop={handleStop} disabled={isSubmitting} />
      ) : isProcessingAudio || !hideSubmitButton ? (
        supportSaveAsDraft || supportSchedule ? (
          <SendComboButton
            isProcessingAudio={isProcessingAudio}
            isSubmitting={isSubmitting}
            submitForm={submitForm}
            disabled={disabled || isProcessingAudio || isRecording}
            className={className}
            supportSaveAsDraft={supportSaveAsDraft}
            supportSchedule={supportSchedule}
          />
        ) : (
          <SendButton
            isProcessingAudio={isProcessingAudio}
            isSubmitting={isSubmitting}
            submitForm={submitForm}
            disabled={disabled || isProcessingAudio || isRecording}
            className={className}
          />
        )
      ) : null}
    </>
  );
}
